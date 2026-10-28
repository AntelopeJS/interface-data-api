import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { Validation } from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
  Mandatory,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Index,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { readJson } from "../internal/http";
import {
  editRequest,
  getFunctionName,
  getSchemaInstance,
  newRequest,
  request,
  type CreatedRow,
  validateObject,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const orderTableName = `orders-${currentTestName}`;
const schemaName = "default";

@RegisterTable(orderTableName, schemaName)
class Order extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare internalReference: string;

  @Field("string")
  declare customerName: string;

  @Field("string")
  declare customerEmail: string;

  @Field("number")
  declare totalAmount: number;

  @Field("string")
  declare status: string;

  @Field("string")
  declare notes: string;
}
class OrderModel extends BasicDataModel(Order, orderTableName) {}

const validOrderDataset = {
  default: {
    customerName: "Bob",
    customerEmail: "bob@example.com",
    totalAmount: 99.99,
    status: "pending",
    notes: "Customer requested express shipping",
    internalReference: "INT-REF-001",
  },
  alternative: {
    customerName: "Alice",
    customerEmail: "alice@example.com",
    totalAmount: 149.99,
    status: "processing",
    notes: "Customer requested express shipping",
    internalReference: "INT-REF-002",
  },
} satisfies Record<string, Partial<Order>>;

describe("Field Mandatory", () => {
  it("new row with all mandatory fields", async () =>
    await expectNewWithAllMandatoryFields());
  it("new row with missing mandatory fields", async () =>
    await expectNewWithMissingMandatoryFields());
  it("edit row with all mandatory fields", async () =>
    await expectEditWithAllMandatoryFields());
  it("edit row without a mandatory field keeps its value", async () =>
    await expectEditWithoutMandatoryFieldKeepsValue());
  it("edit row clearing a mandatory field", async () =>
    await expectEditClearingMandatoryField());
  it("skip mandatory validation when noMandatory is true", async () =>
    await expectSkipMandatoryValidationWhenNoMandatory());
});

async function _dropOrderTable() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(orderTableName).delete();
  }
}

async function _createDataController(
  testName: string,
  route: any,
  order?: Partial<Order>,
) {
  @RegisterDataController()
  class _MandatoryTestAPI extends DataController(
    Order,
    route,
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(OrderModel)
    declare orderModel: OrderModel;

    declare _id: string;

    @Access(AccessMode.ReadWrite)
    @Mandatory("new", "edit")
    declare customerName: string;

    @Access(AccessMode.ReadWrite)
    @Mandatory("new")
    declare customerEmail: string;

    @Access(AccessMode.ReadWrite)
    @Mandatory("new", "edit")
    declare totalAmount: number;

    @Access(AccessMode.ReadWrite)
    @Mandatory("edit")
    declare status: string;

    @Access(AccessMode.ReadWrite)
    declare notes: string;

    @Access(AccessMode.ReadWrite)
    declare internalReference: string;
  }
  await RegisterSchema(schemaName);
  await _dropOrderTable();
  const orderModel = new OrderModel(getSchemaInstance(schemaName));

  if (order) {
    const insertResult = await orderModel.insert(order);
    return { id: insertResult[0], orderModel };
  }
  return { orderModel };
}

async function expectNewWithAllMandatoryFields() {
  const { orderModel } = await _createDataController(
    getFunctionName(),
    { new: DefaultRoutes.New },
    validOrderDataset.alternative,
  );

  const response = await newRequest(getFunctionName(), {
    customerName: validOrderDataset.default.customerName,
    customerEmail: validOrderDataset.default.customerEmail,
    totalAmount: validOrderDataset.default.totalAmount,
  });
  expect(response.status).to.equal(200);
  const created = await readJson<CreatedRow>(response);
  expect(created._id).to.be.a("string");
  const order = await orderModel.get(created._id);
  expect(order).to.not.equal(undefined);
  if (order) {
    await validateObject(order, validOrderDataset.default, [
      "customerName",
      "customerEmail",
      "totalAmount",
    ]);
  }
}

async function expectNewWithMissingMandatoryFields() {
  await _createDataController(getFunctionName(), { new: DefaultRoutes.New });

  const response = await newRequest(getFunctionName(), {
    customerName: validOrderDataset.default.customerName,
    totalAmount: validOrderDataset.default.totalAmount,
  });
  expect(response.status).to.equal(400);
  expect(await response.json()).to.deep.equal({
    code: Validation.MISSING_MANDATORY_FIELDS,
    fields: ["customerEmail"],
  });
}

async function expectEditWithAllMandatoryFields() {
  const { id, orderModel } = await _createDataController(
    getFunctionName(),
    { edit: DefaultRoutes.Edit },
    validOrderDataset.default,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    {
      customerName: validOrderDataset.alternative.customerName,
      totalAmount: validOrderDataset.alternative.totalAmount,
      status: validOrderDataset.alternative.status,
    },
    { id },
  );
  expect(response.status).to.equal(200);

  const order = await orderModel.get(id);
  expect(order).to.be.an("object");
  expect(order).to.have.property(
    "customerName",
    validOrderDataset.alternative.customerName,
  );
  expect(order).to.have.property(
    "totalAmount",
    validOrderDataset.alternative.totalAmount,
  );
  expect(order).to.have.property(
    "status",
    validOrderDataset.alternative.status,
  );
  if (order) {
    await validateObject(order, validOrderDataset.default, [
      "customerEmail",
      "notes",
      "internalReference",
    ]);
  }
}

async function expectEditWithoutMandatoryFieldKeepsValue() {
  const { id, orderModel } = await _createDataController(
    getFunctionName(),
    { edit: DefaultRoutes.Edit },
    validOrderDataset.default,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    {
      customerName: validOrderDataset.alternative.customerName,
      totalAmount: validOrderDataset.alternative.totalAmount,
    },
    { id },
  );
  expect(response.status).to.equal(200);

  const order = await orderModel.get(id);
  expect(order).to.have.property("status", validOrderDataset.default.status);
}

async function expectEditClearingMandatoryField() {
  const { id, orderModel } = await _createDataController(
    getFunctionName(),
    { edit: DefaultRoutes.Edit },
    validOrderDataset.default,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  for (const clearedValue of [null, "", []]) {
    const response = await editRequest(
      getFunctionName(),
      { status: clearedValue },
      { id },
    );
    expect(response.status).to.equal(400);
    expect(await response.json()).to.deep.equal({
      code: Validation.MISSING_MANDATORY_FIELDS,
      fields: ["status"],
    });
  }

  const order = await orderModel.get(id);
  expect(order).to.have.property("status", validOrderDataset.default.status);
}

async function expectSkipMandatoryValidationWhenNoMandatory() {
  const { id, orderModel } = await _createDataController(
    getFunctionName(),
    {
      editNoMandatory: DefaultRoutes.WithOptions(DefaultRoutes.Edit, {
        noMandatory: "true",
      }),
    },
    validOrderDataset.default,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await request(
    getFunctionName(),
    "editNoMandatory",
    "PUT",
    { notes: "Updated notes" },
    { id },
  );
  expect(response.status).to.equal(200);

  const order = await orderModel.get(id);
  expect(order).to.be.an("object");
  expect(order).to.have.property("notes", "Updated notes");
}
