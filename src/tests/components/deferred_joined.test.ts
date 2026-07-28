import path from "node:path";
import type { RequestContext } from "@antelopejs/interface-api";
import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  GetDataControllerMeta,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { Query } from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
  Filter,
  Joined,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import {
  Schema,
  type Stream,
  type ValueProxy,
} from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { getSchemaInstance } from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const authorTableName = `authors-${currentTestName}`;
const bookTableName = `books-${currentTestName}`;
const schemaName = "default";

@RegisterTable(authorTableName, schemaName)
class Author extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;

  @Field("string")
  declare email: string;
}
class AuthorModel extends BasicDataModel(Author, authorTableName) {}

@RegisterTable(bookTableName, schemaName)
class Book extends Table {
  declare _id: string;

  @Field("string")
  declare authorId: string;

  @Field("string")
  declare title: string;
}
class BookModel extends BasicDataModel(Book, bookTableName) {}

@RegisterDataController()
class _DeferredJoinedTestAPI extends DataController(
  Book,
  {
    list: DefaultRoutes.List,
  },
  Controller(`/${currentTestName}`),
) {
  @ModelReference()
  @Model(BookModel)
  declare bookModel: BookModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare authorId: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Listable(["authorId"])
  @Joined({
    table: authorTableName,
    localKey: "authorId",
    remoteField: "name",
  })
  @Sortable({ noIndex: true })
  @Filter()
  declare name: string;

  @Listable(["authorId"])
  @Joined({
    table: authorTableName,
    localKey: "authorId",
    remoteField: "email",
  })
  declare email: string;
}

interface BookListed {
  _id: string;
  authorId: string;
  title: string;
  name: string | null;
  email: string | null;
}

interface PipelineStage {
  stage: string;
}

interface PipelineStaged {
  build(): PipelineStage[];
}

interface ListHarness {
  thisObj: _DeferredJoinedTestAPI;
  model: BookModel;
}

const authorsDataset: Partial<Author>[] = [
  { name: "Alice Carter", email: "alice@example.com" },
  { name: "Bob Stone", email: "bob@example.com" },
  { name: "Carol Wilde", email: "carol@example.com" },
];

const orphanAuthorId = "orphan-author-id";
const reqCtx = {} as RequestContext;

describe("Query.List deferred joined self-resolution", () => {
  it("resolves joined fields on a paged two-element destructure", async () =>
    await resolvesJoinedFieldsOnPagedTwoElementDestructure());
  it("keeps page lookups after the slice and off the count pipeline", async () =>
    await keepsLookupsAfterSliceAndOffCountPipeline());
  it("materializes joined fields for a caller-added filter", async () =>
    await materializesJoinedFieldsForCallerFilter());
  it("resolves joined fields on a directly awaited stream", async () =>
    await resolvesJoinedFieldsOnDirectAwait());
  it("resolves joined fields on an nth datum", async () =>
    await resolvesJoinedFieldsOnNthDatum());
  it("orders by a joined field when the caller sorts the stream", async () =>
    await ordersByJoinedFieldOnCallerSort());
  it("materializes the whole joined group when sorting through List", async () =>
    await materializesJoinedGroupOnListSort());
  it("exposes the deferred set and raw stream only on demand", async () =>
    await exposesDeferredSetOnDemand());
  it("keeps the change feed on the raw pipeline", async () =>
    await keepsChangeFeedOnRawPipeline());
  it("scopes field aggregates to the joined fields they read", async () =>
    await scopesFieldAggregatesToJoinedFields());
  it("still pages the lookups after a cast", async () =>
    await stillPagesLookupsAfterCast());
  it("materializes joined fields when embedded in another query", async () =>
    await materializesJoinedFieldsWhenEmbedded());
  it("resolves joined fields on async iteration", async () =>
    await resolvesJoinedFieldsOnAsyncIteration());
  it("returns the unresolved names when no database is provided", async () =>
    await returnsUnresolvedNamesWithoutDatabase());
});

async function _seedTables(): Promise<ListHarness> {
  await RegisterSchema(schemaName);
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(bookTableName).delete();
    await schema.instance().table(authorTableName).delete();
  }

  const schemaInstance = getSchemaInstance(schemaName);
  const authorModel = new AuthorModel(schemaInstance);
  const bookModel = new BookModel(schemaInstance);

  const authorIdsRecord = await authorModel.insert(authorsDataset);
  const authorIds = Object.values(authorIdsRecord);

  const booksDataset: Partial<Book>[] = [
    { authorId: authorIds[0], title: "Alpha Rising" },
    { authorId: authorIds[1], title: "Beta Stories" },
    { authorId: authorIds[2], title: "Gamma Tales" },
    { authorId: authorIds[0], title: "Alpha Returns" },
    { authorId: orphanAuthorId, title: "Lost Chapter" },
  ];
  await bookModel.insert(booksDataset);

  const thisObj: _DeferredJoinedTestAPI = Object.create(
    _DeferredJoinedTestAPI.prototype,
  );
  return { thisObj, model: bookModel };
}

function listAsConsumer(harness: ListHarness) {
  const meta = GetDataControllerMeta(harness.thisObj);
  return Query.List(
    harness.thisObj,
    meta,
    harness.model.table,
    reqCtx,
    undefined,
    undefined,
    harness.model.database,
  );
}

function stageNames(staged: PipelineStaged): string[] {
  return staged.build().map((entry) => entry.stage);
}

async function resolvesJoinedFieldsOnPagedTwoElementDestructure() {
  const harness = await _seedTables();
  const [query, queryTotal] = listAsConsumer(harness);

  const page = (await query
    .slice(0, 10)
    .pluck("_internal", "title", "name", "email")) as BookListed[];
  expect(await queryTotal).to.equal(5);
  expect(page).to.have.lengthOf(5);

  const alphaRising = page.find((book) => book.title === "Alpha Rising");
  expect(alphaRising?.name).to.equal("Alice Carter");
  expect(alphaRising?.email).to.equal("alice@example.com");

  const lostChapter = page.find((book) => book.title === "Lost Chapter");
  expect(lostChapter?.name).to.equal(null);
  expect(lostChapter?.email).to.equal(null);
}

async function keepsLookupsAfterSliceAndOffCountPipeline() {
  const harness = await _seedTables();
  const [query, queryTotal] = listAsConsumer(harness);

  const countStages = stageNames(queryTotal);
  expect(countStages).to.include("count");
  expect(countStages).to.not.include("lookup");

  const directCountStages = stageNames(query.count());
  expect(directCountStages).to.include("count");
  expect(directCountStages).to.not.include("lookup");

  const pageStages = stageNames(query.slice(0, 2));
  expect(pageStages.indexOf("lookup")).to.be.greaterThan(
    pageStages.indexOf("slice"),
  );
}

async function materializesJoinedFieldsForCallerFilter() {
  const harness = await _seedTables();
  let [query] = listAsConsumer(harness);

  query = query.filter((row) =>
    (row as unknown as ValueProxy<BookListed>).key("name").eq("Alice Carter"),
  ) as Stream<Book>;

  const matches = (await query) as BookListed[];
  expect(matches).to.have.lengthOf(2);
  for (const match of matches) {
    expect(match.name).to.equal("Alice Carter");
    expect(match.email).to.equal("alice@example.com");
  }
  expect(await query.count()).to.equal(2);
}

async function resolvesJoinedFieldsOnDirectAwait() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const rows = (await query) as BookListed[];
  expect(rows).to.have.lengthOf(5);
  const betaStories = rows.find((book) => book.title === "Beta Stories");
  expect(betaStories?.name).to.equal("Bob Stone");
  expect(betaStories?.email).to.equal("bob@example.com");
}

async function resolvesJoinedFieldsOnNthDatum() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const first = (await query.nth(0)) as BookListed;
  expect(first.title).to.be.a("string");
  expect(first).to.have.property("name");
  expect(first).to.have.property("email");

  const internalKeys = Object.keys(first).filter((key) =>
    key.startsWith("__joined_orig_"),
  );
  expect(internalKeys).to.deep.equal([]);
  expect(first.authorId).to.be.a("string");

  const second = (await query.nth(1)) as BookListed;
  expect(second.title).to.not.equal(first.title);
}

async function ordersByJoinedFieldOnCallerSort() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const rows = (await (query as unknown as Stream<BookListed>).orderBy(
    "name",
    "desc",
  )) as BookListed[];
  expect(rows).to.have.lengthOf(5);
  const names = rows.map((book) => book.name).filter((name) => name !== null);
  expect(names).to.deep.equal([...names].sort().reverse());
  expect(names[0]).to.equal("Carol Wilde");
}

async function materializesJoinedGroupOnListSort() {
  const harness = await _seedTables();
  const meta = GetDataControllerMeta(harness.thisObj);
  const [query, , deferredJoined] = Query.List(
    harness.thisObj,
    meta,
    harness.model.table,
    reqCtx,
    ["name", "asc"],
    undefined,
    harness.model.database,
  );

  expect(deferredJoined.size).to.equal(0);
  const rows = (await query.slice(0, 5)) as BookListed[];
  const gammaTales = rows.find((book) => book.title === "Gamma Tales");
  expect(gammaTales?.name).to.equal("Carol Wilde");
  expect(gammaTales?.email).to.equal("carol@example.com");
}

async function keepsChangeFeedOnRawPipeline() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const feedStages = stageNames(query.changes());
  expect(feedStages).to.include("changes");
  expect(feedStages).to.not.include("lookup");
}

async function scopesFieldAggregatesToJoinedFields() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const listedQuery = query as unknown as Stream<BookListed>;
  const joinedFieldStages = stageNames(listedQuery.count("name"));
  expect(joinedFieldStages).to.include("count");
  expect(joinedFieldStages).to.include("lookup");

  const plainFieldStages = stageNames(query.count("title"));
  expect(plainFieldStages).to.include("count");
  expect(plainFieldStages).to.not.include("lookup");

  const distinctRowStages = stageNames(
    (query as Stream<Book>).distinct() as unknown as PipelineStaged,
  );
  expect(distinctRowStages).to.include("distinct");
  expect(distinctRowStages).to.include("lookup");
}

async function stillPagesLookupsAfterCast() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const pageStages = stageNames(query.cast<BookListed>().slice(0, 2));
  expect(pageStages.indexOf("lookup")).to.be.greaterThan(
    pageStages.indexOf("slice"),
  );

  const page = (await query.cast<BookListed>().slice(0, 10)) as BookListed[];
  const alphaRising = page.find((book) => book.title === "Alpha Rising");
  expect(alphaRising?.name).to.equal("Alice Carter");
}

async function materializesJoinedFieldsWhenEmbedded() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const unioned = (await (harness.model.table as unknown as Stream<Book>).union(
    query,
  )) as BookListed[];
  expect(unioned).to.have.lengthOf(10);
  const withJoined = unioned.filter((row) => "name" in row);
  expect(withJoined).to.have.lengthOf(5);
  expect(
    withJoined.filter((row) => row.name === "Alice Carter"),
  ).to.have.lengthOf(2);
}

async function resolvesJoinedFieldsOnAsyncIteration() {
  const harness = await _seedTables();
  const [query] = listAsConsumer(harness);

  const names = new Set<string | null>();
  for await (const row of query as unknown as Stream<BookListed>) {
    names.add(row.name);
    if (names.has("Alice Carter") && names.has("Bob Stone")) {
      break;
    }
  }
  expect(names.has("Alice Carter")).to.equal(true);
  expect(names.has("Bob Stone")).to.equal(true);
}

async function returnsUnresolvedNamesWithoutDatabase() {
  const harness = await _seedTables();
  const meta = GetDataControllerMeta(harness.thisObj);

  const [query, , deferredJoined] = Query.List(
    harness.thisObj,
    meta,
    harness.model.table,
    reqCtx,
  );

  expect(Array.from(deferredJoined).sort()).to.deep.equal(["email", "name"]);
  const pageStages = stageNames(query.slice(0, 5));
  expect(pageStages).to.not.include("lookup");
}

async function exposesDeferredSetOnDemand() {
  const harness = await _seedTables();
  const meta = GetDataControllerMeta(harness.thisObj);

  const [, , resolvedByLayer] = listAsConsumer(harness);
  expect(resolvedByLayer.size).to.equal(0);

  const [rawQuery, rawTotal, deferredJoined] = Query.List(
    harness.thisObj,
    meta,
    harness.model.table,
    reqCtx,
    undefined,
    undefined,
    harness.model.database,
    { exposeDeferredJoined: true },
  );

  expect(Array.from(deferredJoined).sort()).to.deep.equal(["email", "name"]);
  expect(await rawTotal).to.equal(5);

  const rawRows = (await rawQuery.slice(0, 5)) as BookListed[];
  expect(rawRows).to.have.lengthOf(5);
  for (const row of rawRows) {
    expect(row).to.not.have.property("name");
    expect(row).to.not.have.property("email");
  }
}
