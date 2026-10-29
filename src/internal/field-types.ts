/** @internal @packageDocumentation */

import type { RequestContext } from "@antelopejs/interface-api";
import type { Class } from "@antelopejs/interface-core/decorators";
import type {
  Query,
  SchemaInstance,
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import type { Table } from "@antelopejs/interface-database-decorators";

import type { AccessMode, DataAPIMeta } from "../metadata";

/**
 * A `@Joined` field declared on the target of a relation, captured so the
 * foreign lookup can re-materialize it (joined fields are not physical columns,
 * so a plain pluck of the target table would return them empty).
 */
export interface ForeignJoinedRef {
  name: string;
  table: string;
  tableClass?: Class<Table>;
  localKey: string;
  remoteField: string;
  remoteIndex: string;
  schemaName?: string;
}

/** A value a request body or a table row holds. */
export type FieldValue =
  | string
  | number
  | boolean
  | null
  | Date
  | FieldValue[]
  | FieldValues;

/** Fields by name, as a request body or a table row holds them. */
export interface FieldValues {
  [field: string]: FieldValue | undefined;
}

/** Parse outcome accepting the field value, carrying the value to write. */
export interface FieldParseSuccess {
  success: true;
  data: FieldValue | undefined;
}

/** Parse outcome rejecting the field value. */
export interface FieldParseFailure {
  success: false;
}

/** Parse outcome of a field value, shaped like the result of zod's `safeParse`. */
export type FieldParseResult = FieldParseSuccess | FieldParseFailure;

/**
 * Outcome of a field validator: `true`/`false` accepts or rejects the raw
 * value, which is then written as received; a {@link FieldParseResult}
 * accepts or rejects it, and on success its `data` is written instead of the
 * raw value.
 */
export type FieldValidationResult = boolean | FieldParseResult;

/** Field value validator, see {@link FieldValidationResult}. */
export type FieldValidator = (
  value: FieldValue | undefined,
) => FieldValidationResult | Promise<FieldValidationResult>;

/** What a foreign key declaration takes after the field and the other table. */
export type ForeignOptions = [
  index?: string,
  multi?: boolean,
  pluck?: string[],
  schema?: string,
  targetMeta?: DataAPIMeta,
];

/** DataAPI Metadata field information. */
export interface FieldData {
  /**
   * Field name in-database.
   */
  dbName?: string;

  /**
   * Field access mode.
   *
   * @see {@link AccessMode}
   */
  mode?: AccessMode;

  /**
   * Field access mode overrides per DataAPI action.
   */
  modeOverrides?: Record<string, AccessMode>;

  /**
   * DB Fields that should be selected for this field.
   */
  listable?: Record<string, string[]>;

  /**
   * Set of api methods for which the field must be set.
   */
  mandatory?: Set<string>;

  /**
   * Whether the DataAPI can be sorted using this field.
   */
  sortable?: { indexed?: boolean };

  /**
   * Foreign key reference.
   *
   * `schemaName` is set when the target lives in another schema than the
   * controller's table; runtime resolves the foreign lookup against that
   * schema's default instance instead of the source instance.
   */
  foreign?: [
    table: string,
    tableClass?: Class<Table>,
    index?: string,
    multi?: true,
    pluck?: string[],
    schemaName?: string,
    targetJoined?: ForeignJoinedRef[],
  ];

  /**
   * Joined-from-other-table reference.
   *
   * Imports a single scalar field from another table at query time and
   * flattens it into the row, enabling sort/search/filter natively in DB.
   *
   * `schemaName` is set when the target lives in another schema than the
   * controller's table; runtime resolves the join against that schema's
   * default instance instead of the source instance.
   */
  joined?: {
    table: string;
    tableClass?: Class<Table>;
    localKey: string;
    remoteField: string;
    remoteIndex: string;
    schemaName?: string;
  };

  /**
   * In-database computed value.
   *
   * The expression is merged into each row at query time, enabling sort,
   * filter, and pagination natively in DB.
   */
  computed?: ComputedFieldData;

  /**
   * Value validator callback.
   */
  validator?: FieldValidator;

  /**
   * Field property descriptor.
   */
  desc?: PropertyDescriptor;

  /**
   * Whether or not an `eq` filter with this field name can use an indexed lookup.
   */
  indexable?: boolean;
}

/**
 * In-database computed field expression.
 *
 * Receives the row proxy and the schema instance of the controller's table.
 * May return a row-local expression (built from `row`) or a per-row subquery
 * (ex: an aggregate over another table).
 */
export type ComputedExpression = (
  row: ValueProxy<Record<string, any>>,
  db: SchemaInstance<any>,
) => ValueProxyOrValue<unknown> | Query<unknown>;

/**
 * Computed field options.
 */
export interface ComputedOptions {
  /**
   * Fallback merged over the computed value when the expression yields null
   * (ex: `0` for an aggregate count over an empty set).
   */
  default?: unknown;
}

/**
 * Computed field information.
 */
export interface ComputedFieldData extends ComputedOptions {
  expr: ComputedExpression;
}

export type Comparison = "eq" | "ne" | "gt" | "ge" | "lt" | "le";

export type FilterValue = [value: string, mode: Comparison];

/**
 * The filters of one field in a list request: one {@link FilterValue}, or
 * several a row must all pass (`?filter_age=ge:18&filter_age=lt:65`).
 */
export type FieldFilter = FilterValue | FilterValue[];

/**
 * Filter callback.
 */
export type FilterFunction<
  T extends Record<string, any>,
  U extends Record<string, any> = Record<string, any>,
> = (
  context: RequestContext & { this: T },
  proxy: ValueProxy<any>,
  key: string,
  ...rest: [value: FilterValue[0], mode: FilterValue[1], row: ValueProxy<U>]
) => ValueProxyOrValue<boolean>;

export interface ReadableAccessFields {
  getters: [string, FieldData][];
  props: [string, FieldData][];
}

export interface WritableAccessFields {
  setters: [string, FieldData][];
  props: [string, FieldData][];
}
