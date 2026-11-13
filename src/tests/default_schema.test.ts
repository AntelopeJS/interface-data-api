import {
  BasicDataModel,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { getSchemaInstance } from "./utils";

const schemaName = "default";
const readinessTableName = "default-schema-readiness";

@RegisterTable(readinessTableName, schemaName)
class DefaultSchemaReadiness extends Table {
  declare _id: string;
}
class DefaultSchemaReadinessModel extends BasicDataModel(
  DefaultSchemaReadiness,
  readinessTableName,
) {}

/**
 * Builds the collections and indexes of every table the test files register in
 * the shared schema before the first test runs, so a test is not charged for
 * that one-time build. A query waits until the database module has built them.
 */
before("build the tables of the default schema", async function () {
  this.timeout(30_000);
  await RegisterSchema(schemaName);
  await new DefaultSchemaReadinessModel(getSchemaInstance(schemaName)).getAll();
});
