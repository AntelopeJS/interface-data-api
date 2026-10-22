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

const validUserDataset: Record<string, Partial<User>> = {
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
};

describe("Routes", () => {
  beforeEach(async () => {
    try {
      await Schema.get(schemaName)?.instance().table(userTableName).delete();
    } catch {
      // Instance may not exist yet on first run
    }
  });

  it("accessing default routes", async () => requestingDefaultRoutes());
  it("accessing undefined route", async () => await requestingUndefinedRoute());
  it("using route get", async () => await usingRouteGet());
  it("using route list", async () => await usingRouteList());
  it("using route new", async () => await usingRouteNew());
  it("using route edit", async () => await usingRouteEdit());
  it("writes a body a wrapping route parsed and amended", async () =>
    await writesParsedBodyAsHanded());
  it("using route delete", async () => await usingRouteDelete());

  after(async () => {});
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

async function requestingDefaultRoutes() {
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

async function requestingUndefinedRoute() {
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
  const data = (await response.json()) as { results: User[] };
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
  user: User | Record<string, unknown> | undefined,
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

async function usingRouteGet() {
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

async function usingRouteList() {
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

async function usingRouteNew() {
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
  // The created row, as the get route answers it: its key and its fields.
  const created = (await response.json()) as Record<string, unknown>;
  expect(created._id).to.be.a("string");
  expect(created.name).to.equal(validUserDataset.default.name);
  expect(created.email).to.equal(validUserDataset.default.email);
  await validateUserUsingModel(
    userModel,
    created._id as string,
    validUserDataset.default,
  );
}

async function usingRouteEdit() {
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
  // The stored row after the edit, as the get route answers it.
  const stored = (await response.json()) as Record<string, unknown>;
  expect(stored._id).to.equal(id);
  expect(stored.name).to.equal(validUserDataset.alternative.name);
  expect(stored.email).to.equal(validUserDataset.alternative.email);
  await validateUserUsingModel(userModel, id, validUserDataset.alternative);
}

async function writesParsedBodyAsHanded() {
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
          this: unknown,
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
          this: unknown,
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

  const created = (await (
    await newRequest(getFunctionName(), validUserDataset.alternative)
  ).json()) as Record<string, unknown>;
  expect(created.name).to.equal(stampedName);
  await validateUserUsingModel(userModel, created._id as string, {
    ...validUserDataset.alternative,
    name: stampedName,
  });

  const edited = (await (
    await editRequest(getFunctionName(), { age: 51 }, { id })
  ).json()) as Record<string, unknown>;
  expect(edited.name).to.equal(stampedName);
  expect(edited.age).to.equal(51);
}

async function usingRouteDelete() {
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
