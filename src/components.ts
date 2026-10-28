import { assert } from "@antelopejs/interface-api-util";
import type { DataModel } from "@antelopejs/interface-database-decorators/model";
import {
  type Constructible,
  getMetadata,
} from "@antelopejs/interface-database-decorators/common";
import { MakeParameterAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  type computeParameter,
  HTTPResult,
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import {
  type Datum,
  IsStream,
  type SchemaInstance,
  Stream,
  type Table,
  type ValueProxy,
} from "@antelopejs/interface-database";
import type { TableClass } from "@antelopejs/interface-database-decorators/table";
import {
  fromDatabase,
  lock,
  ModifiersDynamicMetadata,
  ModifiersStaticMetadata,
  toPlainData,
  unlock,
  unlockrequest,
} from "@antelopejs/interface-database-decorators/modifiers/common";

import {
  type ComputedFieldData,
  type DataAPIMeta,
  type FieldFilter,
  type FieldParseResult,
  type FieldValidationResult,
  type FieldValidator,
  type FilterValue,
  FilterValuesOf,
  type ForeignJoinedRef,
  GetDataControllerMeta,
  type WritableAccessFields,
} from "./metadata";

export namespace Parameters {
  /** The controller a parameter provider computes its parameter for. */
  type Owner = Parameters<typeof computeParameter>[2];

  export function GetOptionOverrides<T extends Record<string, any>>(
    reqCtx: RequestContext,
  ): T {
    return (<any>reqCtx).dataAPIEntry?.options ?? {};
  }

  function parseFilter(searchVal: string): FilterValue {
    const match = searchVal.match(/([^:]+):(.*)/);
    return match ? [match[2], match[1] as FilterValue[1]] : [searchVal, "eq"];
  }

  function copyFilter(filter: FieldFilter): FieldFilter {
    const copies = FilterValuesOf(filter).map((value): FilterValue => [
      ...value,
    ]);
    return copies.length === 1 ? copies[0] : copies;
  }

  /**
   * Extracts request filters and mandatory route filters, with route field
   * keys winning. A field the request filters once (`?filter_status=open`)
   * gets one {@link FilterValue}; one it filters several times
   * (`?filter_age=ge:18&filter_age=lt:65`) gets them all, which a row must
   * all pass. Returns fresh tuples.
   */
  export function ExtractFilters(reqCtx: RequestContext, meta: DataAPIMeta) {
    const result: Record<string, FieldFilter> = {};
    for (const filter of Object.keys(meta.filters)) {
      const values = reqCtx.url.searchParams
        .getAll(`filter_${filter}`)
        .map(parseFilter);
      if (values.length > 0) {
        result[filter] = values.length === 1 ? values[0] : values;
      }
    }
    const overrides = GetOptionOverrides<ListParameters>(reqCtx);
    for (const [key, value] of Object.entries(overrides.filters ?? {})) {
      result[key] = copyFilter(value);
    }
    return result;
  }

  const converters = {
    number: (val: string) => parseFloat(val),
    int: (val: string) => parseInt(val, 10),
    bool: (val: string) => val !== "0",
    string: (val: string) => val,
  };
  type ConvertersKey = keyof typeof converters;
  type GenericParams<T extends Record<string, any>> = {
    [K in keyof T]:
      | ConvertersKey
      | `multi:${ConvertersKey}`
      | ((reqCtx: RequestContext, meta: DataAPIMeta) => any);
  };
  export function ExtractGeneric<T extends Record<string, any>>(
    reqCtx: RequestContext,
    meta: DataAPIMeta,
    dynamic: GenericParams<Partial<T>>,
  ) {
    const overrides = GetOptionOverrides<T>(reqCtx);
    const result: Partial<T> = { ...overrides };
    for (const key of Object.keys(dynamic)) {
      if (!(key in result) || dynamic[key] === ExtractFilters) {
        const extractor = dynamic[key];
        if (typeof extractor === "string") {
          if (extractor.startsWith("multi:")) {
            const converter = converters[<ConvertersKey>extractor.substring(6)];
            result[key as keyof T] = reqCtx.url.searchParams
              .getAll(key)
              .map((searchVal) => converter(searchVal)) as any;
          } else {
            const searchVal = reqCtx.url.searchParams.get(key);
            if (searchVal !== null) {
              result[key as keyof T] = converters[<ConvertersKey>extractor](
                searchVal,
              ) as any;
            }
          }
        } else {
          result[key as keyof T] = extractor(reqCtx, meta);
        }
      }
    }
    return result;
  }

  export interface ListParameters {
    /**
     * The filters of the request, by field; a row passes every filter of
     * every field. Mandatory route filters when supplied through
     * WithOptions, combined with request filters by field key.
     */
    filters?: Record<string, FieldFilter>;

    offset?: number;
    limit?: number;

    sortKey?: string;
    sortDirection?: "asc" | "desc";

    maxPage?: number;
    noForeign?: boolean;
    noPluck?: boolean;

    pluckMode?: string;
  }

  export const List = MakeParameterAndPropertyDecorator((target, key, param) =>
    SetParameterProvider(target, key, param, function (this: Owner, context) {
      const meta = GetDataControllerMeta(this);
      const params = ExtractGeneric<ListParameters>(context, meta, {
        filters: ExtractFilters,
        offset: "int",
        limit: "int",
        sortKey: "string",
        sortDirection: "string",
      });

      assert(
        !params.sortKey || meta.fields[params.sortKey]?.sortable,
        400,
        "Field is not sortable.",
      );
      params.limit = params.limit
        ? Math.min(params.limit, params.maxPage ?? 100)
        : params.maxPage;

      return params;
    }),
  );

  export interface GetParameters {
    id: string;
    index?: string;
    noForeign?: string;
  }

  export const Get = MakeParameterAndPropertyDecorator((target, key, param) =>
    SetParameterProvider(target, key, param, function (this: Owner, context) {
      const params = ExtractGeneric<GetParameters>(
        context,
        GetDataControllerMeta(this),
        {
          id: "string",
        },
      );

      assert(params.id && typeof params.id === "string", 400, "Missing id.");

      return params;
    }),
  );

  export interface NewParameters {
    noMandatory?: string;
  }

  export const New = MakeParameterAndPropertyDecorator((target, key, param) =>
    SetParameterProvider(target, key, param, function (this: Owner, context) {
      const params = ExtractGeneric<NewParameters>(
        context,
        GetDataControllerMeta(this),
        {},
      );

      return params;
    }),
  );

  export interface EditParameters {
    id: string;
    index?: string;
    noMandatory?: string;
  }

  export const Edit = MakeParameterAndPropertyDecorator((target, key, param) =>
    SetParameterProvider(target, key, param, function (this: Owner, context) {
      const params = ExtractGeneric<EditParameters>(
        context,
        GetDataControllerMeta(this),
        {
          id: "string",
        },
      );

      assert(params.id && typeof params.id === "string", 400, "Missing id.");

      return params;
    }),
  );

  export interface DeleteParameters {
    id: string[];
  }

  export const Delete = MakeParameterAndPropertyDecorator(
    (target, key, param) =>
      SetParameterProvider(target, key, param, function (this: Owner, context) {
        const params = ExtractGeneric<DeleteParameters>(
          context,
          GetDataControllerMeta(this),
          {
            id: "multi:string",
          },
        );

        assert(
          params.id && Array.isArray(params.id) && params.id.length > 0,
          400,
          "Missing id.",
        );

        return params;
      }),
  );
}

export namespace Query {
  type TableRow = Parameters<ComputedFieldData["expr"]>[0];

  export function GetModel(
    obj: any,
    meta: DataAPIMeta,
  ): InstanceType<DataModel> & { constructor: DataModel } {
    assert(meta.modelKey, 500, "Missing model key.");
    return obj[meta.modelKey];
  }

  export function Foreign(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any>,
    pluck?: Set<string>,
  ): Stream<any>;
  export function Foreign(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Datum<any>,
    pluck?: Set<string>,
  ): Datum<any>;
  export function Foreign(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any> | Datum<any>,
    pluck?: Set<string>,
  ): Stream<any> | Datum<any> {
    if (IsStream(query)) {
      for (const [name, field] of Object.entries(meta.fields)) {
        if (!field.foreign || (pluck && !pluck.has(name))) {
          continue;
        }
        const [
          table,
          tableClass,
          index,
          multi,
          pluckField,
          schemaName,
          targetJoined,
        ] = field.foreign;
        const other = targetTable(db, { table, tableClass, schemaName });
        const hasTargetJoined = !multi && !!targetJoined?.length;
        if (pluckField) {
          const lookupPluck = hasTargetJoined
            ? Array.from(
                new Set([
                  ...pluckField,
                  ...targetJoined.map((g) => g.localKey),
                ]),
              )
            : pluckField;
          query = query.lookup(
            other.pluck("_internal", ...lookupPluck) as Table<any>,
            name,
            index || "_id",
          );
        } else {
          query = query.lookup(other, name, index || "_id");
        }
        if (hasTargetJoined) {
          query = applyForeignJoinedStream(db, query, name, targetJoined);
        }
      }
      return query;
    } else {
      const oldForeign = (obj: TableRow) => {
        const changedFields: Record<string, Datum<any> | ValueProxy<any>> = {};
        for (const [name, field] of Object.entries(meta.fields)) {
          if (!field.foreign || (pluck && !pluck.has(name))) {
            continue;
          }
          const [
            table,
            tableClass,
            index,
            multi,
            pluckField,
            schemaName,
            targetJoined,
          ] = field.foreign;
          const remote = targetTable(db, { table, tableClass, schemaName });
          if (multi) {
            changedFields[name] = (obj.key(name) as ValueProxy<string[]>)
              .default([])
              .map((val) => {
                let foreignObject: Datum<any> = Get(remote, val, index);
                if (pluckField) {
                  foreignObject = foreignObject.pluck(
                    "_internal",
                    ...pluckField,
                  );
                }
                return foreignObject.default(null);
              });
          } else {
            let foreignObject: Datum<any> = Get(remote, obj.key(name), index);
            if (targetJoined && targetJoined.length > 0) {
              foreignObject = applyForeignJoinedDatum(
                db,
                foreignObject,
                targetJoined,
              );
            }
            changedFields[name] = foreignObject.default(null);
          }
        }
        return obj.merge(changedFields);
      };
      return query.do(oldForeign);
    }
  }

  /**
   * Re-materializes the `@Joined` fields of a relation target on the looked-up
   * sub-object (Stream/list path). The base `Foreign` lookup only plucks the
   * target's physical columns, so a joined label would come back empty; here we
   * resolve each joined field with a second lookup keyed on the target's
   * (already plucked) local key, then merge it back into the relation object.
   * For an orphan foreign key the merge yields `{ [joined]: null }`: the
   * database DSL has no value-level conditional to null the relation here, so
   * {@link Validation.ClearInternal} normalizes it back to a null relation.
   */
  function applyForeignJoinedStream(
    db: SchemaInstance<any>,
    stream: Stream<any>,
    foreignName: string,
    groups: ForeignJoinedRef[],
  ): Stream<any> {
    let s = stream;
    for (const group of groups) {
      const remoteTable = targetTable(db, group).pluck(
        "_internal",
        group.remoteIndex,
        group.remoteField,
      ) as Table<any>;
      const tmpKey = `__fjoin_${foreignName}_${group.name}`;
      s = s
        .map((row) =>
          row.merge({
            [tmpKey]: row.key(foreignName).key(group.localKey),
          }),
        )
        .lookup(remoteTable, tmpKey, group.remoteIndex)
        .map((row) =>
          row.merge({
            [foreignName]: row.key(foreignName).merge({
              [group.name]: row
                .key(tmpKey)
                .default({})
                .key(group.remoteField)
                .default(null),
            }),
          }),
        )
        .without(tmpKey);
    }
    return s;
  }

  /**
   * Datum/get counterpart of {@link applyForeignJoinedStream}: resolves each of
   * the target's `@Joined` fields with a secondary `Get` and merges it into the
   * relation object.
   */
  function applyForeignJoinedDatum(
    db: SchemaInstance<any>,
    datum: Datum<any>,
    groups: ForeignJoinedRef[],
  ): Datum<any> {
    let d = datum;
    for (const group of groups) {
      const remoteTable = targetTable(db, group);
      d = d.do((row) =>
        row.merge({
          [group.name]: Get(
            remoteTable,
            row.key(group.localKey),
            group.remoteIndex,
          )
            .key(group.remoteField)
            .default(null),
        }),
      );
    }
    return d;
  }

  interface JoinedGroup extends TableTargetReference {
    localKey: string;
    remoteIndex: string;
    schemaName?: string;
    fields: Array<{ name: string; remoteField: string }>;
  }

  function collectJoinedGroups(meta: DataAPIMeta): JoinedGroup[] {
    const groups = new Map<string, JoinedGroup>();
    for (const [name, field] of Object.entries(meta.fields)) {
      if (!field.joined) continue;
      const j = field.joined;
      const groupKey = `${j.schemaName ?? ""}|${j.table}|${j.localKey}|${j.remoteIndex}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          table: j.table,
          tableClass: j.tableClass,
          localKey: j.localKey,
          remoteIndex: j.remoteIndex,
          schemaName: j.schemaName,
          fields: [],
        };
        groups.set(groupKey, group);
      }
      group.fields.push({ name, remoteField: j.remoteField });
    }
    return Array.from(groups.values());
  }

  interface JoinedFieldSplit {
    filter: Set<string>;
    sort: Set<string>;
  }

  function addAll(target: Set<string>, names: string[]) {
    for (const name of names) {
      target.add(name);
    }
  }

  /**
   * Splits the joined fields of `meta` between those {@link List} must
   * materialize before the filter and count (`filter`) and those it only
   * needs after the count (`sort`). Joined fields referenced by neither are
   * left out so the list route can defer their lookups to the returned page.
   *
   * Computed expressions may read joined fields, so materializing a computed
   * field pulls every remaining joined group in with it. Groups whose local
   * key is also a foreign field must resolve before `Foreign` replaces the
   * key with the looked-up record.
   */
  function splitJoinedFields(
    meta: DataAPIMeta,
    sorting?: [string, "asc" | "desc" | undefined],
    filters?: Record<string, FieldFilter>,
  ): JoinedFieldSplit {
    const split: JoinedFieldSplit = { filter: new Set(), sort: new Set() };
    const filterNames = Object.keys(meta.filters).filter(
      (name) => filters && name in filters,
    );
    const hasComputedFilter = filterNames.some(
      (name) => meta.fields[name]?.computed,
    );
    const sortField = sorting?.[0];
    const hasComputedSort = !!sortField && !!meta.fields[sortField]?.computed;
    for (const group of collectJoinedGroups(meta)) {
      const names = group.fields.map((field) => field.name);
      if (
        hasComputedFilter ||
        names.some((name) => filterNames.includes(name))
      ) {
        addAll(split.filter, names);
      } else if (
        hasComputedSort ||
        (sortField && names.includes(sortField)) ||
        meta.fields[group.localKey]?.foreign
      ) {
        addAll(split.sort, names);
      }
    }
    return split;
  }

  /**
   * Joined field names that {@link List} does not materialize for the given
   * split. The default list route resolves these after pagination so their
   * lookups only run on the returned page.
   */
  function deferredJoinedFields(
    meta: DataAPIMeta,
    split: JoinedFieldSplit,
  ): Set<string> {
    return new Set(
      Object.entries(meta.fields)
        .filter(
          ([name, field]) =>
            field.joined && !split.filter.has(name) && !split.sort.has(name),
        )
        .map(([name]) => name),
    );
  }

  interface DeferredJoinContext {
    db: SchemaInstance<any>;
    meta: DataAPIMeta;
    names: Set<string>;
    raw: Stream<any>;
  }

  /**
   * Stream returned by {@link List} when the deferred joined fields are not
   * exposed to the caller: it resolves them itself, so consumers that
   * destructure `[query, total]` alone still observe every `@Joined` field.
   * The lookups are appended after `slice`/`nth`, keeping them on the
   * requested page only; bare `count()` calls and field aggregates on
   * non-joined fields skip them (left-join lookups never change the row
   * count nor other fields); `changes()` attaches to the raw stream, since
   * change feeds cannot carry the lookups. Any other operation may observe
   * the joined fields, so it materializes them first.
   */
  class DeferredJoinedStream extends Stream<any> {
    declare deferredJoin: DeferredJoinContext;
  }

  type DeferredJoinedOperation = (
    this: DeferredJoinedStream,
    ...args: any[]
  ) => any;

  function materializeDeferredJoin(stream: DeferredJoinedStream) {
    const { db, meta, names, raw } = stream.deferredJoin;
    return Joined(db, meta, raw, names);
  }

  function pagedDeferredJoinOperation(name: string): DeferredJoinedOperation {
    return function (this: DeferredJoinedStream, ...args: any[]) {
      const { db, meta, names, raw } = this.deferredJoin;
      const paged = (raw as any)[name](...args);
      return Joined(db, meta, paged, names);
    };
  }

  /**
   * Resolves the joined fields through the stream form of {@link Joined}
   * rather than its datum form: only the datum form has no way to drop the
   * temporary key it stages (neither `Datum` nor `ValueProxy` exposes
   * `without`), so it would leave `__joined_orig_*` on the row.
   */
  function nthDeferredJoinOperation(): DeferredJoinedOperation {
    return function (this: DeferredJoinedStream, n: number) {
      const { db, meta, names, raw } = this.deferredJoin;
      return Joined(db, meta, raw.slice(n, 1), names).nth(0);
    };
  }

  function rawDeferredJoinOperation(name: string): DeferredJoinedOperation {
    return function (this: DeferredJoinedStream, ...args: any[]) {
      return (this.deferredJoin.raw as any)[name](...args);
    };
  }

  function fieldAggregateDeferredJoinOperation(
    name: string,
    bareCallOnRaw: boolean,
  ): DeferredJoinedOperation {
    return function (this: DeferredJoinedStream, field?: string) {
      const { db, meta, names, raw } = this.deferredJoin;
      if (!field) {
        const bareTarget = bareCallOnRaw ? raw : materializeDeferredJoin(this);
        return (bareTarget as any)[name]();
      }
      const target = names.has(field)
        ? Joined(db, meta, raw, new Set([field]))
        : raw;
      return (target as any)[name](field);
    };
  }

  function forwardingDeferredJoinOperation(
    name: string,
  ): DeferredJoinedOperation {
    return function (this: DeferredJoinedStream, ...args: any[]) {
      return (materializeDeferredJoin(this) as any)[name](...args);
    };
  }

  /** The operation a {@link DeferredJoinedStream} installs for a stream method. */
  interface DeferredJoinOperationFactories {
    [method: string]: (name: string) => DeferredJoinedOperation;
  }

  const DEFERRED_JOIN_OPERATION_FACTORIES: DeferredJoinOperationFactories = {
    slice: pagedDeferredJoinOperation,
    nth: nthDeferredJoinOperation,
    changes: rawDeferredJoinOperation,
    count: (name) => fieldAggregateDeferredJoinOperation(name, true),
    sum: (name) => fieldAggregateDeferredJoinOperation(name, false),
    avg: (name) => fieldAggregateDeferredJoinOperation(name, false),
    min: (name) => fieldAggregateDeferredJoinOperation(name, false),
    max: (name) => fieldAggregateDeferredJoinOperation(name, false),
    distinct: (name) => fieldAggregateDeferredJoinOperation(name, false),
  };

  const DEFERRED_JOIN_INHERITED_OPERATIONS = new Set(["constructor", "cast"]);

  function wireDeferredJoinedStream() {
    const operationNames = [
      ...Object.getOwnPropertyNames(Stream.prototype),
      "run",
      "cursor",
      "build",
    ].filter((name) => !DEFERRED_JOIN_INHERITED_OPERATIONS.has(name));
    for (const name of operationNames) {
      const factory =
        DEFERRED_JOIN_OPERATION_FACTORIES[name] ??
        forwardingDeferredJoinOperation;
      (DeferredJoinedStream.prototype as any)[name] = factory(name);
    }
  }
  wireDeferredJoinedStream();

  /**
   * Wraps `raw` into a {@link DeferredJoinedStream}. The wrapper keeps the
   * raw stages as its own (an unobservable fallback, since every operation
   * is overridden) while `build()` serializes the materialized pipeline, so
   * a wrapper embedded as an argument of another query never leaks rows
   * without the joined fields.
   */
  function wrapDeferredJoined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    names: Set<string>,
    raw: Stream<any>,
  ): Stream<any> {
    const wrapped: DeferredJoinedStream = Object.create(
      DeferredJoinedStream.prototype,
    );
    (wrapped as any).stages = raw.build();
    wrapped.deferredJoin = { db, meta, names, raw };
    return wrapped;
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

  interface TableTargetReference {
    table: string;
    tableClass?: Constructible;
    schemaName?: string;
  }

  function targetTable(
    sourceDb: SchemaInstance<any>,
    target: TableTargetReference,
  ): Table<any> {
    if (!target.schemaName) return sourceDb.table(target.table);
    assert(
      target.tableClass,
      500,
      `Table "${target.table}" of schema "${target.schemaName}" has no registered table class`,
    );
    return (target.tableClass as unknown as TableClass).table();
  }

  export function Joined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any>,
    only?: Set<string>,
  ): Stream<any>;
  export function Joined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Datum<any>,
    only?: Set<string>,
  ): Datum<any>;
  export function Joined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any> | Datum<any>,
    only?: Set<string>,
  ): Stream<any> | Datum<any> {
    const groups = collectJoinedGroups(meta).filter(
      (group) => !only || group.fields.some((field) => only.has(field.name)),
    );
    if (groups.length === 0) {
      return query;
    }

    const emptyRemote = {};
    const tmpKeyFor = (localKey: string) => `__joined_orig_${localKey}`;

    if (IsStream(query)) {
      let stream = query;
      const tmpKeys: string[] = [];
      for (const group of groups) {
        const remoteFields = group.fields.map((f) => f.remoteField);
        const remoteTable = targetTable(db, group).pluck(
          "_internal",
          group.remoteIndex,
          ...remoteFields,
        ) as Table<any>;
        const tmpKey = tmpKeyFor(group.localKey);
        tmpKeys.push(tmpKey);
        stream = stream
          .map((row) => row.merge({ [tmpKey]: row.key(group.localKey) }))
          .lookup(remoteTable, group.localKey, group.remoteIndex)
          .map((row) => {
            const merged: Record<string, ValueProxy<any>> = {};
            const remote = row.key(group.localKey).default(emptyRemote);
            for (const f of group.fields) {
              merged[f.name] = remote.key(f.remoteField).default(null);
            }
            merged[group.localKey] = row.key(tmpKey);
            return row.merge(merged);
          });
      }
      return stream.without(...tmpKeys);
    }

    let datum = query;
    for (const group of groups) {
      const remoteFields = group.fields.map((f) => f.remoteField);
      const remoteTable = targetTable(db, group).pluck(
        "_internal",
        group.remoteIndex,
        ...remoteFields,
      ) as Table<any>;
      const tmpKey = tmpKeyFor(group.localKey);
      datum = datum
        .do((row) => row.merge({ [tmpKey]: row.key(group.localKey) }))
        .lookup(remoteTable, group.localKey, group.remoteIndex)
        .do((row) => {
          const merged: Record<string, ValueProxy<any>> = {};
          const remote = row.key(group.localKey).default(emptyRemote);
          for (const f of group.fields) {
            merged[f.name] = remote.key(f.remoteField).default(null);
          }
          merged[group.localKey] = row.key(tmpKey);
          return row.merge(merged);
        });
    }
    return datum;
  }

  type ComputedEntry = [name: string, computed: ComputedFieldData];
  type RowMapper = (row: TableRow) => TableRow;

  function collectComputedEntries(
    meta: DataAPIMeta,
    only?: Set<string>,
  ): ComputedEntry[] {
    return Object.entries(meta.fields).flatMap(
      ([name, field]): ComputedEntry[] =>
        field.computed && (!only || only.has(name))
          ? [[name, field.computed]]
          : [],
    );
  }

  function buildComputedMappers(
    db: SchemaInstance<any>,
    entries: ComputedEntry[],
  ): RowMapper[] {
    const mergeExpressions: RowMapper = (row) => {
      const merged: Record<string, ReturnType<ComputedFieldData["expr"]>> = {};
      for (const [name, computed] of entries) {
        merged[name] = computed.expr(row, db);
      }
      return row.merge(merged);
    };
    const defaulted = entries.filter(
      ([, computed]) => computed.default !== undefined,
    );
    if (defaulted.length === 0) {
      return [mergeExpressions];
    }
    const applyDefaults: RowMapper = (row) => {
      const merged: Record<string, ValueProxy<any>> = {};
      for (const [name, computed] of defaulted) {
        merged[name] = row.key(name).default(computed.default);
      }
      return row.merge(merged);
    };
    return [mergeExpressions, applyDefaults];
  }

  export function Computed(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any>,
    only?: Set<string>,
  ): Stream<any>;
  export function Computed(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Datum<any>,
    only?: Set<string>,
  ): Datum<any>;
  export function Computed(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any> | Datum<any>,
    only?: Set<string>,
  ): Stream<any> | Datum<any> {
    const entries = collectComputedEntries(meta, only);
    if (entries.length === 0) {
      return query;
    }
    const mappers = buildComputedMappers(db, entries);
    if (IsStream(query)) {
      return mappers.reduce((stream, mapper) => stream.map(mapper), query);
    }
    return mappers.reduce((datum, mapper) => datum.do(mapper), query);
  }

  export async function ReadProperties(
    obj: any,
    meta: DataAPIMeta,
    dbData: any,
    action?: string,
    onlyList?: boolean,
  ) {
    const readable =
      meta.readable[action ?? "_default"] ?? meta.readable._default;
    const instance = { ...obj };
    const res: Record<string, any> = {};
    for (const [key, field] of readable.props) {
      if (onlyList && !field.listable) {
        continue;
      }
      instance[key] = dbData[field.dbName || key];
      res[key] = dbData[field.dbName || key];
    }
    instance.table = dbData;
    Object.setPrototypeOf(instance, meta.target.prototype);
    for (const [key, field] of readable.getters) {
      if (onlyList && !field.listable) {
        continue;
      }
      const val = field.desc?.get?.apply(instance);
      res[key] = await (typeof val === "function" ? val() : val);
    }
    return res;
  }

  function writableInBody(
    writable: WritableAccessFields,
    bodyData: Parameters<typeof WriteProperties>[2],
  ): WritableAccessFields {
    return {
      props: writable.props.filter(([key]) => Object.hasOwn(bodyData, key)),
      setters: writable.setters.filter(([key]) => Object.hasOwn(bodyData, key)),
    };
  }

  function writeTargetDefaults(
    instance: Parameters<typeof WriteProperties>[0],
    meta: DataAPIMeta,
    dbData: Exclude<Parameters<typeof WriteProperties>[4], undefined>,
  ) {
    for (const [key, value] of Object.entries(new meta.target())) {
      if (value !== undefined) {
        instance[key] = value;
        if (key in meta.fields) {
          dbData[meta.fields[key].dbName || key] = value;
        }
      }
    }
  }

  /**
   * Writes the writable fields of `bodyData` into a database row.
   *
   * Without `existingDBData` (creation), the row starts from the controller
   * defaults and every writable field is written: a field absent from the body
   * is written as `undefined` and every setter runs. With `existingDBData`
   * (update), only the fields present in the body are written over the stored
   * row and only their setters run: an absent field keeps its stored value,
   * `null` clears it.
   */
  export async function WriteProperties(
    obj: any,
    meta: DataAPIMeta,
    bodyData: Record<string, any>,
    action?: string,
    existingDBData?: Record<string, any>,
  ) {
    const actionWritable =
      meta.writable[action ?? "_default"] ?? meta.writable._default;
    const writable = existingDBData
      ? writableInBody(actionWritable, bodyData)
      : actionWritable;
    const instance = { ...obj };
    const dbData: Exclude<typeof existingDBData, undefined> =
      existingDBData || {};
    Object.setPrototypeOf(dbData, meta.tableClass.prototype);
    if (!existingDBData) {
      writeTargetDefaults(instance, meta, dbData);
    }
    for (const [key, field] of writable.props) {
      instance[key] = bodyData[key];
      dbData[field.dbName || key] = bodyData[key];
    }
    instance.table = dbData;
    Object.setPrototypeOf(instance, meta.target.prototype);
    for (const [key, field] of writable.setters) {
      field.desc?.set?.apply(instance, [bodyData[key]]);
    }
    return dbData;
  }

  export function Get(
    table: Table<any>,
    id: string | ValueProxy<string>,
    index?: string,
  ) {
    return index
      ? table.getAll(id as string, index).nth(0)
      : table.get(id as string);
  }

  export interface ListOptions {
    /**
     * Return the joined field names {@link List} did not materialize as the
     * third tuple element instead of a self-resolving stream, leaving their
     * page-time resolution to the caller. The default list route uses this
     * to restrict the page lookups to the plucked fields.
     */
    exposeDeferredJoined?: boolean;
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

  /**
   * Builds the filtered and sorted stream of a list request along with its
   * total count. Joined fields that no filter or sort references are not
   * materialized in either pipeline; by default the returned stream resolves
   * them itself once the caller pages it (or otherwise observes rows), so the
   * third tuple element is empty. With
   * {@link ListOptions.exposeDeferredJoined} — or when no `db` is provided,
   * since no lookup can be built without one — the raw stream is returned
   * and the third element names the joined fields left for the caller.
   */
  export function List<T extends Record<string, any>>(
    obj: any,
    meta: DataAPIMeta,
    request: Table<T>,
    reqCtx: RequestContext,
    sorting?: [string, "asc" | "desc" | undefined],
    filters?: Record<string, FieldFilter>,
    db?: SchemaInstance<any>,
    options?: ListOptions,
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
                Validation.UnlockRequest(obj, meta, row, name),
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
            [MODIFIED_SORT_KEY]: Validation.UnlockRequest(
              obj,
              meta,
              row,
              sortField,
            ),
          }),
        )
        .orderBy(MODIFIED_SORT_KEY, sorting?.[1] ?? "asc")
        .without(MODIFIED_SORT_KEY) as unknown as Stream<T>;
    } else if (shouldSort && !shouldSort.indexed && sortField) {
      tmpRequest = tmpRequest.orderBy(sortField, sorting?.[1] ?? "asc");
    }
    return listResultTuple(tmpRequest, total, meta, joinedSplit, db, options);
  }

  /** How {@link ListPage} reads one page of a {@link List} stream. */
  export interface ListPageOptions {
    offset: number;
    limit: number;
    /**
     * The filters {@link List} applied: the computed fields they read are
     * already merged.
     */
    filters?: Record<string, FieldFilter>;
    /** The sort {@link List} applied: a computed sort field is merged. */
    sortKey?: string;
    /** The fields the page answers; every field when unset. */
    pluck?: Set<string>;
    /** Leave the foreign keys unresolved. */
    noForeign?: boolean;
    /**
     * The joined fields {@link List} left unresolved
     * ({@link ListOptions.exposeDeferredJoined}).
     */
    deferredJoined?: Set<string>;
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

  /**
   * One page of the stream {@link List} built, with the fields it answers:
   * the deferred joined fields, then the computed fields no filter or sort
   * merged, then the foreign keys, then the pluck. Computed fields come
   * before the foreign keys because a lookup replaces a key with the row it
   * names, and a computed expression reading that key would no longer find
   * it.
   */
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

  export function Delete(table: Table<any>, id: string | string[]) {
    return Array.isArray(id)
      ? table.getAll(id).delete()
      : table.get(id).delete();
  }
}

export namespace Validation {
  /** A request body, parsed. */
  export type RequestBody = Record<string, any>;

  function isClearingValue(value: Parameters<FieldValidator>[0]): boolean {
    if (value === null || value === undefined) return true;
    if (value === "") return true;
    return Array.isArray(value) && value.length === 0;
  }

  const isAbsentFromBody = (body: RequestBody, name: string) => !(name in body);

  const isClearedByBody = (body: RequestBody, name: string) =>
    Object.hasOwn(body, name) && isClearingValue(body[name]);

  /** How each action decides that a body lacks a mandatory field. */
  interface MissingFieldChecks {
    [action: string]: typeof isAbsentFromBody;
  }

  const MISSING_MANDATORY_FIELD_CHECKS: MissingFieldChecks = {
    edit: isClearedByBody,
  };

  /** The `code` of a 400 naming the mandatory fields a body lacks. */
  export const MISSING_MANDATORY_FIELDS = "missing_mandatory_fields";
  /** The `code` of a 400 naming the fields whose validator refused the value. */
  export const INVALID_FIELD_TYPES = "invalid_field_types";

  /**
   * The body of a 400 refusing some fields of a request body: what went
   * wrong (`code`) and the fields concerned, for the client to word it and
   * show it under each one.
   */
  export interface FieldsErrorBody {
    code: typeof MISSING_MANDATORY_FIELDS | typeof INVALID_FIELD_TYPES;
    fields: string[];
  }

  function rejectFields(code: FieldsErrorBody["code"], fields: string[]) {
    if (fields.length === 0) return;
    throw new HTTPResult(400, { code, fields } satisfies FieldsErrorBody);
  }

  /**
   * Rejects with 400 the request bodies missing a field mandatory for `type`.
   * On `edit`, a mandatory field is missing when the body clears it (`null`,
   * `""` or `[]`); a field absent from the body keeps its stored value. On any
   * other action, it is missing when absent from the body. The body of the
   * 400 is a {@link FieldsErrorBody} with {@link MISSING_MANDATORY_FIELDS}.
   */
  export function MandatoryFields(meta: DataAPIMeta, obj: any, type: string) {
    const isMissing = MISSING_MANDATORY_FIELD_CHECKS[type] ?? isAbsentFromBody;
    const missing = Object.entries(meta.fields)
      .filter(
        ([name, field]) => field.mandatory?.has(type) && isMissing(obj, name),
      )
      .map(([name]) => name);
    rejectFields(MISSING_MANDATORY_FIELDS, missing);
  }

  function toParseResult(
    result: FieldValidationResult,
    value: Parameters<FieldValidator>[0],
  ): FieldParseResult {
    if (result !== true && result !== false) return result;
    return result ? { success: true, data: value } : { success: false };
  }

  /**
   * Runs the validator of each field present in `obj` and rejects with 400
   * when one fails, with a {@link FieldsErrorBody} of
   * {@link INVALID_FIELD_TYPES}. Returns a copy of `obj` where each validated field holds
   * the value its validator parsed (see {@link FieldValidationResult}).
   */
  export async function ValidateTypes(
    meta: DataAPIMeta,
    obj: RequestBody,
  ): Promise<RequestBody> {
    const parsed = { ...obj };
    const invalid: string[] = [];
    for (const [name, field] of Object.entries(meta.fields)) {
      if (!field.validator || !(name in obj)) continue;
      const result = toParseResult(await field.validator(obj[name]), obj[name]);
      if (result.success) {
        parsed[name] = result.data;
      } else {
        invalid.push(name);
      }
    }
    rejectFields(INVALID_FIELD_TYPES, invalid);
    return parsed;
  }

  /**
   * A request body the `new` and `edit` routes write: the raw request, or
   * the object a wrapping route already parsed (and may have amended, to
   * stamp or drop a field), which the route then writes as handed.
   */
  export type WrittenBody = Buffer | RequestBody;

  /**
   * Parses a request body, rejecting with 400 anything but a JSON object. A
   * body already parsed is checked, not parsed again.
   */
  export function ParseBody(body: WrittenBody): RequestBody {
    let data: unknown = body;
    if (Buffer.isBuffer(body)) {
      try {
        data = JSON.parse(body.toString());
      } catch {
        assert(false, 400, "Invalid JSON body.");
      }
    }
    assert(
      typeof data === "object" && data !== null && !Array.isArray(data),
      400,
      "The request body must be a JSON object.",
    );
    return data;
  }

  /**
   * Locks the modifier fields (localized, encrypted…) written into `data`
   * since it was read, with the controller's modifier keys. A field left
   * untouched keeps its stored locked value: read while locked it would be
   * `undefined`, and locking it again would store that over it.
   */
  export function Lock(obj: any, meta: DataAPIMeta, data: any) {
    const written = Object.keys(
      getMetadata(data, ModifiersDynamicMetadata).floating,
    );
    for (const [modifier, field] of meta.modifierKeys.entries()) {
      const key = obj[field];
      lock(data, modifier, written, key);
    }
  }

  export function Unlock(obj: any, meta: DataAPIMeta, dbData: any) {
    for (const [name, field] of Object.entries(meta.fields)) {
      if (
        field.foreign &&
        dbData[name] &&
        typeof dbData[name] === "object" &&
        field.foreign[1]
      ) {
        const foreignSchema = field.foreign[1];
        dbData[name] = Array.isArray(dbData[name])
          ? dbData[name].map((entry) => fromDatabase(entry, foreignSchema))
          : fromDatabase(dbData[name], field.foreign[1]);
      }
    }
    for (const [modifier, field] of meta.modifierKeys.entries()) {
      const key = obj[field];
      unlock(dbData, modifier, undefined, key);
      for (const [foreign, fieldData] of Object.entries(meta.fields)) {
        if (
          fieldData.foreign &&
          dbData[foreign] &&
          typeof dbData[foreign] === "object"
        ) {
          unlock(dbData[foreign], modifier, undefined, key);
        }
      }
    }
  }

  export function UnlockRequest<T extends {}, K extends keyof T>(
    obj: any,
    meta: DataAPIMeta,
    row: ValueProxy<T>,
    field: K,
  ): ValueProxy<T[K]> {
    const modifiers = Array.from(meta.modifierKeys.entries()).map(
      ([modifier, field]) => ({
        modifier,
        args: [obj[field]],
      }),
    );
    return unlockrequest(meta.tableClass, row, field, modifiers);
  }

  export function ClearInternal(
    meta: DataAPIMeta,
    obj: Record<string, any> | Array<Record<string, any>>,
  ) {
    const results = Array.isArray(obj) ? obj : [obj];

    const foreignFields = Object.entries(meta.fields).filter(
      ([, field]) => field.foreign,
    );
    for (const entry of results) {
      delete entry._internal;
      for (const [name, { foreign }] of foreignFields) {
        if (
          foreign &&
          entry[name] &&
          typeof entry[name] === "object" &&
          (!Array.isArray(entry[name]) || typeof entry[name][0] === "object")
        ) {
          const processForeign = (data: any) => {
            const plain = toPlainData(data);
            if (!foreign?.[4]) {
              return plain;
            }
            const targetJoined = foreign[6];
            if (targetJoined?.length) {
              const joinedNames = new Set(targetJoined.map((g) => g.name));
              const physicalKeys = foreign[4].filter(
                (k) => !joinedNames.has(k),
              );
              if (
                physicalKeys.length > 0 &&
                physicalKeys.every(
                  (k) => plain[k] === null || plain[k] === undefined,
                )
              ) {
                return null;
              }
            }
            const plainPlucked: ReturnType<typeof toPlainData> = {};
            for (const key of foreign[4]) {
              plainPlucked[key] = plain[key];
            }
            return plainPlucked;
          };
          entry[name] = Array.isArray(entry[name])
            ? entry[name].map(processForeign)
            : processForeign(entry[name]);
        }
      }
    }
  }
}
