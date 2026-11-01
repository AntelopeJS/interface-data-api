import assert_ from "node:assert";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { getTablesForSchema } from "@antelopejs/interface-database-decorators/schema";
import { triggerEvent } from "@antelopejs/interface-database-decorators/modifiers/common";
import {
  type Class,
  type ClassDecorator,
} from "@antelopejs/interface-core/decorators";
import {
  DatumStaticMetadata,
  getMetadata,
} from "@antelopejs/interface-database-decorators";
import {
  Context,
  type ControllerClass,
  ControllerMeta,
  RawBody,
  RegisterRoute,
  type RequestContext,
  Route,
} from "@antelopejs/interface-api";

import type { WriteDocument } from "@antelopejs/interface-database/common";

import { Parameters, Query, Validation } from "./components";
import { isWriteDocument, isWriteValue } from "./internal/guards";
import { prototypeOf } from "./internal/prototypes";
import {
  DataAPIMeta,
  type DataControllerCallback,
  type DataControllerCallbackWithOptions,
  type DataControllerDef,
  type DataControllerInstance,
  type ExtractDefCallbacks,
  GetDataControllerMeta,
  type RowFields,
} from "./metadata";

export {
  type DataControllerCallback,
  type DataControllerCallbackWithOptions,
  type DataControllerDef,
  type DataControllerInstance,
  type ExtractCallback,
  type ExtractDefCallbacks,
  GetDataControllerMeta,
} from "./metadata";

abstract class TableHolder<C extends Class> {
  table!: InstanceType<C>;
}

export function DataController<
  C extends Class,
  P extends DataControllerDef = DataControllerDef,
  Base extends ControllerClass = ControllerClass,
>(
  tableClass: C,
  def: P,
  base: Base,
): Class<ExtractDefCallbacks<P> & TableHolder<C>> & Base {
  const c = class extends base {
    table!: InstanceType<C>;
  };
  const meta = GetMetadata(c, DataAPIMeta);
  const tableMetadata = getMetadata(tableClass, DatumStaticMetadata);
  meta.schemaName = tableMetadata.schemaName || "default";

  const databaseSchema = getTablesForSchema(meta.schemaName);
  assert_(databaseSchema, "Non-existent Database Schema");

  const tableName = Object.entries(databaseSchema).find(
    ([, table]) => table === tableClass,
  )?.[0];
  assert_(tableName, "Unregistered Database Table");

  meta.tableClass = tableClass;
  meta.tableName = tableName;

  for (const [key, val] of Object.entries(def)) {
    const entry =
      "func" in val
        ? { endpoint: key, callback: val }
        : { endpoint: key, ...val };
    meta.addEndpoint(key, entry);
    c.prototype[key] = entry.callback.func;
  }
  // SAFETY: for every own key of def, the loop above installs the function ExtractCallback<P[key]> names (def[key].func, or def[key].callback.func for an entry with options) on c.prototype, which covers the members of ExtractDefCallbacks<P>; c extends base and declares table itself.
  return c as Class<ExtractDefCallbacks<P> & TableHolder<C>> & Base;
}

export const RegisterDataController =
  (): ClassDecorator<ControllerClass> => (target) => {
    const meta = GetMetadata(target, DataAPIMeta);
    for (const [key, entry] of Object.entries(meta.endpoints)) {
      for (let i = 0; i < entry.callback.args.length; ++i) {
        const arg = entry.callback.args[i];
        if (Array.isArray(arg)) {
          for (const step of arg) {
            step(target.prototype, key, i);
          }
        } else {
          arg(target.prototype, key, i);
        }
      }
      const meta = GetMetadata(target, ControllerMeta);
      const fullLocation = `${meta.location}/${entry.endpoint ?? key}`.replace(
        /\/+/g,
        "/",
      );
      RegisterRoute({
        callback: (ctx: Parameters.DataRequestContext) => {
          ctx.dataAPIEntry = entry;
        },
        location: fullLocation,
        method: entry.callback.method,
        mode: "prefix",
        parameters: [{ provider: (ctx) => ctx, modifiers: [] }],
        properties: meta.computed_props,
        controller: target,
        proto: prototypeOf(target),
      });
      Route("handler", entry.callback.method, entry.endpoint)(
        target.prototype,
        key,
        {
          value: entry.callback.func,
        },
      );
    }
  };

/** The row a route writes, refused before the write when a field holds a value no database stores. */
function writtenRow(row: RowFields): WriteDocument {
  if (isWriteDocument(row)) {
    return row;
  }
  const [field] =
    Object.entries(row).find(([, value]) => !isWriteValue(value)) ?? [];
  throw new TypeError(
    `Field '${field}' holds a bigint, a symbol or a function, which no database stores`,
  );
}

export namespace DefaultRoutes {
  /** Receives the loaded, unlocked model before readable fields are selected. Throw to deny the read. */
  export type GetGuard = (
    this: DataControllerInstance,
    ctx: RequestContext,
    current: RowFields,
    params: Parameters.GetParameters,
  ) => void | Promise<void>;

  /** What {@link readRow} reads, and the guard it runs on the loaded model. */
  interface RowRead {
    params: Parameters.GetParameters;
    reqCtx?: RequestContext;
    guard?: GetGuard;
  }

  /**
   * One row as the Get route answers it: joined, computed then foreign
   * fields, unlocked, guarded, then projected on the fields `get` reads.
   */
  async function readRow(
    controller: ThisParameterType<GetGuard>,
    meta: DataAPIMeta,
    { params, reqCtx, guard }: RowRead,
  ) {
    const model = Query.GetModel(controller, meta);
    let query = Query.Get(model.table, params.id, params.index);

    query = Query.Joined(model.database, meta, query);
    query = Query.Computed(model.database, meta, query);

    if (!params.noForeign) {
      query = Query.Foreign(model.database, meta, query);
    }

    const dbResult = model.constructor.fromDatabase(await query);
    assert(dbResult, 404, "Not Found");
    Validation.Unlock(controller, meta, dbResult);
    if (guard && reqCtx) await guard.call(controller, reqCtx, dbResult, params);

    const results = await Query.ReadProperties(
      controller,
      meta,
      dbResult,
      "get",
    );

    Validation.ClearInternal(meta, results);

    return results;
  }

  async function getRow(
    this: DataControllerInstance,
    reqCtx: RequestContext,
    params: Parameters.GetParameters,
    guard?: GetGuard,
  ) {
    const meta = GetDataControllerMeta(this);
    return readRow(this, meta, { params, reqCtx, guard });
  }

  async function listRows(
    this: DataControllerInstance,
    reqCtx: RequestContext,
    params: Parameters.ListParameters,
  ) {
    const meta = GetDataControllerMeta(this);

    const model = Query.GetModel(this, meta);
    const sort: Parameters<typeof Query.List>[4] = params?.sortKey
      ? [params.sortKey, params.sortDirection]
      : undefined;
    const [query, queryTotal, deferredJoined] = Query.List(
      this,
      meta,
      model.table,
      reqCtx,
      sort,
      params?.filters,
      model.database,
      { exposeDeferredJoined: true },
    );

    const pluck: Set<string> | undefined =
      meta.pluck[params.pluckMode ?? "list"];
    assert(
      params.noPluck || pluck,
      400,
      `No fields found for pluckMode '${params.pluckMode ?? "list"}'`,
    );

    const offset = params.offset || 0;
    const limit = params.limit || 10;
    const queryPaged = Query.ListPage(model.database, meta, query, {
      offset,
      limit,
      filters: params.filters,
      sortKey: params.sortKey,
      pluck: params.noPluck ? undefined : pluck,
      noForeign: params.noForeign,
      deferredJoined,
    });

    const [dbResult, dbTotal] = await Promise.all([queryPaged, queryTotal]);

    const results = await Promise.all(
      dbResult.map((entry) => {
        const entryInstance = model.constructor.fromDatabase(entry);
        assert(entryInstance, 500, "The database answered an empty row.");
        Validation.Unlock(this, meta, entryInstance);
        return Query.ReadProperties(this, meta, entryInstance, "list");
      }),
    );

    Validation.ClearInternal(meta, results);

    return {
      results,
      total: dbTotal,
      offset,
      limit,
    };
  }

  async function newRow(
    this: DataControllerInstance,
    _reqCtx: RequestContext,
    params: Parameters.NewParameters,
    body: Validation.WrittenBody,
  ) {
    const meta = GetDataControllerMeta(this);

    const data = Validation.ParseBody(body);
    if (!params.noMandatory) {
      Validation.MandatoryFields(meta, data, "new");
    }
    const parsed = await Validation.ValidateTypes(meta, data);

    const dbData = await Query.WriteProperties(this, meta, parsed, "new");
    Validation.Lock(this, meta, dbData);

    const model = Query.GetModel(this, meta);
    triggerEvent(dbData, "insert");
    const [id] = await model.table.insert(writtenRow(dbData));

    const created = await readRow(this, meta, { params: { id } });
    return { _id: id, ...created };
  }

  async function editRow(
    this: DataControllerInstance,
    _reqCtx: RequestContext,
    params: Parameters.EditParameters,
    body: Validation.WrittenBody,
  ) {
    const meta = GetDataControllerMeta(this);

    const data = Validation.ParseBody(body);
    if (!params.noMandatory) {
      Validation.MandatoryFields(meta, data, "edit");
    }
    const parsed = await Validation.ValidateTypes(meta, data);

    const model = Query.GetModel(this, meta);

    const stored = await Query.Get(model.table, params.id, params.index);
    assert(stored, 404, "Not Found");

    const dbData = await Query.WriteProperties(
      this,
      meta,
      parsed,
      "edit",
      stored,
    );
    Validation.Lock(this, meta, dbData);

    triggerEvent(dbData, "update");
    await model.table.get(params.id).update(writtenRow(dbData));

    return readRow(this, meta, {
      params: { id: params.id, index: params.index },
    });
  }

  async function deleteRows(
    this: DataControllerInstance,
    _reqCtx: RequestContext,
    params: Parameters.DeleteParameters,
  ) {
    const meta = GetDataControllerMeta(this);

    const model = Query.GetModel(this, meta);

    const query = Query.Delete(model.table, params.id);

    const dbResult = await query;
    return dbResult;
  }

  Object.defineProperty(getRow, "name", { value: "get" });
  Object.defineProperty(listRows, "name", { value: "list" });
  Object.defineProperty(newRow, "name", { value: "new" });
  Object.defineProperty(editRow, "name", { value: "edit" });
  Object.defineProperty(deleteRows, "name", { value: "delete" });

  export const Get: DataControllerCallback<
    Parameters.GetParameters,
    RowFields,
    [RequestContext, Parameters.GetParameters]
  > = {
    func: getRow,
    args: [Context(), Parameters.Get()],
    method: "get",
  };

  /**
   * Creates a Get route with an awaited guard after loading and unlocking the
   * model, before response projection/transformation. Uses the same query and
   * preserves controller `this` and request context. Missing rows remain 404.
   * The guard must treat the model as read-only; it includes non-readable fields
   * and the normal Get joined/computed/foreign data, not the response DTO.
   */
  export function WithGetGuard(
    guard: GetGuard,
  ): DataControllerCallback<
    Parameters.GetParameters,
    RowFields,
    [RequestContext, Parameters.GetParameters]
  > {
    return {
      ...Get,
      func: function (this: DataControllerInstance, ctx, params) {
        return getRow.call(this, ctx, params, guard);
      },
    };
  }

  export const List: DataControllerCallback<
    Parameters.ListParameters,
    Awaited<ReturnType<typeof listRows>>,
    [RequestContext, Parameters.ListParameters]
  > = {
    func: listRows,
    args: [Context(), Parameters.List()],
    method: "get",
  };
  /**
   * Answers the created row with its `_id`, even when `get` does not read
   * `_id`: the caller needs it to name the row it created.
   */
  export const New: DataControllerCallback<
    Parameters.NewParameters,
    Awaited<ReturnType<typeof newRow>>,
    [RequestContext, Parameters.NewParameters, Validation.WrittenBody]
  > = {
    func: newRow,
    args: [Context(), Parameters.New(), RawBody()],
    method: "post",
  };
  export const Edit: DataControllerCallback<
    Parameters.EditParameters,
    Awaited<ReturnType<typeof editRow>>,
    [RequestContext, Parameters.EditParameters, Validation.WrittenBody]
  > = {
    func: editRow,
    args: [Context(), Parameters.Edit(), RawBody()],
    method: "put",
  };
  export const Delete: DataControllerCallback<
    Parameters.DeleteParameters,
    Awaited<ReturnType<typeof deleteRows>>,
    [RequestContext, Parameters.DeleteParameters]
  > = {
    func: deleteRows,
    args: [Context(), Parameters.Delete()],
    method: "delete",
  };

  export const All = {
    get: Get,
    list: List,
    new: New,
    edit: Edit,
    delete: Delete,
  } as const;

  export function WithOptions<O, R, A extends unknown[]>(
    callback:
      | DataControllerCallback<O, R, A>
      | DataControllerCallbackWithOptions<O, R, A>,
    options?: Partial<O>,
    endpoint?: string,
  ): DataControllerCallbackWithOptions<O, R, A> {
    if ("func" in callback) {
      return {
        endpoint,
        options,
        callback,
      };
    } else {
      return {
        endpoint: endpoint ?? callback.endpoint,
        options: { ...callback.options, ...options },
        callback: callback.callback,
      };
    }
  }
}
