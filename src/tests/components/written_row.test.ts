import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import { Access, AccessMode, ModelReference } from "../../metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { editRequest, getFunctionName, newRequest } from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const counterTableName = `counters-${currentTestName}`;
const schemaName = "default";
const counterName = "visits";

@RegisterTable(counterTableName, schemaName)
class Counter extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;

  @Field("number")
  declare count: bigint;
}
class CounterModel extends BasicDataModel(Counter, counterTableName) {}

describe("Written row", () => {
  it("refuses a new row whose setter writes a bigint, and writes nothing", async () =>
    await expectRefusesNewBigint());
  it("refuses an edit whose setter writes a bigint, and keeps the row", async () =>
    await expectRefusesEditedBigint());
});

function counters() {
  const schema = Schema.get(schemaName);
  if (!schema) {
    throw new Error(`Schema '${schemaName}' is not registered`);
  }
  return schema.instance().table(counterTableName);
}

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _WrittenRowTestAPI extends DataController(
    Counter,
    { new: DefaultRoutes.New, edit: DefaultRoutes.Edit },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(CounterModel)
    declare counterModel: CounterModel;

    declare _id: string;

    @Access(AccessMode.ReadWrite)
    declare name: string;

    @Access(AccessMode.WriteOnly)
    set count(value: number) {
      this.table.count = BigInt(value);
    }
  }
  await RegisterSchema(schemaName);
  await counters().delete();
}

async function expectRefusesNewBigint() {
  await _createDataController(getFunctionName());

  const response = await newRequest(getFunctionName(), {
    name: counterName,
    count: 2,
  });

  expect(response.status).to.equal(500);
  expect(await counters().count()).to.equal(0);
}

async function expectRefusesEditedBigint() {
  await _createDataController(getFunctionName());
  const [id] = await counters().insert({ name: counterName });

  const response = await editRequest(getFunctionName(), { count: 3 }, { id });

  expect(response.status).to.equal(500);
  const stored: unknown = await counters().get(id);
  expect(stored).to.include({ name: counterName });
  expect(stored).to.not.have.property("count");
}
