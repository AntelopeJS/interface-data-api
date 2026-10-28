import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import type { SchemaInstance } from "@antelopejs/interface-database";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  BasicDataModel,
  Field,
  Index,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import {
  editRequest,
  getFunctionName,
  getRequest,
  getSchemaInstance,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const userTableName = `users-${currentTestName}`;
const schemaName = "default";

@RegisterTable(userTableName, schemaName)
class User extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare email: string;

  @Field("string")
  declare password: string;

  @Field("string")
  declare name: string;

  @Field("number")
  declare age: number;
}
class UserModel extends BasicDataModel(User, userTableName) {}
let database: SchemaInstance<any>;

const defaultUserDataset: Partial<User> = {
  name: "Jean Test",
  email: "jean.test@email.com",
  age: 30,
  password: "very-secure-qwerty123",
};

describe("Field Access Control", () => {
  it("read in a read write field", async () =>
    await expectReadInReadWriteField());
  it("write in a read write field", async () =>
    await expectWriteInReadWriteField());
  it("read in a write only field", async () =>
    await expectReadInWriteOnlyField());
  it("write in a read only field", async () =>
    await expectWriteInReadOnlyField());
  it("read in a read only field", async () =>
    await expectReadInReadOnlyField());
  it("write in a write only field", async () =>
    await expectWriteInWriteOnlyField());

  after(async () => {});
});

async function _createDataController(testName: string, user: Partial<User>) {
  @RegisterDataController()
  class _AccessTestAPI extends DataController(
    User,
    DefaultRoutes.All,
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(UserModel)
    declare userModel: UserModel;

    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Access(AccessMode.WriteOnly)
    declare password: string;

    @Access(AccessMode.ReadWrite)
    declare name: string;

    @Access(AccessMode.ReadOnly)
    declare age: number;

    @Access(AccessMode.ReadWrite)
    declare email: string;
  }
  await RegisterSchema(schemaName);
  database = getSchemaInstance(schemaName);
  const userModel = new UserModel(database);
  const insertResult = await userModel.insert(user);
  return { id: insertResult[0], userModel };
}

async function expectReadInReadWriteField() {
  const { id } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const response = await getRequest(getFunctionName(), { id });
  expect(response.status).to.equal(200);
  const data = (await response.json()) as User;
  expect(data.name).to.equal(defaultUserDataset.name);
  expect(data.age).to.equal(defaultUserDataset.age);
  expect(data.email).to.equal(defaultUserDataset.email);
  expect(data.password).to.equal(undefined);
}

async function expectWriteInReadWriteField() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const replacementEmail = "bob.test@email.com";
  const response = await editRequest(
    getFunctionName(),
    { email: replacementEmail },
    { id },
  );
  expect(response.status).to.equal(200);
  const user = await userModel.get(id);
  expect(user?.email).to.equal(replacementEmail);
}

async function expectReadInWriteOnlyField() {
  const { id } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const response = await getRequest(getFunctionName(), { id });
  expect(response.status).to.equal(200);
  const data = (await response.json()) as User;
  expect(data.password).to.equal(undefined);
}

async function expectWriteInReadOnlyField() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const response = await editRequest(
    getFunctionName(),
    { age: (defaultUserDataset.age ?? 0) + 5 },
    { id },
  );
  expect(response.status).to.equal(200);
  const user = await userModel.get(id);
  expect(user?.age).to.equal(defaultUserDataset.age);
}

async function expectReadInReadOnlyField() {
  const { id } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const response = await getRequest(getFunctionName(), { id });
  expect(response.status).to.equal(200);
  const data = (await response.json()) as User;
  expect(data.email).to.equal(defaultUserDataset.email);
}

async function expectWriteInWriteOnlyField() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const replacementPassword = "new-password";
  const response = await editRequest(
    getFunctionName(),
    { password: replacementPassword },
    { id },
  );
  expect(response.status).to.equal(200);
  const user = await userModel.get(id);
  expect(user?.password).to.equal(replacementPassword);
}
