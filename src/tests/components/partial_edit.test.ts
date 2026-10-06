import path from "node:path";
import { expect } from "chai";
import { Controller, Parameter } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  ModelReference,
  ModifierKey,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  LocalizationModifier,
  Localized,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { URL_BASE } from "../constants";
import {
  editRequest,
  getFunctionName,
  getRequest,
  getSchemaInstance,
  newRequest,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const articleTableName = `articles-${currentTestName}`;
const schemaName = "default";
const defaultSlug = "default-slug";
const allLocales = "*";
const missingRowId = "missing-row-id";

@RegisterTable(articleTableName, schemaName)
class Article extends Table.with(LocalizationModifier) {
  declare _id: string;

  @Field("string")
  declare reference: string;

  @Field("string")
  declare author: string;

  @Field("string")
  declare notes: string | null;

  @Field("string")
  declare slug: string;

  @Localized()
  declare title: string;

  @Localized()
  declare summary: string;
}
class ArticleModel extends BasicDataModel(Article, articleTableName) {}

interface LocalizedArticle {
  title: string;
  summary: string;
}

const storedArticle: Partial<Article> = {
  reference: "ART-001",
  author: "Alice",
  notes: "Draft notes",
  slug: "custom-slug",
};

const localizedArticle = {
  reference: "ART-002",
  title: { en: "Title", fr: "Titre" },
  summary: { en: "Summary", fr: "Résumé" },
};

describe("Partial edit", () => {
  it("leaves the fields absent from the body unchanged", async () =>
    await leavesAbsentFieldsUnchanged());
  it("clears a field sent as null", async () => await clearsNullField());
  it("skips the setters of fields absent from the body", async () =>
    await skipsSettersOfAbsentFields());
  it("runs the setters of fields present in the body", async () =>
    await runsSettersOfPresentFields());
  it("still runs every setter on new", async () =>
    await runsEverySetterOnNew());
  it("keeps the other languages of a written localized field", async () =>
    await keepsOtherLanguagesOfWrittenField());
  it("keeps the localized fields absent from the body", async () =>
    await keepsAbsentLocalizedFields());
  it("answers 404 for a missing row", async () => await answersNotFound());
  it("answers 400 for a body that is not JSON", async () =>
    await answersBadRequestForInvalidJson());
  it("answers 400 for a body that is not a JSON object", async () =>
    await answersBadRequestForNonObjectBody());
  it("answers 400 on new for a body that is not a JSON object", async () =>
    await answersBadRequestForNonObjectBodyOnNew());
});

async function _dropArticleTable() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(articleTableName).delete();
  }
}

async function _createDataController(
  testName: string,
  article?: Partial<Article>,
) {
  @RegisterDataController()
  class _PartialEditTestAPI extends DataController(
    Article,
    {
      get: DefaultRoutes.Get,
      new: DefaultRoutes.New,
      edit: DefaultRoutes.Edit,
    },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(ArticleModel)
    declare articleModel: ArticleModel;

    @Parameter("locale", "query")
    @ModifierKey(LocalizationModifier)
    declare locale: string;

    declare _id: string;

    @Access(AccessMode.ReadWrite)
    declare reference: string;

    @Access(AccessMode.ReadWrite)
    declare author: string;

    @Access(AccessMode.ReadWrite)
    declare notes: string | null;

    @Access(AccessMode.ReadWrite)
    declare title: string;

    @Access(AccessMode.ReadWrite)
    declare summary: string;

    @Access(AccessMode.WriteOnly)
    set slug(value: string | undefined) {
      this.table.slug = value ?? defaultSlug;
    }
  }
  await RegisterSchema(schemaName);
  await _dropArticleTable();
  const articleModel = new ArticleModel(getSchemaInstance(schemaName));

  if (article) {
    const insertResult = await articleModel.insert(article);
    return { id: insertResult[0], articleModel };
  }
  return { articleModel };
}

async function _createLocalizedArticle(testName: string) {
  await _createDataController(testName);
  const response = await newRequest(testName, localizedArticle, {
    locale: allLocales,
  });
  expect(response.status).to.equal(200);
  const [id] = (await response.json()) as string[];
  return id;
}

async function _getLocalized(testName: string, id: string, locale: string) {
  const response = await getRequest(testName, { id, locale });
  expect(response.status).to.equal(200);
  return (await response.json()) as LocalizedArticle;
}

async function _rawRequest(
  testName: string,
  uri: string,
  method: string,
  body: string,
  queryParams: Record<string, string> = {},
) {
  return await fetch(
    `${URL_BASE}/${testName}/${uri}?${new URLSearchParams(queryParams).toString()}`,
    { method, headers: { "Content-Type": "application/json" }, body },
  );
}

async function leavesAbsentFieldsUnchanged() {
  const { id, articleModel } = await _createDataController(
    getFunctionName(),
    storedArticle,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    { author: "Bob" },
    { id },
  );
  expect(response.status).to.equal(200);

  const article = await articleModel.get(id);
  expect(article).to.include({
    author: "Bob",
    reference: storedArticle.reference,
    notes: storedArticle.notes,
    slug: storedArticle.slug,
  });
}

async function clearsNullField() {
  const { id, articleModel } = await _createDataController(
    getFunctionName(),
    storedArticle,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    { notes: null },
    { id },
  );
  expect(response.status).to.equal(200);

  const article = await articleModel.get(id);
  expect(article?.notes).to.equal(null);
  expect(article?.reference).to.equal(storedArticle.reference);
}

async function skipsSettersOfAbsentFields() {
  const { id, articleModel } = await _createDataController(
    getFunctionName(),
    storedArticle,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    { author: "Bob" },
    { id },
  );
  expect(response.status).to.equal(200);

  const article = await articleModel.get(id);
  expect(article?.slug).to.equal(storedArticle.slug);
}

async function runsSettersOfPresentFields() {
  const { id, articleModel } = await _createDataController(
    getFunctionName(),
    storedArticle,
  );
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    { slug: "edited-slug" },
    { id },
  );
  expect(response.status).to.equal(200);

  const article = await articleModel.get(id);
  expect(article?.slug).to.equal("edited-slug");
}

async function runsEverySetterOnNew() {
  const { articleModel } = await _createDataController(getFunctionName());

  const response = await newRequest(getFunctionName(), {
    reference: "ART-003",
  });
  expect(response.status).to.equal(200);
  const [id] = (await response.json()) as string[];

  const article = await articleModel.get(id);
  expect(article?.slug).to.equal(defaultSlug);
}

async function keepsOtherLanguagesOfWrittenField() {
  const id = await _createLocalizedArticle(getFunctionName());

  const response = await editRequest(
    getFunctionName(),
    { title: "Nouveau titre" },
    { id, locale: "fr" },
  );
  expect(response.status).to.equal(200);

  expect(await _getLocalized(getFunctionName(), id, "fr")).to.include({
    title: "Nouveau titre",
    summary: localizedArticle.summary.fr,
  });
  expect(await _getLocalized(getFunctionName(), id, "en")).to.include({
    title: localizedArticle.title.en,
    summary: localizedArticle.summary.en,
  });
}

async function keepsAbsentLocalizedFields() {
  const id = await _createLocalizedArticle(getFunctionName());

  const response = await editRequest(
    getFunctionName(),
    { reference: "ART-002-B" },
    { id, locale: allLocales },
  );
  expect(response.status).to.equal(200);

  expect(await _getLocalized(getFunctionName(), id, "fr")).to.include({
    title: localizedArticle.title.fr,
    summary: localizedArticle.summary.fr,
  });
  expect(await _getLocalized(getFunctionName(), id, "en")).to.include({
    title: localizedArticle.title.en,
    summary: localizedArticle.summary.en,
  });
}

async function answersNotFound() {
  await _createDataController(getFunctionName(), storedArticle);

  const response = await editRequest(
    getFunctionName(),
    { author: "Bob" },
    { id: missingRowId },
  );
  expect(response.status).to.equal(404);
}

async function answersBadRequestForInvalidJson() {
  const { id } = await _createDataController(getFunctionName(), storedArticle);
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await _rawRequest(getFunctionName(), "edit", "PUT", "{", {
    id,
  });
  expect(response.status).to.equal(400);
}

async function answersBadRequestForNonObjectBody() {
  const { id } = await _createDataController(getFunctionName(), storedArticle);
  if (!id) throw new Error("Expected id from _createDataController");

  for (const body of ["[]", "null", '"text"', "42"]) {
    const response = await _rawRequest(getFunctionName(), "edit", "PUT", body, {
      id,
    });
    expect(response.status).to.equal(400, `body ${body}`);
  }
}

async function answersBadRequestForNonObjectBodyOnNew() {
  await _createDataController(getFunctionName());

  for (const body of ["{", "[]", "null"]) {
    const response = await _rawRequest(getFunctionName(), "new", "POST", body);
    expect(response.status).to.equal(400, `body ${body}`);
  }
}
