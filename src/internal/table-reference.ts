/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";
import {
  DatumStaticMetadata,
  getMetadata,
  getTablesForSchema,
  type Table,
} from "@antelopejs/interface-database-decorators";

interface ResolvedTableReference {
  tableName: string;
  tableClass?: Class<Table>;
  /** `undefined` means same schema as the source DataAPI. */
  schemaName?: string;
}

function readTableMetadata(table: Class<Table>) {
  const meta = getMetadata(table, DatumStaticMetadata);
  return { schemaName: meta?.schemaName, tableName: meta?.tableName };
}

export function resolveTableReference(
  sourceSchemaName: string,
  table: string | Class<Table>,
  explicitSchema: string | undefined,
  contextLabel: string,
): ResolvedTableReference {
  if (typeof table !== "string") {
    const inferred = readTableMetadata(table);
    const schemaName = explicitSchema ?? inferred.schemaName;
    const tableName = inferred.tableName;
    if (!schemaName || !tableName) {
      throw new Error(
        `Unable to infer table name/schema for ${contextLabel}: pass @RegisterTable on the table class`,
      );
    }
    if (
      explicitSchema &&
      inferred.schemaName &&
      explicitSchema !== inferred.schemaName
    ) {
      throw new Error(
        `Schema mismatch for ${contextLabel}: class registers in "${inferred.schemaName}" but option specifies "${explicitSchema}"`,
      );
    }
    return {
      tableName,
      tableClass: table,
      schemaName: schemaName === sourceSchemaName ? undefined : schemaName,
    };
  }

  const targetSchema = explicitSchema ?? sourceSchemaName;
  const databaseSchema = getTablesForSchema(targetSchema);
  if (!databaseSchema) {
    throw new Error(`Schema "${targetSchema}" not found for ${contextLabel}`);
  }
  const tableClass = databaseSchema[table];
  const isOtherSchema = targetSchema !== sourceSchemaName;
  if (isOtherSchema && !tableClass) {
    throw new Error(
      `Table "${table}" is not registered in schema "${targetSchema}" for ${contextLabel}: register its class with @RegisterTable before declaring the field`,
    );
  }
  return {
    tableName: table,
    tableClass,
    schemaName: isOtherSchema ? targetSchema : undefined,
  };
}
