/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";
import type { Constructible } from "@antelopejs/interface-database-decorators/common";
import type { DataModel } from "@antelopejs/interface-database-decorators/model";
import type {
  SchemaInstance,
  Table,
  ValueProxy,
} from "@antelopejs/interface-database";
import type { TableClass } from "@antelopejs/interface-database-decorators/table";

import type { ComputedFieldData, RowFields } from "../metadata";
import { isFunction, isObject, isString } from "./guards";

export type TableRow = Parameters<ComputedFieldData["expr"]>[0];

/**
 * The database model a controller holds under its `@ModelReference` field,
 * typed by the table rows it reads.
 */
export type ModelInstance = InstanceType<DataModel<RowFields>> & {
  constructor: DataModel<RowFields>;
};

/** Whether a value is a database model: its table, and its row conversion. */
export function isModelInstance(value: unknown): value is ModelInstance {
  return (
    isObject(value) &&
    "table" in value &&
    isObject(value.table) &&
    "database" in value &&
    isObject(value.database) &&
    "fromDatabase" in value.constructor &&
    isFunction(value.constructor.fromDatabase)
  );
}

export interface TableTargetReference {
  table: string;
  tableClass?: Constructible;
  schemaName?: string;
}

function isTableClass(
  value: Constructible | undefined,
): value is Constructible & TableClass {
  return (
    isFunction(value) &&
    "table" in value &&
    isFunction(value.table) &&
    "with" in value &&
    isFunction(value.with)
  );
}

export function targetTable(
  sourceDb: SchemaInstance<any>,
  target: TableTargetReference,
): Table<any> {
  if (!target.schemaName) return sourceDb.table(target.table);
  assert(
    isTableClass(target.tableClass),
    500,
    `Table "${target.table}" of schema "${target.schemaName}" has no registered table class`,
  );
  return target.tableClass.table();
}

/**
 * The lookup side of a relation: `table` reduced to `fields`, with the
 * internal fields the modifiers keep. A plucked table is a staged selection
 * the database accepts wherever it takes a table, but its type is a stream.
 */
export function pluckedTable(
  table: Table<any>,
  ...fields: string[]
): Table<any> {
  // SAFETY: pluck returns a Stream, which has none of Table's own methods; pluckedTable is only called in joined.ts and foreign.ts to build the right-hand side of lookup, and lookup reads that argument only through its stage list (build()), which the pluck stage extends.
  return table.pluck("_internal", ...fields) as Table<any>;
}

export function Get<T extends object>(
  table: Table<T>,
  id: string | ValueProxy<string>,
  index?: string,
) {
  if (!index) return table.get(id);
  const key = isString(id) ? id : id.cast<string | number | boolean>();
  return table.getAll(key, index).nth(0);
}
