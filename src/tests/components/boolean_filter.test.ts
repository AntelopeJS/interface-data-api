import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  Index,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { Query } from "../../components";
import { DataController, RegisterDataController } from "../../index";
import {
  Access,
  AccessMode,
  Filter,
  type FieldFilter,
  GetDataControllerMeta,
  Listable,
} from "../../metadata";
import { createRequestContext } from "../internal/http";
import { getSchemaInstance } from "../utils";

const tableName = "boolean-filter-documents";
const schemaName = "default";

@RegisterTable(tableName, schemaName)
class Document extends Table {
  declare _id: string;

  @Field("string")
  declare title: string;

  @Index()
  @Field("boolean")
  declare archived: boolean;

  @Field("boolean")
  declare pinned: boolean;
}
class DocumentModel extends BasicDataModel(Document, tableName) {}

@RegisterDataController()
class _BooleanFilterAPI extends DataController(
  Document,
  {},
  Controller("/boolean-filter"),
) {
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare title: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Filter()
  declare archived: boolean;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Filter((_context, proxy, _key, value) => proxy.eq(value), false)
  declare pinned: boolean;
}

const reqCtx = createRequestContext();

async function seedDocuments() {
  await RegisterSchema(schemaName);
  await Schema.get(schemaName)?.instance().table(tableName).delete().run();
  const model = new DocumentModel(getSchemaInstance(schemaName));
  await model.insert([
    { title: "kept", archived: false, pinned: true },
    { title: "old", archived: true, pinned: false },
    { title: "older", archived: true, pinned: true },
  ]);
  return model;
}

/** The titles a list filtered by `filters` answers, and the stages of its source. */
async function listTitles(filters: Record<string, FieldFilter>) {
  const model = await seedDocuments();
  const thisObj = new _BooleanFilterAPI();
  const meta = GetDataControllerMeta(thisObj);
  const [query] = Query.List(
    thisObj,
    meta,
    model.table,
    reqCtx,
    undefined,
    filters,
  );
  const rows = await query.run();
  return {
    titles: rows.map((row) => row.title).sort((a, b) => a.localeCompare(b)),
    stages: query.build().map((entry) => entry.stage),
  };
}

describe("A boolean filter value a route writes", () => {
  it("reaches the indexed lookup of an equality filter", async () => {
    const { titles, stages } = await listTitles({ archived: [true, "eq"] });

    expect({ titles, indexed: stages.includes("getAll") }).to.eql({
      titles: ["old", "older"],
      indexed: true,
    });
  });

  it("reaches the default filter of a comparison", async () => {
    const { titles, stages } = await listTitles({ archived: [true, "ne"] });

    expect({ titles, indexed: stages.includes("getAll") }).to.eql({
      titles: ["kept"],
      indexed: false,
    });
  });

  it("reaches a field's own filter", async () => {
    const { titles } = await listTitles({ pinned: [true, "eq"] });

    expect(titles).to.eql(["kept", "older"]);
  });
});
