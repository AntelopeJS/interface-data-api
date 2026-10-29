import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import { Access, AccessMode, ModelReference, Validator } from "../../metadata";
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
  getSchemaInstance,
  newRequest,
  type CreatedRow,
  validateObject,
} from "../utils";
import { isNumber, isString } from "../../internal/guards";

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
  declare sku: string;

  @Field("string")
  declare name: string;

  @Field("number")
  declare price: number;

  @Field("string")
  declare email: string;

  @Field("date")
  declare birthDate: Date;

  @Field("string")
  declare status: string;

  @Field(["string"])
  declare tags: string[];
}
class ProductModel extends BasicDataModel(Product, productTableName) {}

const validProductData = {
  default: {
    name: "Valid Product",
    price: 29.99,
    email: "test@example.com",
    birthDate: new Date("1990-01-01"),
    status: "active",
    tags: ["electronics", "gadgets"],
  },
  alternative: {
    name: "Valid Product",
    price: 29.99,
    email: "test@example.com",
    birthDate: new Date("1990-01-01"),
    status: "active",
    tags: ["electronics", "gadgets"],
  },
} satisfies Record<string, Partial<Product>>;

describe("Field Validator", () => {
  it("validate correct parameters on new", async () =>
    await expectCorrectParametersOnNew());
  it("validate incorrect date parameter on new", async () =>
    await expectIncorrectDateParameterOnNew());
  it("validate incorrect regex parameter on new", async () =>
    await expectIncorrectEmailParameterOnNew());
  it("validate incorrect string parameter on new", async () =>
    await expectIncorrectStringParameterOnNew());
  it("validate incorrect number parameter on new", async () =>
    await expectIncorrectNumberParameterOnNew());
  it("validate correct parameters on edit", async () =>
    await expectCorrectParametersOnEdit());
  it("validate incorrect date parameter on edit", async () =>
    await expectIncorrectDateParameterOnEdit());
  it("validate incorrect regex parameter on edit", async () =>
    await expectIncorrectEmailParameterOnEdit());
  it("validate incorrect string parameter on edit", async () =>
    await expectIncorrectStringParameterOnEdit());
  it("validate incorrect number parameter on edit", async () =>
    await expectIncorrectNumberParameterOnEdit());
});

async function _createDataController(
  testName: string,
  route: any,
  product?: Partial<Product>,
) {
  @RegisterDataController()
  class _ValidatorTestAPI extends DataController(
    Product,
    route,
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(ProductModel)
    declare productModel: ProductModel;

    declare _id: string;

    @Access(AccessMode.ReadWrite)
    @Validator((value) => isString(value) && value.length >= 3)
    declare name: string;

    @Access(AccessMode.ReadWrite)
    @Validator((value) => isNumber(value) && value >= 0)
    declare price: number;

    @Access(AccessMode.ReadWrite)
    @Validator((value) => {
      if (!isString(value)) return false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    })
    declare email: string;

    @Access(AccessMode.ReadWrite)
    @Validator((value) => isString(value) && !Number.isNaN(Date.parse(value)))
    declare birthDate: Date;

    @Access(AccessMode.ReadWrite)
    @Validator((value) =>
      ["active", "inactive", "pending"].some((status) => status === value),
    )
    declare status: string;

    @Access(AccessMode.ReadWrite)
    @Validator(
      (value) =>
        Array.isArray(value) &&
        value.every((tag) => isString(tag) && tag.length > 0),
    )
    declare tags: string[];
  }
  await RegisterSchema(schemaName);
  const productModel = new ProductModel(getSchemaInstance(schemaName));

  if (product) {
    const insertResult = await productModel.insert(product);
    return { id: insertResult[0], productModel };
  }
  return { productModel };
}

interface IncorrectScenario {
  route: Parameters<typeof _createDataController>[1];
  testDataset: Partial<Product>;
  createDataset?: Partial<Product>;
}

function createIncorrectValidator(
  testName: string,
  fieldName: string,
  invalidValue: any,
  requestFunction: (
    testName: string,
    data: any,
    id?: Record<string, string>,
  ) => Promise<Response>,
  scenario: IncorrectScenario,
) {
  return async () => {
    const { id } = await _createDataController(
      testName,
      scenario.route,
      scenario.createDataset,
    );

    const invalidData = { ...scenario.testDataset, [fieldName]: invalidValue };
    const response = await requestFunction(
      testName,
      invalidData,
      id ? { id } : {},
    );
    expect(response.status).to.equal(400);

    const error = await response.text();
    expect(error).to.include(fieldName);
  };
}

function createCorrectValidator(
  testName: string,
  requestFunction: (
    testName: string,
    data: any,
    id?: Record<string, string>,
  ) => Promise<Response>,
  route: any,
  testDataset: Partial<Product>,
  createDataset?: Partial<Product>,
) {
  return async () => {
    const { id, productModel } = await _createDataController(
      testName,
      route,
      createDataset,
    );

    const response = await requestFunction(
      testName,
      testDataset,
      id ? { id } : {},
    );
    expect(response.status).to.equal(200);

    let product_fetched: Product | undefined;
    if (id) {
      product_fetched = await productModel.get(id);
    } else {
      const created = await readJson<CreatedRow>(response);
      expect(created._id).to.be.a("string");
      product_fetched = await productModel.get(created._id);
    }
    expect(product_fetched).to.not.equal(undefined);
    if (product_fetched) {
      await validateObject(product_fetched, testDataset, [
        "email",
        "name",
        "price",
        "status",
        "tags",
      ]);
    }
  };
}

function createIncorrectValidatorEdit(
  testName: string,
  fieldName: string,
  invalidValue: any,
  requestFunction: (testName: string, data: any) => Promise<Response>,
) {
  return createIncorrectValidator(
    testName,
    fieldName,
    invalidValue,
    requestFunction,
    {
      route: { edit: DefaultRoutes.Edit },
      testDataset: validProductData.alternative,
      createDataset: validProductData.default,
    },
  );
}

function createIncorrectValidatorNew(
  testName: string,
  fieldName: string,
  invalidValue: any,
  requestFunction: (testName: string, data: any) => Promise<Response>,
) {
  return createIncorrectValidator(
    testName,
    fieldName,
    invalidValue,
    requestFunction,
    {
      route: { new: DefaultRoutes.New },
      testDataset: validProductData.default,
    },
  );
}

const expectCorrectParametersOnNew = createCorrectValidator(
  "CorrectParametersOnNew",
  newRequest,
  { new: DefaultRoutes.New },
  validProductData.default,
);
const expectIncorrectDateParameterOnNew = createIncorrectValidatorNew(
  "DateParameterOnNew",
  "birthDate",
  "invalid",
  newRequest,
);
const expectIncorrectEmailParameterOnNew = createIncorrectValidatorNew(
  "EmailParameterOnNew",
  "email",
  "invalid",
  newRequest,
);
const expectIncorrectStringParameterOnNew = createIncorrectValidatorNew(
  "StringParameterOnNew",
  "name",
  "ab",
  newRequest,
);
const expectIncorrectNumberParameterOnNew = createIncorrectValidatorNew(
  "NumberParameterOnNew",
  "price",
  -10,
  newRequest,
);

const expectCorrectParametersOnEdit = createCorrectValidator(
  "CorrectParametersOnEdit",
  editRequest,
  { edit: DefaultRoutes.Edit },
  validProductData.alternative,
  validProductData.default,
);
const expectIncorrectDateParameterOnEdit = createIncorrectValidatorEdit(
  "DateParameterOnEdit",
  "birthDate",
  "invalid-date",
  editRequest,
);
const expectIncorrectEmailParameterOnEdit = createIncorrectValidatorEdit(
  "EmailParameterOnEdit",
  "email",
  "invalid-email@a",
  editRequest,
);
const expectIncorrectStringParameterOnEdit = createIncorrectValidatorEdit(
  "StringParameterOnEdit",
  "name",
  "ab",
  editRequest,
);
const expectIncorrectNumberParameterOnEdit = createIncorrectValidatorEdit(
  "NumberParameterOnEdit",
  "price",
  -10,
  editRequest,
);
