/** @internal @packageDocumentation */

import { getMetadata } from "@antelopejs/interface-database-decorators/common";
import type { RequestContext } from "@antelopejs/interface-api";
import type {
  Datum,
  SchemaInstance,
  Stream,
  Table,
  ValueProxy,
} from "@antelopejs/interface-database";
import { ModifiersStaticMetadata } from "@antelopejs/interface-database-decorators/modifiers/common";

import type { Query } from "../components";
import {
  type DataAPIMeta,
  type FieldFilter,
  FilterValuesOf,
} from "../metadata";
import { Computed } from "./computed";
import { wrapDeferredJoined } from "./deferred-joined-stream";
import { Foreign } from "./foreign";
import {
  deferredJoinedFields,
  Joined,
  type JoinedFieldSplit,
  splitJoinedFields,
} from "./joined";
import { UnlockRequest } from "./validation";

type ListOptions = Query.ListOptions;
type ListPageOptions = Query.ListPageOptions;

/** The arguments {@link Query.List} takes after the request context. */
interface ListArguments {
  sorting?: Parameters<typeof Query.List>[4];
  filters?: Parameters<typeof Query.List>[5];
  db?: Parameters<typeof Query.List>[6];
  options?: Parameters<typeof Query.List>[7];
}

/** Where {@link List} may resolve the joined fields it deferred. */
interface DeferralContext {
  db?: SchemaInstance<any>;
  options?: ListOptions;
}

function listResultTuple<T extends Record<string, any>>(
  tmpRequest: Stream<T>,
  total: Datum<number>,
  meta: DataAPIMeta,
  joinedSplit: JoinedFieldSplit,
  { db, options }: DeferralContext,
): [sorted: Stream<T>, total: Datum<number>, deferredJoined: Set<string>] {
  const deferredJoined = deferredJoinedFields(meta, joinedSplit);
  if (options?.exposeDeferredJoined || !db || deferredJoined.size === 0) {
    return [tmpRequest, total, deferredJoined];
  }
  return [
    wrapDeferredJoined(db, meta, deferredJoined, tmpRequest),
    total,
    new Set(),
  ];
}

/** Where a list sorted on a modifier-held field keeps the value it sorts on. */
const MODIFIED_SORT_KEY = "__dataApiSortValue";

/**
 * Whether a field is held by a modifier the controller keys (a localized
 * field read in the request's locale): stored under the modifier, it sorts
 * on the value the request reads, not on the stored field.
 */
function isHeldByKeyedModifier(meta: DataAPIMeta, field: string): boolean {
  const keyed = new Set(
    Array.from(meta.modifierKeys.keys(), (modifier) => modifier.name),
  );
  return (
    getMetadata(meta.tableClass, ModifiersStaticMetadata).fields[field]?.some(
      ({ id }) => keyed.has(id),
    ) ?? false
  );
}

type FilterEntries = Array<
  [name: string, filter: DataAPIMeta["filters"][string]]
>;
type ListSorting = ListArguments["sorting"];

/** The row a filter reads and a modified sort merges into. */
type FilterRow = Parameters<DataAPIMeta["filters"][string]>[5];
type FilterRowValue = FilterRow extends ValueProxy<infer Row> ? Row : never;

/** The filters a request holds for a field, none when it holds none. */
function filterValuesIn(
  filters: Record<string, FieldFilter> | undefined,
  field: string,
) {
  return filters && Object.hasOwn(filters, field)
    ? FilterValuesOf(filters[field])
    : [];
}

/**
 * The rows {@link List} starts from: the index lookup serving the one field
 * filtered once with `eq` on a single-field index, else the whole table.
 */
function indexedSource<T extends Record<string, any>>(
  meta: DataAPIMeta,
  request: Table<T>,
  filterList: FilterEntries,
  filters?: Record<string, FieldFilter>,
) {
  const indexed = filterList.find(([field]) => {
    const fieldFilters = filterValuesIn(filters, field);
    return (
      fieldFilters.length === 1 &&
      fieldFilters[0][1] === "eq" &&
      meta.fields[field]?.indexable
    );
  })?.[0];
  const indexName = indexed
    ? meta.fields[indexed].dbName || indexed
    : undefined;
  const equality = indexed ? filterValuesIn(filters, indexed)[0] : undefined;
  const source: Stream<T> = indexName
    ? request.getAll(equality?.[0] ?? "", indexName)
    : request;
  return { indexFilter: indexed, source };
}

/**
 * Merges the joined and computed fields the filters read, before
 * {@link List} filters and counts.
 */
function materializeFilterFields<T extends Record<string, any>>(
  source: Stream<T>,
  meta: DataAPIMeta,
  db: SchemaInstance<any> | undefined,
  joinedSplit: JoinedFieldSplit,
  { filterList }: { filterList: FilterEntries },
) {
  const joined =
    db && joinedSplit.filter.size > 0
      ? Joined(db, meta, source, joinedSplit.filter)
      : source;
  const filteredComputed = new Set(
    filterList
      .map(([field]) => field)
      .filter((field) => meta.fields[field]?.computed),
  );
  const stream: Stream<T> =
    db && filteredComputed.size > 0
      ? Computed(db, meta, joined, filteredComputed)
      : joined;
  return { stream, filteredComputed };
}

/** The field a list request sorts on, how, and whether a modifier holds it. */
function sortPlan(meta: DataAPIMeta, sorting: ListSorting) {
  const sortField = sorting?.[0];
  const shouldSort = sortField ? meta.fields[sortField]?.sortable : undefined;
  const isModifiedSort =
    !!shouldSort && !!sortField && isHeldByKeyedModifier(meta, sortField);
  return { sortField, shouldSort, isModifiedSort };
}

/** Sorts on an indexed field before the filters, when the plan allows it. */
function orderedByIndex<T extends Record<string, any>>(
  stream: Stream<T>,
  { sortField, shouldSort, isModifiedSort }: ReturnType<typeof sortPlan>,
  sorting: ListSorting,
): Stream<T> {
  if (shouldSort?.indexed && sortField && !isModifiedSort) {
    return stream.orderBy(sortField, sorting?.[1] ?? "asc");
  }
  return stream;
}

/** What {@link List} merges after the count. */
interface SortFieldsContext {
  db?: SchemaInstance<any>;
  meta: DataAPIMeta;
  joinedSplit: JoinedFieldSplit;
  filteredComputed: Set<string>;
}

/**
 * Merges the joined fields the sort reads, then a computed sort field no
 * filter already merged, after {@link List} counts.
 */
function materializeSortFields<T extends Record<string, any>>(
  stream: Stream<T>,
  sortField: string | undefined,
  { db, meta, joinedSplit, filteredComputed }: SortFieldsContext,
): Stream<T> {
  if (!db) return stream;
  const joined: Stream<T> =
    joinedSplit.sort.size > 0
      ? Joined(db, meta, stream, joinedSplit.sort)
      : stream;
  const sortsOnComputed =
    !!sortField &&
    !!meta.fields[sortField]?.computed &&
    !filteredComputed.has(sortField);
  return sortsOnComputed
    ? Computed(db, meta, joined, new Set([sortField]))
    : joined;
}

export function List<T extends Record<string, any>>(
  obj: any,
  meta: DataAPIMeta,
  request: Table<T>,
  reqCtx: RequestContext,
  { sorting, filters, db, options }: ListArguments,
): [sorted: Stream<T>, total: Datum<number>, deferredJoined: Set<string>] {
  const filterList = Object.entries(meta.filters).filter(
    ([name]) => filters && name in filters,
  );
  const { indexFilter, source } = indexedSource(
    meta,
    request,
    filterList,
    filters,
  );
  const joinedSplit = splitJoinedFields(meta, sorting, filters);
  const filtering = materializeFilterFields(source, meta, db, joinedSplit, {
    filterList,
  });
  const plan = sortPlan(meta, sorting);
  const { sortField, shouldSort, isModifiedSort } = plan;
  let tmpRequest = orderedByIndex(filtering.stream, plan, sorting);
  if (filterList.length > 0) {
    tmpRequest = filterList.reduce((req, [name, filter]) => {
      const fieldFilter = filters?.[name];
      if (!fieldFilter || name === indexFilter) return req;
      return FilterValuesOf(fieldFilter).reduce(
        (filtered, [value, mode]) =>
          filtered.filter((row) =>
            filter(
              Object.assign(reqCtx, { this: obj }),
              UnlockRequest(obj, meta, row, name),
              name,
              value,
              mode,
              row.cast<FilterRowValue>(),
            ),
          ),
        req,
      );
    }, tmpRequest);
  }
  const total = tmpRequest.count();
  tmpRequest = materializeSortFields(tmpRequest, sortField, {
    db,
    meta,
    joinedSplit,
    filteredComputed: filtering.filteredComputed,
  });
  if (isModifiedSort && sortField) {
    tmpRequest = tmpRequest
      .cast<FilterRowValue>()
      .map((row) =>
        row.merge({
          [MODIFIED_SORT_KEY]: UnlockRequest(obj, meta, row, sortField),
        }),
      )
      .orderBy(MODIFIED_SORT_KEY, sorting?.[1] ?? "asc")
      .without(MODIFIED_SORT_KEY)
      .cast<T>();
  } else if (shouldSort && !shouldSort.indexed && sortField) {
    tmpRequest = tmpRequest.orderBy(sortField, sorting?.[1] ?? "asc");
  }
  return listResultTuple(tmpRequest, total, meta, joinedSplit, {
    db,
    options,
  });
}

function pageComputedFields(
  meta: DataAPIMeta,
  options: ListPageOptions,
): Set<string> {
  const merged = new Set(
    Object.keys(options.filters ?? {}).filter((name) => name in meta.filters),
  );
  if (options.sortKey) merged.add(options.sortKey);
  const names = Object.entries(meta.fields)
    .filter(
      ([name, field]) =>
        field.computed &&
        !merged.has(name) &&
        (!options.pluck || options.pluck.has(name)),
    )
    .map(([name]) => name);
  return new Set(names);
}

function pageJoinedFields(
  options: ListPageOptions,
  materializeAll: boolean,
): Set<string> {
  const deferred = options.deferredJoined ?? new Set<string>();
  if (materializeAll || !options.pluck) return deferred;
  const pluck = options.pluck;
  return new Set(Array.from(deferred).filter((name) => pluck.has(name)));
}

export function ListPage(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any>,
  options: ListPageOptions,
): Stream<any> {
  let page = query.slice(options.offset, options.limit);
  const computed = pageComputedFields(meta, options);
  const joined = pageJoinedFields(options, computed.size > 0);
  if (joined.size > 0) page = Joined(db, meta, page, joined);
  if (computed.size > 0) page = Computed(db, meta, page, computed);
  if (!options.noForeign) page = Foreign(db, meta, page, options.pluck);
  return options.pluck ? page.pluck("_internal", ...options.pluck) : page;
}
