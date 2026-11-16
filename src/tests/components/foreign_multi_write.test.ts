import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import { Access, AccessMode, Foreign, ModelReference } from "../../metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { createdRowSchema, readJson } from "../internal/http";
import {
  editRequest,
  getFunctionName,
  getSchemaInstance,
  newRequest,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const itemTableName = `items-${currentTestName}`;
const orderTableName = `orders-${currentTestName}`;
const schemaName = "default";
const nonArrayValues = ["item-1", 7, { id: "item-1" }, true];

@RegisterTable(itemTableName, schemaName)
class Item extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;
}

@RegisterTable(orderTableName, schemaName)
class Order extends Table {
  declare _id: string;

  @Field("string")
  declare label: string;

  @Field("array")
  declare items: (string | null)[];
}
class OrderModel extends BasicDataModel(Order, orderTableName) {}

describe("Foreign multi reference writes", () => {
  it("refuses a create with a non-array value and stores nothing", async () =>
    await expectNewRefusesNonArray());
  it("refuses an update with a non-array value and keeps the stored array", async () =>
    await expectEditRefusesNonArray());
  it("keeps creating with an array and without the field", async () =>
    await expectNewAcceptsArrayAndAbsent());
  it("keeps updating with an array and without the field", async () =>
    await expectEditAcceptsArrayAndAbsent());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _ForeignMultiWriteAPI extends DataController(
    Order,
    { new: DefaultRoutes.New, edit: DefaultRoutes.Edit },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(OrderModel)
    declare orderModel: OrderModel;

    @Access(AccessMode.ReadWrite)
    declare label: string;

    @Foreign(Item, undefined, true)
    @Access(AccessMode.ReadWrite)
    declare items: Item[];
  }

  await RegisterSchema(schemaName);
  const schema = Schema.get(schemaName);
  if (schema) await schema.instance().table(orderTableName).delete().run();
  return new OrderModel(getSchemaInstance(schemaName));
}

async function expectRefusal(response: Response) {
  const text = await response.text();
  expect(response.status, text).to.equal(400);
  expect(text).to.include("items");
}

async function expectNewRefusesNonArray() {
  const model = await _createDataController(getFunctionName());
  for (const items of nonArrayValues) {
    await expectRefusal(
      await newRequest(getFunctionName(), { label: "bad", items }),
    );
  }
  expect(await model.getAll()).to.have.length(0);
}

async function expectEditRefusesNonArray() {
  const model = await _createDataController(getFunctionName());
  const [id] = Object.values(
    await model.insert([{ label: "kept", items: ["a", "b"] }]),
  );
  for (const items of nonArrayValues) {
    await expectRefusal(
      await editRequest(getFunctionName(), { label: "bad", items }, { id }),
    );
  }
  const stored = await model.get(id);
  expect(stored?.label).to.equal("kept");
  expect(stored?.items).to.deep.equal(["a", "b"]);
}

async function expectNewAcceptsArrayAndAbsent() {
  const model = await _createDataController(getFunctionName());
  const withArray = await newRequest(getFunctionName(), {
    label: "array",
    items: ["a", "b"],
  });
  expect(withArray.status, await withArray.clone().text()).to.equal(200);
  const withoutField = await newRequest(getFunctionName(), { label: "absent" });
  expect(withoutField.status, await withoutField.clone().text()).to.equal(200);
  const created = await readJson(createdRowSchema, withArray);
  expect((await model.get(created._id))?.items).to.deep.equal(["a", "b"]);
}

async function expectEditAcceptsArrayAndAbsent() {
  const model = await _createDataController(getFunctionName());
  const [id] = Object.values(
    await model.insert([{ label: "old", items: ["a"] }]),
  );
  const labelOnly = await editRequest(
    getFunctionName(),
    { label: "new" },
    { id },
  );
  expect(labelOnly.status, await labelOnly.clone().text()).to.equal(200);
  expect((await model.get(id))?.items).to.deep.equal(["a"]);
  const withArray = await editRequest(
    getFunctionName(),
    { items: ["c", "d"] },
    { id },
  );
  expect(withArray.status, await withArray.clone().text()).to.equal(200);
  expect((await model.get(id))?.items).to.deep.equal(["c", "d"]);
}
