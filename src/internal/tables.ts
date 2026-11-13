/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";
import type { Constructible } from "@antelopejs/interface-database-decorators/common";
import type { DataModel } from "@antelopejs/interface-database-decorators/model";
import type {
  SchemaInstance,
  Stream,
  Table,
  ValueProxy,
} from "@antelopejs/interface-database";
import type { TableClass } from "@antelopejs/interface-database-decorators/table";

import type { ComputedFieldData, StoredRow } from "../metadata";
import { isFunction, isObject, isString } from "./guards";

export type TableRow = Parameters<ComputedFieldData["expr"]>[0];

/**
 * The database model a controller holds under its `@ModelReference` field,
 * typed by the table rows it reads.
 */
export type ModelInstance = InstanceType<DataModel<StoredRow>> & {
  constructor: DataModel<StoredRow>;
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
 * internal fields the modifiers keep, as the stream `lookup` takes.
 */
export function pluckedTable(
  table: Table<any>,
  ...fields: string[]
): Stream<any> {
  return table.pluck("_internal", ...fields);
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
