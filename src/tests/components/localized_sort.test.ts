import path from "node:path";
import { expect } from "chai";
import { Controller, Parameter } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  ModifierKey,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
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

import { readJson } from "../internal/http";
import { getFunctionName, listRequest, newRequest } from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const fruitTableName = `fruits-${currentTestName}`;
const schemaName = "default";
const allLocales = "*";

@RegisterTable(fruitTableName, schemaName)
class Fruit extends Table.with(LocalizationModifier) {
  declare _id: string;

  @Field("string")
  declare code: string;

  @Localized({ fallbackLocale: "en" })
  declare name: string;
}
class FruitModel extends BasicDataModel(Fruit, fruitTableName) {}

interface FruitListed {
  code: string;
  name: string;
}

const fruits = [
  { code: "apple", name: { en: "Apple", fr: "Pomme" } },
  { code: "banana", name: { en: "Banana", fr: "Banane" } },
  { code: "cherry", name: { en: "Cherry" } },
  { code: "date", name: { en: "Date", fr: "" } },
];

describe("Localized sort", () => {
  it("sorts a localized field in the request's locale", async () =>
    await expectSortsInRequestLocale());
  it("sorts a missing or empty locale on the fallback value", async () =>
    await expectSortsMissingLocaleOnFallback());
});

async function _createFruits(testName: string) {
  @RegisterDataController()
  class _LocalizedSortTestAPI extends DataController(
    Fruit,
    { list: DefaultRoutes.List, new: DefaultRoutes.New },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(FruitModel)
    declare fruitModel: FruitModel;

    @Parameter("locale", "query")
    @ModifierKey(LocalizationModifier)
    declare locale: string;

    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare code: string;

    @Listable()
    @Sortable()
    @Access(AccessMode.ReadWrite)
    declare name: string;
  }
  await RegisterSchema(schemaName);
  await Schema.get(schemaName)?.instance().table(fruitTableName).delete();
  for (const fruit of fruits) {
    const response = await newRequest(testName, fruit, { locale: allLocales });
    expect(response.status).to.equal(200);
  }
}

async function _sortedCodes(
  testName: string,
  locale: string,
  sortDirection: string,
): Promise<string[]> {
  const response = await listRequest(testName, {
    locale,
    sortKey: "name",
    sortDirection,
  });
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: FruitListed[] }>(response);
  return data.results.map((fruit) => fruit.code);
}

async function expectSortsInRequestLocale() {
  const testName = getFunctionName();
  await _createFruits(testName);

  expect(await _sortedCodes(testName, "en", "asc")).to.deep.equal([
    "apple",
    "banana",
    "cherry",
    "date",
  ]);
  expect(await _sortedCodes(testName, "fr", "asc")).to.deep.equal([
    "banana",
    "cherry",
    "date",
    "apple",
  ]);
}

async function expectSortsMissingLocaleOnFallback() {
  const testName = getFunctionName();
  await _createFruits(testName);

  expect(await _sortedCodes(testName, "fr", "desc")).to.deep.equal([
    "apple",
    "date",
    "cherry",
    "banana",
  ]);
  expect(await _sortedCodes(testName, "de", "asc")).to.deep.equal([
    "apple",
    "banana",
    "cherry",
    "date",
  ]);
}
