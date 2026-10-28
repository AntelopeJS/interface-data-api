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
import { type DataAPIMeta, FilterValuesOf } from "../metadata";
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

function listResultTuple<T extends Record<string, any>>(
  tmpRequest: Stream<T>,
  total: Datum<number>,
  meta: DataAPIMeta,
  joinedSplit: JoinedFieldSplit,
  db?: SchemaInstance<any>,
  options?: ListOptions,
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
  const indexFilter = filterList.find(([name]) => {
    const values = filters ? FilterValuesOf(filters[name]) : [];
    return (
      values.length === 1 &&
      values[0][1] === "eq" &&
      meta.fields[name]?.indexable
    );
  })?.[0];
  const index = indexFilter
    ? meta.fields[indexFilter].dbName || indexFilter
    : undefined;
  const indexedFilter = indexFilter
    ? FilterValuesOf(filters?.[indexFilter] ?? [])[0]
    : undefined;

  let tmpRequest: Stream<T> = index
    ? request.getAll(indexedFilter?.[0] ?? "", index)
    : request;

  const joinedSplit = splitJoinedFields(meta, sorting, filters);
  if (db && joinedSplit.filter.size > 0) {
    tmpRequest = Joined(db, meta, tmpRequest, joinedSplit.filter);
  }

  const filteredComputed = new Set(
    filterList
      .map(([name]) => name)
      .filter((name) => meta.fields[name]?.computed),
  );
  if (db && filteredComputed.size > 0) {
    tmpRequest = Computed(db, meta, tmpRequest, filteredComputed);
  }

  const sortField = sorting?.[0];
  const shouldSort = sortField ? meta.fields[sortField]?.sortable : undefined;
  const isModifiedSort =
    !!shouldSort && !!sortField && isHeldByKeyedModifier(meta, sortField);
  if (shouldSort?.indexed && sortField && !isModifiedSort) {
    tmpRequest = tmpRequest.orderBy(sortField, sorting?.[1] ?? "asc");
  }
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
              row as ValueProxy<Record<string, any>>,
            ),
          ),
        req,
      );
    }, tmpRequest);
  }
  const total = tmpRequest.count();
  if (db && joinedSplit.sort.size > 0) {
    tmpRequest = Joined(db, meta, tmpRequest, joinedSplit.sort);
  }
  if (
    db &&
    sortField &&
    meta.fields[sortField]?.computed &&
    !filteredComputed.has(sortField)
  ) {
    tmpRequest = Computed(db, meta, tmpRequest, new Set([sortField]));
  }
  if (isModifiedSort && sortField) {
    tmpRequest = (tmpRequest as unknown as Stream<Record<string, any>>)
      .map((row) =>
        row.merge({
          [MODIFIED_SORT_KEY]: UnlockRequest(obj, meta, row, sortField),
        }),
      )
      .orderBy(MODIFIED_SORT_KEY, sorting?.[1] ?? "asc")
      .without(MODIFIED_SORT_KEY) as unknown as Stream<T>;
  } else if (shouldSort && !shouldSort.indexed && sortField) {
    tmpRequest = tmpRequest.orderBy(sortField, sorting?.[1] ?? "asc");
  }
  return listResultTuple(tmpRequest, total, meta, joinedSplit, db, options);
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
