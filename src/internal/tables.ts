/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";
import type { Constructible } from "@antelopejs/interface-database-decorators/common";
import type {
  SchemaInstance,
  Table,
  ValueProxy,
} from "@antelopejs/interface-database";
import type { TableClass } from "@antelopejs/interface-database-decorators/table";

import type { ComputedFieldData } from "../metadata";

export type TableRow = Parameters<ComputedFieldData["expr"]>[0];

export interface TableTargetReference {
  table: string;
  tableClass?: Constructible;
  schemaName?: string;
}

export function targetTable(
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

export function Get(
  table: Table<any>,
  id: string | ValueProxy<string>,
  index?: string,
) {
  return index ? table.getAll(id as string, index).nth(0) : table.get(id);
}
