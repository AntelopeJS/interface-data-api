import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
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
  Sortable,
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

import { type ListResponse, readJson } from "../internal/http";
import {
  getFunctionName,
  getSchemaInstance,
  listRequest,
  request,
  validateObjectList,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const productTableName = `products-${currentTestName}`;
const schemaName = "default";

@RegisterTable(productTableName, schemaName)
class Product extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare reference: string;

  @Field("string")
  declare name: string;

  @Field("string")
  declare description: string;

  @Field("number")
  declare price: number;

  @Field("date")
  declare addedAt: Date;

  @Field("string")
  declare internalNotes: string;

  @Field("string")
  declare metadata: string;
}
class ProductModel extends BasicDataModel(Product, productTableName) {}

interface ProductListed {
  _id: string;
  name: string;
  price: number;
  addedAt: string;
}

const defaultProductDataset: Partial<Product>[] = [
  {
    name: "OneSung X",
    description:
      "Smartphone with a 6.7-inch display based on an Tensilica Xtensa LX6 chip.",
    price: 929.99,
    reference: "OS-X",
    addedAt: new Date("2025-06-15"),
    internalNotes: "This should not be visible in lists",
    metadata: "idk what to put here",
  },
  {
    name: "Kine Earth Max",
    description:
      "AI powered shoes, adjusting the sole's flexibility based on the ground",
    price: 129.99,
    reference: "KE-MAX",
    addedAt: new Date("1900-01-01"),
    internalNotes: "This should not be visible in lists either",
    metadata: "seriously, no idea what to put here. At least there's a string",
  },
  {
    name: "Pocket Potato",
    description: "A potato that fits in your pocket",
    price: 1.99,
    reference: "PP-1",
    addedAt: new Date("3000-12-31"),
    internalNotes: "Again, not visible in lists",
    metadata: "still does not matter",
  },
];

describe("Field Listable", () => {
  it("default listing", async () => await expectDefaultList());
  it("list only detailed fields", async () => await expectDetailedList());
  it("list nonexistant pluck mode", async () => await expectUnknownPluckMode());
  it("list only 2 rows per page", async () => await expectTwoRowPage());
  it("list from 2nd page", async () => await expectFromPageTwo());
  it("list only 2 first pages", async () => await expectTwoFirstPages());
  it("list only 2nd page", async () => await expectPageTwoOnly());
  it("sorting by string (name), ascending", async () =>
    await expectNameAscending());
  it("sorting by string (name), descending", async () =>
    await expectNameDescending());
  it("sorting by number (price), ascending", async () =>
    await expectPriceAscending());
  it("sorting by number (price), descending", async () =>
    await expectPriceDescending());
  it("sorting by date (addedAt), ascending", async () =>
    await expectAddedAtAscending());
  it("sorting by date (addedAt), descending", async () =>
    await expectAddedAtDescending());
});

async function _createDataController(
  testName: string,
  route: any,
  product: Partial<Product>[],
) {
  @RegisterDataController()
  class _ListableTestAPI extends DataController(
    Product,
    route,
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(ProductModel)
    declare productModel: ProductModel;

    @Listable()
    @Listable(true, "detailed")
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    @Sortable({ noIndex: true })
    declare name: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    @Sortable({ noIndex: true })
    declare price: number;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare reference: string;

    @Listable()
    declare internalNotes: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    @Sortable({ noIndex: true })
    declare addedAt: Date;

    @Listable(true, "detailed")
    @Access(AccessMode.ReadOnly)
    declare metadata: string;

    @Listable(true, "detailed")
    @Listable(true, "nonexistent")
    @Access(AccessMode.ReadOnly)
    declare description: string;
  }
  await RegisterSchema(schemaName);
  await _dropProductTable();
  const productModel = new ProductModel(getSchemaInstance(schemaName));
  const insertResults = await productModel.insert(product);
  return { ids: insertResults, productModel };
}

async function _dropProductTable() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(productTableName).delete();
  }
}

async function _getDatabaseProducts(ids: string[], productModel: ProductModel) {
  const database_products: Product[] = [];
  for (const id of ids) {
    const product = await productModel.get(id);
    expect(product).to.not.equal(undefined);
    if (product) {
      database_products.push(product);
    }
  }
  return database_products;
}

async function expectDefaultList() {
  const { ids, productModel } = await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: Product[] }>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);
  const listed_products = data.results;
  const database_products = await _getDatabaseProducts(
    Object.values(ids),
    productModel,
  );
  await validateObjectList(listed_products, database_products, [
    "_id",
    "name",
    "price",
    "reference",
  ]);
  for (const product of listed_products) {
    expect(product.internalNotes).to.equal(undefined);
    expect(product.description).to.equal(undefined);
    expect(product.metadata).to.equal(undefined);
  }
}

async function expectDetailedList() {
  const { ids, productModel } = await _createDataController(
    getFunctionName(),
    {
      detailed: DefaultRoutes.WithOptions(DefaultRoutes.List, {
        pluckMode: "detailed",
      }),
    },
    defaultProductDataset,
  );

  const response = await request(
    getFunctionName(),
    "detailed",
    "GET",
    undefined,
    {},
  );
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: Product[] }>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);
  const listed_products = data.results;
  const database_products = await _getDatabaseProducts(
    Object.values(ids),
    productModel,
  );
  await validateObjectList(listed_products, database_products, [
    "_id",
    "metadata",
    "description",
  ]);
  for (const product of listed_products) {
    expect(product.internalNotes).to.equal(undefined);
    expect(product.name).to.equal(undefined);
    expect(product.price).to.equal(undefined);
    expect(product.reference).to.equal(undefined);
  }
}

async function expectUnknownPluckMode() {
  await _createDataController(
    getFunctionName(),
    {
      detailed: DefaultRoutes.WithOptions(DefaultRoutes.List, {
        pluckMode: "detailed",
      }),
    },
    defaultProductDataset,
  );

  const response = await request(
    getFunctionName(),
    "nonexistent",
    "GET",
    undefined,
    {},
  );
  expect(response.status).to.equal(404);
}

async function expectTwoRowPage() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), { limit: "2" });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(2);
  expect(data.total).to.equal(defaultProductDataset.length);
  expect(data.limit).to.equal(2);
  expect(data.offset).to.equal(0);
  expect(data.results[0]._id).to.not.equal(undefined);
  expect(data.results[1]._id).to.not.equal(undefined);
}

async function expectFromPageTwo() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), { offset: "2" });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(1);
  expect(data.total).to.equal(defaultProductDataset.length);
  expect(data.offset).to.equal(2);
  expect(data.results[0]._id).to.not.equal(undefined);
}

async function expectTwoFirstPages() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), { maxPage: "2" });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);
  expect(data.total).to.equal(defaultProductDataset.length);
  expect(data.results[0]._id).to.not.equal(undefined);
}

async function expectPageTwoOnly() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    offset: "2",
    limit: "1",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(1);
  expect(data.total).to.equal(defaultProductDataset.length);
  expect(data.offset).to.equal(2);
  expect(data.limit).to.equal(1);
  expect(data.results[0]._id).to.not.equal(undefined);
}

function _getSortedField(
  dataset: Partial<Product>[],
  field: keyof Product,
  direction: "asc" | "desc",
) {
  const mappedField = dataset.map((product) => product[field]);

  const filteredField = mappedField.filter(
    (v): v is string | number | Date => v !== undefined && v !== null,
  );

  filteredField.sort((a, b) => {
    if (a instanceof Date && b instanceof Date) {
      return direction === "asc"
        ? a.getTime() - b.getTime()
        : b.getTime() - a.getTime();
    }
    if (typeof a === "number" && typeof b === "number") {
      return direction === "asc" ? a - b : b - a;
    }
    if (typeof a === "string" && typeof b === "string") {
      return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    }
    return 0;
  });

  return filteredField;
}

async function expectNameAscending() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    sortKey: "name",
    sortDirection: "asc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);

  const sortedNames = data.results.map((product: any) => product.name);
  const expectedNames = _getSortedField(defaultProductDataset, "name", "asc");
  expect(sortedNames).to.deep.equal(expectedNames);
}

async function expectNameDescending() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    sortKey: "name",
    sortDirection: "desc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);

  const sortedNames = data.results.map((product: any) => product.name);
  const expectedNames = _getSortedField(defaultProductDataset, "name", "desc");
  expect(sortedNames).to.deep.equal(expectedNames);
}

async function expectPriceAscending() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    sortKey: "price",
    sortDirection: "asc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);

  const sortedPrices = data.results.map((product: any) => product.price);
  const expectedPrices = _getSortedField(defaultProductDataset, "price", "asc");
  expect(sortedPrices).to.deep.equal(expectedPrices);
}

async function expectPriceDescending() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    sortKey: "price",
    sortDirection: "desc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);

  const sortedPrices = data.results.map((product: any) => product.price);
  const expectedPrices = _getSortedField(
    defaultProductDataset,
    "price",
    "desc",
  );
  expect(sortedPrices).to.deep.equal(expectedPrices);
}

async function expectAddedAtAscending() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    sortKey: "addedAt",
    sortDirection: "asc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);
  const sortedDates = data.results.map((product: any) =>
    new Date(product.addedAt).getTime(),
  );
  const expectedDates = _getSortedField(defaultProductDataset, "addedAt", "asc")
    .filter((value): value is Date => value instanceof Date)
    .map((date: Date) => date.getTime());
  expect(sortedDates).to.deep.equal(expectedDates);
}

async function expectAddedAtDescending() {
  await _createDataController(
    getFunctionName(),
    { list: DefaultRoutes.List },
    defaultProductDataset,
  );

  const response = await listRequest(getFunctionName(), {
    sortKey: "addedAt",
    sortDirection: "desc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<ProductListed>>(response);
  expect(data.results).to.have.length(defaultProductDataset.length);

  const sortedDates = data.results.map((product: any) =>
    new Date(product.addedAt).getTime(),
  );
  const expectedDates = _getSortedField(
    defaultProductDataset,
    "addedAt",
    "desc",
  )
    .filter((value): value is Date => value instanceof Date)
    .map((date: Date) => date.getTime());
  expect(sortedDates).to.deep.equal(expectedDates);
}
