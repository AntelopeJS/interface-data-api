import path from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { Controller, Parameter } from "@antelopejs/interface-api";
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
  ModifierKey,
} from "../../metadata";
import {
  BasicDataModel,
  Field,
  LocalizationModifier,
  Localized,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { listResponseSchema, readJson } from "../internal/http";
import {
  getFunctionName,
  getRequest,
  getSchemaInstance,
  listRequest,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const itemTableName = `items-${currentTestName}`;
const orderTableName = `orders-${currentTestName}`;
const schemaName = "default";

@RegisterTable(itemTableName, schemaName)
class Item extends Table.with(LocalizationModifier) {
  declare _id: string;

  @Field("string")
  declare code: string;

  @Localized()
  declare name: string;
}
class ItemModel extends BasicDataModel(Item, itemTableName) {}

@RegisterTable(orderTableName, schemaName)
class Order extends Table {
  declare _id: string;

  @Field("string")
  declare one: string;

  @Field("array")
  declare items: (string | null)[];
}
class OrderModel extends BasicDataModel(Order, orderTableName) {}

const relatedItemSchema = z.looseObject({
  _id: z.string(),
  code: z.string(),
  name: z.string().optional(),
});

const orderSchema = z.looseObject({
  _id: z.string(),
  one: relatedItemSchema,
  items: z.array(relatedItemSchema),
});

describe("Localized fields of a multi reference", () => {
  it("gets each element in the request's locale", async () =>
    await expectGetLocalizesEachElement());
  it("lists each element in the request's locale", async () =>
    await expectListLocalizesEachElement());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _LocalizedMultiAPI extends DataController(
    Order,
    { get: DefaultRoutes.Get, list: DefaultRoutes.List },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(OrderModel)
    declare orderModel: OrderModel;

    @Parameter("locale", "query")
    @ModifierKey(LocalizationModifier)
    declare locale: string | true | undefined;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Foreign(Item)
    @Access(AccessMode.ReadOnly)
    declare one: Item;

    @Listable()
    @Foreign(Item, undefined, true)
    @Access(AccessMode.ReadOnly)
    declare items: Item[];
  }

  await RegisterSchema(schemaName);
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(orderTableName).delete().run();
    await schema.instance().table(itemTableName).delete().run();
  }

  const schemaInstance = getSchemaInstance(schemaName);
  const [widgetId, gadgetId] = Object.values(
    await new ItemModel(schemaInstance).insert([
      ItemModel.fromPlainData({
        code: "widget",
        name: { en: "Widget", fr: "Bidule" },
      }),
      ItemModel.fromPlainData({
        code: "gadget",
        name: { en: "Gadget", fr: "Machin" },
      }),
    ]),
  );
  const [orderId] = Object.values(
    await new OrderModel(schemaInstance).insert([
      { one: widgetId, items: [widgetId, gadgetId] },
    ]),
  );
  return { orderId };
}

function _localizedNames(order: z.infer<typeof orderSchema>) {
  return {
    one: order.one.name,
    items: order.items.map((item) => item.name),
  };
}

async function expectGetLocalizesEachElement() {
  const { orderId } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), {
    id: orderId,
    locale: "fr",
  });
  expect(response.status, await response.clone().text()).to.equal(200);
  const order = await readJson(orderSchema, response);
  expect(_localizedNames(order)).to.deep.equal({
    one: "Bidule",
    items: ["Bidule", "Machin"],
  });
}

async function expectListLocalizesEachElement() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), { locale: "fr" });
  expect(response.status, await response.clone().text()).to.equal(200);
  const data = await readJson(listResponseSchema(orderSchema), response);
  expect(data.results).to.have.lengthOf(1);
  const names = _localizedNames(data.results[0]);
  expect(names.one).to.equal("Bidule");
  expect(names.items).to.have.members(["Bidule", "Machin"]);
}
