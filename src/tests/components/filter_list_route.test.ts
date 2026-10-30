import path from "node:path";
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

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const pageTableName = `pages-${currentTestName}`;
const schemaName = "default";

@RegisterTable(pageTableName, schemaName)
class Page extends Table {
  declare _id: string;

  @Field("string")
  declare title: string;

  @Field("string")
  declare url: string;
}
class PageModel extends BasicDataModel(Page, pageTableName) {}

interface ListResponse {
  results: { title: string; url: string }[];
}

async function createController(testName: string) {
  @RegisterDataController()
  class _FilterListAPI extends DataController(
    Page,
    { list: DefaultRoutes.List },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(PageModel)
    declare pageModel: PageModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    @Filter(undefined, false)
    declare title: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    @Filter(undefined, false)
    declare url: string;
  }

  await RegisterSchema(schemaName);
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(pageTableName).delete();
  }
  await new PageModel(getSchemaInstance(schemaName)).insert([
    { title: "alpha", url: "http://example.com" },
    { title: "beta", url: "http://example.org" },
  ]);
}

describe("List route - filter comparisons", () => {
  it("answers 400 for an unknown comparison", async () => {
    await createController("unknown-comparison");

    const response = await listRequest("unknown-comparison", {
      filter_title: "like:alp",
    });

    expect(response.status, await response.clone().text()).to.equal(400);
  });

  it("answers 400 for an unnamed value that contains a colon", async () => {
    await createController("colon-value");

    const response = await listRequest("colon-value", {
      filter_url: "http://example.com",
    });

    expect(response.status, await response.clone().text()).to.equal(400);
  });

  it("filters a value that contains a colon after an explicit eq", async () => {
    await createController("explicit-eq");

    const response = await listRequest("explicit-eq", {
      filter_url: "eq:http://example.com",
    });

    expect(response.status, await response.clone().text()).to.equal(200);
    const data = await readJson<ListResponse>(response);
    expect(data.results.map(({ title }) => title)).to.eql(["alpha"]);
  });

  it("filters with a known comparison", async () => {
    await createController("known-comparison");

    const response = await listRequest("known-comparison", {
      filter_title: "ne:alpha",
    });

    expect(response.status, await response.clone().text()).to.equal(200);
    const data = await readJson<ListResponse>(response);
    expect(data.results.map(({ title }) => title)).to.eql(["beta"]);
  });
});
