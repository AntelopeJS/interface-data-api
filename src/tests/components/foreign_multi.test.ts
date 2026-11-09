import path from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import {
  Access,
  AccessMode,
  Foreign,
  Listable,
  ModelReference,
} from "../../metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { listResponseSchema, readJson } from "../internal/http";
import { getFunctionName, getSchemaInstance, request } from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const itemTableName = `items-${currentTestName}`;
const orderTableName = `orders-${currentTestName}`;
const schemaName = "default";

@RegisterTable(itemTableName, schemaName)
class Item extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;
}
class ItemModel extends BasicDataModel(Item, itemTableName) {}

@RegisterTable(orderTableName, schemaName)
class Order extends Table {
  declare _id: string;

  @Field("array")
  declare items: (string | null)[];

  @Field("array")
  declare itemsAll: (string | null)[];
}
class OrderModel extends BasicDataModel(Order, orderTableName) {}

const orderSchema = z.looseObject({
  _id: z.string(),
  items: z.array(z.unknown()),
  itemsAll: z.array(z.unknown()),
});

describe("Foreign multi references", () => {
  it("gets null for a missing element", async () =>
    await expectGetAnswersNullForMissing());
  it("gets the raw ids with noForeign", async () =>
    await expectGetAnswersRawIds());
  it("lists the raw ids with noForeign", async () =>
    await expectListAnswersRawIds());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _ForeignMultiAPI extends DataController(
    Order,
    {
      get: DefaultRoutes.Get,
      raw: DefaultRoutes.WithOptions(DefaultRoutes.Get, { noForeign: "true" }),
      rawList: DefaultRoutes.WithOptions(DefaultRoutes.List, {
        noForeign: true,
      }),
    },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(OrderModel)
    declare orderModel: OrderModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Foreign(Item, undefined, true, ["_id", "name"])
    @Access(AccessMode.ReadOnly)
    declare items: Item[];

    @Listable()
    @Foreign(Item, undefined, true)
    @Access(AccessMode.ReadOnly)
    declare itemsAll: Item[];
  }

  await RegisterSchema(schemaName);
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(orderTableName).delete();
    await schema.instance().table(itemTableName).delete();
  }

  const schemaInstance = getSchemaInstance(schemaName);
  const [itemId] = Object.values(
    await new ItemModel(schemaInstance).insert([{ name: "Widget" }]),
  );
  const ids = [itemId, "ghost"];
  const nullFirst = [null, itemId];
  const [orderId, nullFirstId] = Object.values(
    await new OrderModel(schemaInstance).insert([
      { items: ids, itemsAll: ids },
      { items: nullFirst, itemsAll: nullFirst },
    ]),
  );
  return { itemId, orderId, nullFirstId };
}

async function _getOrder(testName: string, route: string, id: string) {
  const response = await request(testName, route, "GET", undefined, { id });
  expect(response.status, await response.clone().text()).to.equal(200);
  return await readJson(orderSchema, response);
}

async function expectGetAnswersNullForMissing() {
  const { itemId, orderId } = await _createDataController(getFunctionName());

  const order = await _getOrder(getFunctionName(), "get", orderId);
  expect(order.items).to.deep.equal([{ _id: itemId, name: "Widget" }, null]);
  expect(order.itemsAll).to.have.length(2);
  expect(order.itemsAll[0]).to.include({ _id: itemId, name: "Widget" });
  expect(order.itemsAll[1]).to.equal(null);
}

async function expectGetAnswersRawIds() {
  const { itemId, orderId, nullFirstId } =
    await _createDataController(getFunctionName());

  const order = await _getOrder(getFunctionName(), "raw", orderId);
  expect(order.items).to.deep.equal([itemId, "ghost"]);
  expect(order.itemsAll).to.deep.equal([itemId, "ghost"]);
  const nullFirst = await _getOrder(getFunctionName(), "raw", nullFirstId);
  expect(nullFirst.items).to.deep.equal([null, itemId]);
  expect(nullFirst.itemsAll).to.deep.equal([null, itemId]);
}

async function expectListAnswersRawIds() {
  const { itemId } = await _createDataController(getFunctionName());

  const response = await request(getFunctionName(), "rawList", "GET");
  expect(response.status, await response.clone().text()).to.equal(200);
  const data = await readJson(listResponseSchema(orderSchema), response);
  expect(data.results.map((o) => o.itemsAll)).to.have.deep.members([
    [itemId, "ghost"],
    [null, itemId],
  ]);
  expect(data.results.map((o) => o.items)).to.have.deep.members([
    [itemId, "ghost"],
    [null, itemId],
  ]);
}
