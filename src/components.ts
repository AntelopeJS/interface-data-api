import {
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { MakeParameterAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  type Datum,
  Schema,
  type SchemaInstance,
  Stream,
  type Table,
  type ValueProxy,
} from "@antelopejs/interface-database";
import type { Constructible } from "@antelopejs/interface-database-decorators/common";
import type { DataModel } from "@antelopejs/interface-database-decorators/model";
import {
  fromDatabase,
  lock,
  toPlainData,
  unlock,
  unlockrequest,
} from "@antelopejs/interface-database-decorators/modifiers/common";
import { GetDataControllerMeta } from ".";
import type { DataAPIMeta, FilterValue } from "./metadata";

export namespace Parameters {
  export function GetOptionOverrides<T extends Record<string, any>>(
    reqCtx: RequestContext,
  ): T {
    return (<any>reqCtx).dataAPIEntry?.options ?? {};
  }

  export function ExtractFilters(
    reqCtx: RequestContext,
    meta: DataAPIMeta,
  ): Record<string, FilterValue> {
    const result: Record<string, FilterValue> = {};
    for (const filter of Object.keys(meta.filters)) {
      const filter_key = `filter_${filter}`;
      if (reqCtx.url.searchParams.has(filter_key)) {
        const searchVal = reqCtx.url.searchParams.get(filter_key) ?? "";
        const match = searchVal.match(/([^:]+):(.*)/);
        result[filter] = match
          ? [match[2], match[1] as FilterValue[1]]
          : [searchVal, "eq"];
      }
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
      if (!(key in result)) {
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
    filters?: Record<string, FilterValue>;

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
    SetParameterProvider(target, key, param, function (this: unknown, context) {
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
    SetParameterProvider(target, key, param, function (this: unknown, context) {
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
    SetParameterProvider(target, key, param, function (this: unknown, context) {
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
    SetParameterProvider(target, key, param, function (this: unknown, context) {
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
      SetParameterProvider(
        target,
        key,
        param,
        function (this: unknown, context) {
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
        },
      ),
  );
}

export namespace Query {
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
    /**/
    if (query instanceof Stream) {
      for (const [name, field] of Object.entries(meta.fields)) {
        if (!field.foreign || (pluck && !pluck.has(name))) {
          continue;
        }
        const [table, _tableClass, index, _multi, pluckField, schemaName] =
          field.foreign;
        const other = resolveSchemaDb(db, schemaName).table(table);
        if (pluckField) {
          query = query.lookup(
            other.pluck("_internal", ...pluckField) as Table<any>,
            name,
            index || "_id",
          );
        } else {
          query = query.lookup(other, name, index || "_id");
        }
      }
      return query;
    } else {
      const oldForeign = (obj: ValueProxy<Record<string, any>>) => {
        const changedFields: Record<string, any> = {};
        for (const [name, field] of Object.entries(meta.fields)) {
          if (!field.foreign || (pluck && !pluck.has(name))) {
            continue;
          }
          const [table, _tableClass, index, multi, pluckField, schemaName] =
            field.foreign;
          const remoteDb = resolveSchemaDb(db, schemaName);
          if (multi) {
            changedFields[name] = (obj.key(name) as ValueProxy<string[]>)
              .default([])
              .map((val) => {
                let foreignObject: Datum<any> = Get(
                  remoteDb.table(table),
                  val,
                  index,
                );
                if (pluckField) {
                  foreignObject = foreignObject.pluck(
                    "_internal",
                    ...pluckField,
                  );
                }
                return foreignObject.default(null);
              });
          } else {
            changedFields[name] = Get(
              remoteDb.table(table),
              obj.key(name) as ValueProxy<string>,
              index,
            ).default(null);
          }
        }
        return obj.merge(changedFields);
      };
      return query.do(oldForeign);
    }
  }

  interface JoinedGroup {
    table: string;
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

  function resolveSchemaDb(
    sourceDb: SchemaInstance<any>,
    schemaName: string | undefined,
  ): SchemaInstance<any> {
    if (!schemaName) return sourceDb;
    const schema = Schema.get(schemaName);
    assert(schema, 500, `Schema "${schemaName}" not registered`);
    return schema.instance();
  }

  export function Joined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any>,
  ): Stream<any>;
  export function Joined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Datum<any>,
  ): Datum<any>;
  export function Joined(
    db: SchemaInstance<any>,
    meta: DataAPIMeta,
    query: Stream<any> | Datum<any>,
  ): Stream<any> | Datum<any> {
    const groups = collectJoinedGroups(meta);
    if (groups.length === 0) {
      return query as any;
    }

    type RowShape = Record<string, unknown>;
    const emptyRemote: RowShape = {};
    const tmpKeyFor = (localKey: string) => `__joined_orig_${localKey}`;

    if (query instanceof Stream) {
      let stream: Stream<RowShape> = query as Stream<RowShape>;
      const tmpKeys: string[] = [];
      for (const group of groups) {
        const remoteFields = group.fields.map((f) => f.remoteField);
        const remoteDb = resolveSchemaDb(db, group.schemaName);
        const remoteTable = remoteDb
          .table(group.table)
          .pluck(
            "_internal",
            group.remoteIndex,
            ...remoteFields,
          ) as Table<RowShape>;
        const tmpKey = tmpKeyFor(group.localKey);
        tmpKeys.push(tmpKey);
        stream = stream
          .map((row) => row.merge({ [tmpKey]: row.key(group.localKey) }))
          .lookup(remoteTable, group.localKey, group.remoteIndex)
          .map((row) => {
            const merged: RowShape = {};
            const remote = row.key(group.localKey).default(emptyRemote);
            for (const f of group.fields) {
              merged[f.name] = remote.key(f.remoteField).default(null);
            }
            merged[group.localKey] = row.key(tmpKey);
            return row.merge(merged);
          }) as Stream<RowShape>;
      }
      return stream.without(...tmpKeys) as Stream<RowShape>;
    }

    let datum: Datum<RowShape> = query as Datum<RowShape>;
    for (const group of groups) {
      const remoteFields = group.fields.map((f) => f.remoteField);
      const remoteDb = resolveSchemaDb(db, group.schemaName);
      const remoteTable = remoteDb
        .table(group.table)
        .pluck(
          "_internal",
          group.remoteIndex,
          ...remoteFields,
        ) as Table<RowShape>;
      const tmpKey = tmpKeyFor(group.localKey);
      datum = datum
        .do((row) => row.merge({ [tmpKey]: row.key(group.localKey) }))
        .lookup(remoteTable, group.localKey, group.remoteIndex)
        .do((row) => {
          const merged: RowShape = {};
          const remote = row.key(group.localKey).default(emptyRemote);
          for (const f of group.fields) {
            merged[f.name] = remote.key(f.remoteField).default(null);
          }
          merged[group.localKey] = row.key(tmpKey);
          return row.merge(merged);
        }) as Datum<RowShape>;
    }
    return datum;
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
    const instance: Record<string, any> = { ...obj };
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

  export async function WriteProperties(
    obj: any,
    meta: DataAPIMeta,
    bodyData: Record<string, any>,
    action?: string,
    existingDBData?: Record<string, any>,
  ) {
    const writable =
      meta.writable[action ?? "_default"] ?? meta.writable._default;
    const instance: Record<string, any> = { ...obj };
    const dbData: Record<string, any> = existingDBData || {};
    Object.setPrototypeOf(dbData, meta.tableClass.prototype);
    if (!existingDBData) {
      for (const [key, value] of Object.entries(new meta.target())) {
        if (value !== undefined) {
          instance[key] = value;
          if (key in meta.fields) {
            dbData[meta.fields[key].dbName || key] = value;
          }
        }
      }
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

  export function List<T extends Record<string, any>>(
    obj: any,
    meta: DataAPIMeta,
    request: Table<T>,
    reqCtx: RequestContext,
    sorting?: [string, "asc" | "desc" | undefined],
    filters?: Record<string, FilterValue>,
    db?: SchemaInstance<any>,
  ): [sorted: Stream<T>, total: Datum<number>] {
    const filterList = Object.entries(meta.filters).filter(
      ([name]) => filters && name in filters,
    );
    const indexFilter = filterList.find(
      ([name]) => filters?.[name][1] === "eq" && meta.fields[name]?.indexable,
    )?.[0];
    const index = indexFilter
      ? meta.fields[indexFilter].dbName || indexFilter
      : undefined;
    const indexedFilter = indexFilter ? filters?.[indexFilter] : undefined;

    let tmpRequest: Stream<T> = index
      ? request.getAll(indexedFilter?.[0] ?? "", index)
      : request;

    if (db) {
      tmpRequest = Joined(db, meta, tmpRequest as Stream<any>) as Stream<T>;
    }

    const sortField = sorting?.[0];
    const shouldSort = sortField ? meta.fields[sortField]?.sortable : undefined;
    if (shouldSort?.indexed && sortField) {
      tmpRequest = tmpRequest.orderBy(sortField, sorting?.[1] ?? "asc");
    }
    if (filterList.length > 0) {
      // TODO: rework for modifier-affected fields (unlockrequest)
      tmpRequest = filterList.reduce((req, [name, filter]) => {
        const filterValue = filters?.[name];
        if (!filterValue) return req;
        return name === indexFilter
          ? req
          : req.filter((row) =>
              filter(
                Object.assign(reqCtx, { this: obj }),
                Validation.UnlockRequest(obj, meta, row, name),
                name,
                filterValue[0],
                filterValue[1],
                row as ValueProxy<Record<string, any>>,
              ),
            );
      }, tmpRequest);
    }
    if (shouldSort && !shouldSort.indexed && sortField) {
      tmpRequest = tmpRequest.orderBy(sortField, sorting?.[1] ?? "asc");
    }
    return [tmpRequest, tmpRequest.count()];
  }

  export function Delete(table: Table<any>, id: string | string[]) {
    return Array.isArray(id)
      ? table.getAll(id).delete()
      : table.get(id).delete();
  }
}

export namespace Validation {
  export function MandatoryFields(meta: DataAPIMeta, obj: any, type: string) {
    const missing = Object.entries(meta.fields)
      .filter(([name, field]) => field.mandatory?.has(type) && !(name in obj))
      .map(([name]) => name);
    assert(
      missing.length === 0,
      400,
      `Missing mandatory fields: ${missing.join(", ")}`,
    );
  }

  export async function ValidateTypes(
    meta: DataAPIMeta,
    obj: Record<string, any>,
  ) {
    const invalid: string[] = [];
    for (const [name, field] of Object.entries(meta.fields)) {
      if (
        field.validator &&
        name in obj &&
        !(await field.validator(obj[name]))
      ) {
        invalid.push(name);
      }
    }
    assert(
      invalid.length === 0,
      400,
      `Invalid field type(s): ${invalid.join(", ")}`,
    );
  }

  export function Lock(obj: any, meta: DataAPIMeta, data: any) {
    for (const [modifier, field] of meta.modifierKeys.entries()) {
      const key = obj[field];
      lock(data, modifier, undefined, key);
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
    return unlockrequest(
      meta.tableClass as Constructible<T>,
      row,
      field,
      modifiers,
    );
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
            const plainPlucked: Record<string, unknown> = {};
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
