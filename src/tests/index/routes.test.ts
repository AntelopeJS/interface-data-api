import path from "node:path";
import { expect } from "chai";
import { Controller, type RequestContext } from "@antelopejs/interface-api";
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
} from "@antelopejs/interface-data-api/metadata";
import {
  type Parameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
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
  deleteRequest,
  editRequest,
  getFunctionName,
  getRequest,
  getSchemaInstance,
  listRequest,
  newRequest,
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

const validUserDataset = {
  default: {
    name: "Bob",
    email: "bob@email.com",
    age: 30,
    password: "very-secure-qwerty123",
  },
  alternative: {
    name: "Alice",
    email: "alice@email.com",
    age: 25,
    password: "very-secure-qwerty123",
  },
} satisfies Record<string, Partial<User>>;

describe("Routes", () => {
  beforeEach(async () => {
    try {
      await Schema.get(schemaName)?.instance().table(userTableName).delete();
    } catch {}
  });

  it("accessing default routes", async () => expectRequestingDefaultRoutes());
  it("accessing undefined route", async () =>
    await expectRequestingUndefinedRoute());
  it("using route get", async () => await expectUsingRouteGet());
  it("using route list", async () => await expectUsingRouteList());
  it("using route new", async () => await expectUsingRouteNew());
  it("using route edit", async () => await expectUsingRouteEdit());
  it("writes a body a wrapping route parsed and amended", async () =>
    await expectWritesParsedBodyAsHanded());
  it("using route delete", async () => await expectUsingRouteDelete());
});

async function _createDataController(
  testName: string,
  user: Partial<User>,
  routes?: any,
) {
  @RegisterDataController()
  class _AccessTestAPI extends DataController(
    User,
    routes ?? DefaultRoutes.All,
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(UserModel)
    declare userModel: UserModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare password: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare name: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare age: number;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare email: string;
  }
  await RegisterSchema(schemaName);
  const userModel = new UserModel(getSchemaInstance(schemaName));
  const insertResult = await userModel.insert(user);
  return { id: insertResult[0], userModel };
}

async function expectRequestingDefaultRoutes() {
  await _createDataController(getFunctionName(), validUserDataset.default);

  const [
    get_response,
    list_response,
    new_response,
    edit_response,
    delete_response,
  ] = await Promise.all([
    getRequest(getFunctionName(), {}),
    listRequest(getFunctionName(), {}),
    newRequest(getFunctionName(), {}),
    editRequest(getFunctionName(), {}),
    deleteRequest(getFunctionName(), {}),
  ]);

  expect(get_response.status).to.not.equal(404);
  expect(list_response.status).to.not.equal(404);
  expect(new_response.status).to.not.equal(404);
  expect(edit_response.status).to.not.equal(404);
  expect(delete_response.status).to.not.equal(404);
}

async function expectRequestingUndefinedRoute() {
  await _createDataController(getFunctionName(), validUserDataset.default, {
    get: DefaultRoutes.Get,
    new: DefaultRoutes.New,
    delete: DefaultRoutes.Delete,
  });

  const [
    get_response,
    list_response,
    new_response,
    edit_response,
    delete_response,
  ] = await Promise.all([
    getRequest(getFunctionName(), {}),
    listRequest(getFunctionName(), {}),
    newRequest(getFunctionName(), {}),
    editRequest(getFunctionName(), {}),
    deleteRequest(getFunctionName(), {}),
  ]);

  expect(list_response.status).to.equal(404);
  expect(edit_response.status).to.equal(404);

  expect(get_response.status).to.not.equal(404);
  expect(new_response.status).to.not.equal(404);
  expect(delete_response.status).to.not.equal(404);
}

async function validateUserUsingResponse(
  response: Response,
  id: string,
  validDataset: Partial<User>,
) {
  const data = await readJson<{ results: User[] }>(response);
  expect(response.status).to.equal(200);

  let found: User | undefined;
  if (data.results && Array.isArray(data.results)) {
    for (const user of data.results) {
      if (user._id === id) {
        found = user;
        break;
      }
    }
  }
  await validateUser(found, validDataset);
}

async function validateUserUsingModel(
  userModel: UserModel,
  id: string,
  validDataset: Partial<User>,
) {
  const user = await userModel.get(id);
  await validateUser(user, validDataset, id);
}

async function validateUser(
  user: User | undefined,
  validDataset: Partial<User>,
  id?: string,
) {
  const foundDataset =
    user instanceof UserModel ? await user.get(id ?? "") : user;
  expect(foundDataset).to.be.an("object");
  expect(foundDataset).to.have.property("name", validDataset.name);
  expect(foundDataset).to.have.property("email", validDataset.email);
  expect(foundDataset).to.have.property("age", validDataset.age);
  expect(foundDataset).to.have.property("password", validDataset.password);
}

async function expectUsingRouteGet() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    validUserDataset.default,
    {
      get: DefaultRoutes.Get,
    },
  );

  const response = await getRequest(getFunctionName(), { id });
  expect(response.status).to.equal(200);
  await validateUserUsingModel(userModel, id, validUserDataset.default);
}

async function expectUsingRouteList() {
  const { id } = await _createDataController(
    getFunctionName(),
    validUserDataset.default,
    {
      list: DefaultRoutes.List,
    },
  );

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  await validateUserUsingResponse(response, id, validUserDataset.default);
}

async function expectUsingRouteNew() {
  const { userModel } = await _createDataController(
    getFunctionName(),
    validUserDataset.default,
    {
      new: DefaultRoutes.New,
    },
  );

  const response = await newRequest(
    getFunctionName(),
    validUserDataset.default,
  );
  const created = await readJson<User>(response);
  expect(created._id).to.be.a("string");
  expect(created.name).to.equal(validUserDataset.default.name);
  expect(created.email).to.equal(validUserDataset.default.email);
  await validateUserUsingModel(
    userModel,
    created._id,
    validUserDataset.default,
  );
}

async function expectUsingRouteEdit() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    validUserDataset.default,
    {
      edit: DefaultRoutes.Edit,
    },
  );

  const response = await editRequest(
    getFunctionName(),
    validUserDataset.alternative,
    { id },
  );
  const stored = await readJson<User>(response);
  expect(stored._id).to.equal(id);
  expect(stored.name).to.equal(validUserDataset.alternative.name);
  expect(stored.email).to.equal(validUserDataset.alternative.email);
  await validateUserUsingModel(userModel, id, validUserDataset.alternative);
}

async function expectWritesParsedBodyAsHanded() {
  const stampedName = "Stamped by the wrapper";
  const amendBody = (body: Validation.WrittenBody) => {
    const parsed = Validation.ParseBody(body);
    parsed.name = stampedName;
    return parsed;
  };
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    validUserDataset.default,
    {
      new: {
        ...DefaultRoutes.New,
        func: function (
          this: ThisParameterType<typeof DefaultRoutes.New.func>,
          ctx: RequestContext,
          params: Parameters.NewParameters,
          body: Buffer,
        ) {
          return DefaultRoutes.New.func.call(
            this,
            ctx,
            params,
            amendBody(body),
          );
        },
      },
      edit: {
        ...DefaultRoutes.Edit,
        func: function (
          this: ThisParameterType<typeof DefaultRoutes.Edit.func>,
          ctx: RequestContext,
          params: Parameters.EditParameters,
          body: Buffer,
        ) {
          return DefaultRoutes.Edit.func.call(
            this,
            ctx,
            params,
            amendBody(body),
          );
        },
      },
    },
  );

  const created = await readJson<User>(
    await newRequest(getFunctionName(), validUserDataset.alternative),
  );
  expect(created.name).to.equal(stampedName);
  await validateUserUsingModel(userModel, created._id, {
    ...validUserDataset.alternative,
    name: stampedName,
  });

  const edited = await readJson<User>(
    await editRequest(getFunctionName(), { age: 51 }, { id }),
  );
  expect(edited.name).to.equal(stampedName);
  expect(edited.age).to.equal(51);
}

async function expectUsingRouteDelete() {
  const { id, userModel } = await _createDataController(
    getFunctionName(),
    validUserDataset.default,
    {
      delete: DefaultRoutes.Delete,
    },
  );

  await deleteRequest(getFunctionName(), { id });
  expect(await userModel.get(id)).to.equal(undefined);
}
