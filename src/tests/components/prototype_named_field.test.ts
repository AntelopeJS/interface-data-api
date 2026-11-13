import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import { Query, Validation } from "../../components";
import {
  Access,
  AccessMode,
  DataAPIMeta,
  Mandatory,
  ModelReference,
  Validator,
} from "../../metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { createdRowSchema, readJson } from "../internal/http";
import { newRequest } from "../utils";
import { isString } from "../../internal/guards";

const tableName = "prototype-named-field-rows";
const schemaName = "default";

@RegisterTable(tableName, schemaName)
class Row extends Table {
  declare _id: string;

  @Field("string")
  declare title: string;
}
Field("string")(Row.prototype, "toString");
class RowModel extends BasicDataModel(Row, tableName) {}

async function createController(
  testName: string,
  toStringDecorators: PropertyDecorator[],
) {
  @RegisterDataController()
  class _PrototypeNamedFieldAPI extends DataController(
    Row,
    { new: DefaultRoutes.New },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(RowModel)
    declare rowModel: RowModel;

    @Access(AccessMode.ReadWrite)
    declare title: string;
  }
  Access(AccessMode.ReadWrite)(_PrototypeNamedFieldAPI.prototype, "toString");
  for (const decorate of toStringDecorators) {
    decorate(_PrototypeNamedFieldAPI.prototype, "toString");
  }

  await RegisterSchema(schemaName);
  await Schema.get(schemaName)?.instance().table(tableName).delete().run();
}

describe("New route - a field named like an Object.prototype member", () => {
  it("reports the field missing when it is mandatory and the body omits it", async () => {
    await createController("tostring-mandatory", [Mandatory("new")]);

    const response = await newRequest("tostring-mandatory", { title: "a" });

    expect(response.status, await response.clone().text()).to.equal(400);
    expect(await response.json()).to.deep.equal({
      code: Validation.MISSING_MANDATORY_FIELDS,
      fields: ["toString"],
    });
  });

  it("skips the field's validator when the body omits it", async () => {
    await createController("tostring-validated", [Validator(isString)]);

    const response = await newRequest("tostring-validated", { title: "a" });

    expect(response.status, await response.clone().text()).to.equal(200);
    expect((await readJson(createdRowSchema, response))._id).to.be.a("string");
  });
});

describe("Query.WriteProperties - a target default named like an Object.prototype member", () => {
  it("writes only declared fields", async () => {
    class Defaults {
      valueOf = "default";
      other = "x";
      title = "t";
    }
    const meta = new DataAPIMeta(Defaults);
    meta.tableClass = class TableRow {};
    meta.setMode("title", AccessMode.ReadWrite);

    const dbData = await Query.WriteProperties({}, meta, {});

    expect(Object.keys(dbData)).to.eql(["title"]);
  });
});
