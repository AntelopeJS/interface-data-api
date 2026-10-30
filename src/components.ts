import { assert } from "@antelopejs/interface-api-util";
import type { DataModel } from "@antelopejs/interface-database-decorators/model";
import { getMetadata } from "@antelopejs/interface-database-decorators/common";
import { MakeParameterAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  type computeParameter,
  HTTPResult,
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import type {
  Datum,
  SchemaInstance,
  Stream,
  Table,
  ValueProxy,
} from "@antelopejs/interface-database";
import "@antelopejs/interface-database";
import {
  lock,
  ModifiersDynamicMetadata,
} from "@antelopejs/interface-database-decorators/modifiers/common";

import {
  type DataAPIMeta,
  type FieldFilter,
  type FieldValues,
  type FieldParseResult,
  type FieldValidationResult,
  type FieldValidator,
  GetDataControllerMeta,
} from "./metadata";
import * as computed from "./internal/computed";
import { copyFilter, parseFilter } from "./internal/filters";
import * as foreign from "./internal/foreign";
import { isString } from "./internal/guards";
import * as joined from "./internal/joined";
import * as list from "./internal/list";
import * as properties from "./internal/properties";
import * as tables from "./internal/tables";
import * as validation from "./internal/validation";

export namespace Parameters {
  /** The controller a parameter provider computes its parameter for. */
  type Owner = Parameters<typeof computeParameter>[2];

  export function GetOptionOverrides<T extends Record<string, any>>(
    reqCtx: RequestContext,
  ): T {
    return (<any>reqCtx).dataAPIEntry?.options ?? {};
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
  function isConverterKey(name: string): name is ConvertersKey {
    return Object.hasOwn(converters, name);
  }

  function converterOf(name: string) {
    if (!isConverterKey(name)) {
      throw new TypeError(`Unknown parameter converter "${name}"`);
    }
    return converters[name];
  }

  function extractFromSearchParams(
    reqCtx: RequestContext,
    key: string,
    extractor: ConvertersKey | `multi:${ConvertersKey}`,
  ) {
    if (extractor.startsWith("multi:")) {
      const name = extractor.substring(6);
      return reqCtx.url.searchParams
        .getAll(key)
        .map((searchVal) => converterOf(name)(searchVal));
    }
    const searchVal = reqCtx.url.searchParams.get(key);
    return searchVal === null ? undefined : converterOf(extractor)(searchVal);
  }

  export function ExtractGeneric<T extends Record<string, any>>(
    reqCtx: RequestContext,
    meta: DataAPIMeta,
    dynamic: GenericParams<Partial<T>>,
  ) {
    const overrides = GetOptionOverrides<T>(reqCtx);
    const result: Partial<T> = { ...overrides };
    for (const key of Object.keys(dynamic)) {
      // SAFETY: key comes from Object.keys(dynamic), typed GenericParams<Partial<T>> (a mapped type over keyof T), so for a type-checked argument it is a keyof T; false only for a stray key on a non-literal argument, which is harmless as the key is only written on result.
      const field = key as keyof T;
      const extractor = dynamic[key];
      if (key in result && extractor !== ExtractFilters) continue;
      if (isString(extractor)) {
        const value = extractFromSearchParams(reqCtx, key, extractor);
        if (value !== undefined) result[field] = value as any;
      } else {
        result[field] = extractor(reqCtx, meta);
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

      assert(params.id && isString(params.id), 400, "Missing id.");

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

      assert(params.id && isString(params.id), 400, "Missing id.");

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
    return foreign.Foreign(db, meta, query, pluck);
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
    return joined.Joined(db, meta, query, only);
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
    return computed.Computed(db, meta, query, only);
  }

  export async function ReadProperties(
    obj: any,
    meta: DataAPIMeta,
    dbData: any,
    action?: string,
    onlyList?: boolean,
  ) {
    return properties.ReadProperties(obj, meta, dbData, action, onlyList);
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
    bodyData: FieldValues,
    action?: string,
    existingDBData?: Record<string, any>,
  ) {
    return properties.WriteProperties(
      obj,
      meta,
      bodyData,
      action,
      existingDBData,
    );
  }

  export function Get(
    table: Table<any>,
    id: string | ValueProxy<string>,
    index?: string,
  ) {
    return tables.Get(table, id, index);
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

  /** What {@link List} takes after the request context. */
  export type ListTail = [
    sorting?: [string, "asc" | "desc" | undefined],
    filters?: Record<string, FieldFilter>,
    db?: SchemaInstance<any>,
    options?: ListOptions,
  ];

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
    ...[sorting, filters, db, options]: ListTail
  ): [sorted: Stream<T>, total: Datum<number>, deferredJoined: Set<string>] {
    return list.List(obj, meta, request, reqCtx, {
      sorting,
      filters,
      db,
      options,
    });
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
    return list.ListPage(db, meta, query, options);
  }

  export function Delete(table: Table<any>, id: string | string[]) {
    return Array.isArray(id)
      ? table.getAll(id).delete()
      : table.get(id).delete();
  }
}

export namespace Validation {
  /** A request body, parsed. */
  export type RequestBody = FieldValues;

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
    return validation.ParseBody(body);
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
    validation.Unlock(obj, meta, dbData);
  }

  export function UnlockRequest<T extends {}, K extends keyof T>(
    obj: any,
    meta: DataAPIMeta,
    row: ValueProxy<T>,
    field: K,
  ): ValueProxy<T[K]> {
    return validation.UnlockRequest(obj, meta, row, field);
  }

  export function ClearInternal(
    meta: DataAPIMeta,
    obj: FieldValues | FieldValues[],
  ) {
    validation.ClearInternal(meta, obj);
  }
}
