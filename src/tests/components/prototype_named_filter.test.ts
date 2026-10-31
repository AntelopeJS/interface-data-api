import { expect } from "chai";
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
  Filter,
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

import { readJson } from "../internal/http";
import { getSchemaInstance, listRequest } from "../utils";

const tableName = "prototype-named-filter-rows";
const schemaName = "default";

@RegisterTable(tableName, schemaName)
class Row extends Table {
  declare _id: string;

  @Field("string")
  declare title: string;
}
Field("string")(Row.prototype, "valueOf");
class RowModel extends BasicDataModel(Row, tableName) {}

interface ListResponse {
  results: { title: string }[];
}

async function createController(testName: string) {
  @RegisterDataController()
  class _PrototypeNamedFilterAPI extends DataController(
    Row,
    { list: DefaultRoutes.List },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(RowModel)
    declare rowModel: RowModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    @Filter(undefined, false)
    declare title: string;
  }
  Listable()(_PrototypeNamedFilterAPI.prototype, "valueOf");
  Access(AccessMode.ReadOnly)(_PrototypeNamedFilterAPI.prototype, "valueOf");
  Filter(undefined, false)(_PrototypeNamedFilterAPI.prototype, "valueOf");

  await RegisterSchema(schemaName);
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(tableName).delete();
  }
  await new RowModel(getSchemaInstance(schemaName)).insert([
    { title: "alpha" },
    { title: "beta" },
  ]);
}

describe("List route - a field named like an Object.prototype member", () => {
  it("lists the rows when no request filter is given", async () => {
    await createController("valueof-plain");

    const response = await listRequest("valueof-plain");

    expect(response.status, await response.clone().text()).to.equal(200);
    const data = await readJson<ListResponse>(response);
    expect(data.results.map(({ title }) => title)).to.have.members([
      "alpha",
      "beta",
    ]);
  });

  it("filters on another field", async () => {
    await createController("valueof-filtered");

    const response = await listRequest("valueof-filtered", {
      filter_title: "eq:alpha",
    });

    expect(response.status, await response.clone().text()).to.equal(200);
    const data = await readJson<ListResponse>(response);
    expect(data.results.map(({ title }) => title)).to.eql(["alpha"]);
  });
});
