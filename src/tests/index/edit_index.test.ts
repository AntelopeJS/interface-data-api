import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Access, AccessMode, ModelReference } from "../../metadata";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import {
  BasicDataModel,
  Field,
  Index,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { editRequest, getSchemaInstance } from "../utils";

const TABLE = "edit-index-articles";
const SCHEMA = "default";
const LOCATION = "edit-index";

@RegisterTable(TABLE, SCHEMA)
class Article extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare slug: string;

  @Field("string")
  declare title: string;
}
class ArticleModel extends BasicDataModel(Article, TABLE) {}

@RegisterDataController()
class _ArticleAPI extends DataController(
  Article,
  { edit: DefaultRoutes.WithOptions(DefaultRoutes.Edit, { index: "slug" }) },
  Controller(`/${LOCATION}`),
) {
  @ModelReference()
  @Model(ArticleModel)
  declare model: ArticleModel;

  @Access(AccessMode.ReadWrite)
  declare slug: string;

  @Access(AccessMode.ReadWrite)
  declare title: string;
}

function articles() {
  return getSchemaInstance(SCHEMA).table(TABLE);
}

describe("Edit with the index option", () => {
  before(async () => {
    await RegisterSchema(SCHEMA);
    await articles()
      .insert([
        { _id: "a1", slug: "hello", title: "Old" },
        { _id: "hello", slug: "decoy", title: "Decoy" },
        { _id: "a2", slug: "rename-me", title: "Before" },
      ])
      .run();
  });

  it("updates the row the index finds, not the row whose primary key is the id", async () => {
    const response = await editRequest(
      LOCATION,
      { title: "New" },
      { id: "hello" },
    );
    expect(response.status).to.equal(200);
    expect(await response.json()).to.deep.include({ title: "New" });
    expect(await articles().get("a1").run()).to.deep.include({ title: "New" });
    expect(await articles().get("hello").run()).to.deep.include({
      title: "Decoy",
    });
  });

  it("answers with the edited row when the edit changes the indexed field", async () => {
    const response = await editRequest(
      LOCATION,
      { slug: "renamed", title: "After" },
      { id: "rename-me" },
    );
    expect(response.status).to.equal(200);
    expect(await response.json()).to.deep.include({
      slug: "renamed",
      title: "After",
    });
    expect(await articles().get("a2").run()).to.deep.include({
      slug: "renamed",
      title: "After",
    });
  });
});
