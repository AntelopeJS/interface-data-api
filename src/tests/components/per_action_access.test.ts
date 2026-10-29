import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import {
  Access,
  AccessMode,
  GetEffectiveMode,
  Listable,
  ModelReference,
} from "../../metadata";
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
  getRequest,
  getSchemaInstance,
  newRequest,
  type CreatedRow,
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
  declare name: string;

  @Field("string")
  declare role: string;

  @Field("number")
  declare age: number;
}
class UserModel extends BasicDataModel(User, userTableName) {}

const defaultUserDataset: Partial<User> = {
  name: "Jean Test",
  email: "jean.test@email.com",
  role: "admin",
  age: 30,
};

describe("Per-Action Access Control", () => {
  it("writable in new but read-only in edit", async () =>
    await expectWritableInNewReadOnlyInEdit());
  it("read-only globally but read-write in new", async () =>
    await expectReadOnlyGloballyReadWriteInNew());
  it("reads a field's effective mode per action", () => {
    const field = {
      mode: AccessMode.ReadWrite,
      modeOverrides: { edit: AccessMode.ReadOnly },
    };
    expect(GetEffectiveMode(field, "edit")).to.equal(AccessMode.ReadOnly);
    expect(GetEffectiveMode(field, "new")).to.equal(AccessMode.ReadWrite);
    expect(GetEffectiveMode(field, "_default")).to.equal(AccessMode.ReadWrite);
    expect(GetEffectiveMode(field)).to.equal(AccessMode.ReadWrite);
  });
});

async function _createDataController(testName: string, user: Partial<User>) {
  @RegisterDataController()
  class _PerActionAccessAPI extends DataController(
    User,
    DefaultRoutes.All,
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(UserModel)
    declare userModel: UserModel;

    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare name: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare email: string;

    @Listable()
    @Access(AccessMode.ReadWrite, { edit: AccessMode.ReadOnly })
    declare role: string;

    @Listable()
    @Access(AccessMode.ReadOnly, { new: AccessMode.ReadWrite })
    declare age: number;
  }
  await RegisterSchema(schemaName);
  const database = getSchemaInstance(schemaName);
  const userModel = new UserModel(database);
  const insertResult = await userModel.insert(user);
  return { id: insertResult[0], userModel };
}

async function expectWritableInNewReadOnlyInEdit() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const getResponse = await getRequest(getFunctionName(), { id });
  expect(getResponse.status).to.equal(200);
  const data = await readJson<User>(getResponse);
  expect(data.role).to.equal("admin");

  await editRequest(getFunctionName(), { role: "user" }, { id });
  const user = await userModel.get(id);
  expect(user?.role).to.equal("admin");
}

async function expectReadOnlyGloballyReadWriteInNew() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    defaultUserDataset,
  );

  const newResponse = await newRequest(getFunctionName(), defaultUserDataset);
  expect(newResponse.status).to.equal(200);
  const created = await readJson<CreatedRow>(newResponse);
  const newUser = await userModel.get(created._id);
  expect(newUser?.age).to.equal(30);

  await editRequest(getFunctionName(), { age: 99 }, { id });
  const editedUser = await userModel.get(id);
  expect(editedUser?.age).to.equal(30);

  const getResponse = await getRequest(getFunctionName(), { id });
  expect(getResponse.status).to.equal(200);
  const getData = await readJson<User>(getResponse);
  expect(getData.age).to.equal(30);
}
