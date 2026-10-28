import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import {
  Access,
  AccessMode,
  Computed,
  Filter,
  Joined,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";

import { type ListResponse, readJson } from "../internal/http";
import {
  editRequest,
  getFunctionName,
  getRequest,
  getSchemaInstance,
  listRequest,
} from "../utils";

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
  @Relation({ to: () => Author })
  declare authorId: string;

  @Field("string")
  declare title: string;

  @Field("number")
  declare price: number;
}
class BookModel extends BasicDataModel(Book, bookTableName) {}

interface BookListed {
  _id: string;
  authorId: string;
  title: string;
  price: number;
  name: string | null;
  email: string | null;
}

interface BookDisplayed {
  title: string;
  display: string | null;
  name?: string;
}

const authorsDataset: Partial<Author>[] = [
  { name: "Alice Carter", email: "alice@example.com" },
  { name: "Bob Stone", email: "bob@example.com" },
  { name: "Carol Wilde", email: "carol@example.com" },
];

const orphanAuthorId = "orphan-author-id";

describe("Field Joined", () => {
  it("lists rows with joined fields flattened", async () =>
    await expectListsRowsWithJoinedFieldsFlattened());
  it("gets row with joined fields flattened", async () =>
    await expectGetsRowWithJoinedFieldsFlattened());
  it("sorts by joined field ascending", async () =>
    await expectSortsByJoinedFieldAscending());
  it("sorts by joined field descending", async () =>
    await expectSortsByJoinedFieldDescending());
  it("filters by joined field", async () => await expectFiltersByJoinedField());
  it("keeps joined fields on paginated rows when unused by sort and filter", async () =>
    await expectKeepsJoinedFieldsOnPaginatedRows());
  it("resolves computed fields reading a non-plucked joined field", async () =>
    await expectResolvesComputedFieldReadingNonPluckedJoinedField());
  it("returns null for orphan foreign key", async () =>
    await expectReturnsNullForOrphanForeignKey());
  it("ignores joined field on edit body", async () =>
    await expectIgnoresJoinedFieldOnEdit());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _JoinedTestAPI extends DataController(
    Book,
    {
      list: DefaultRoutes.List,
      get: DefaultRoutes.Get,
      edit: DefaultRoutes.Edit,
    },
    Controller(`/${testName}`),
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
    @Sortable({ noIndex: true })
    declare title: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    @Sortable({ noIndex: true })
    declare price: number;

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

  return _seedTables();
}

async function _createComputedJoinedController(testName: string) {
  @RegisterDataController()
  class _JoinedComputedTestAPI extends DataController(
    Book,
    {
      list: DefaultRoutes.List,
    },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(BookModel)
    declare bookModel: BookModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare title: string;

    @Joined({
      table: authorTableName,
      localKey: "authorId",
      remoteField: "name",
    })
    declare name: string;

    @Listable()
    @Computed((row) => row.key("name").concat(" (author)"))
    declare display: string;
  }

  return _seedTables();
}

async function _seedTables() {
  await RegisterSchema(schemaName);
  await _dropTables();

  const schemaInstance = getSchemaInstance(schemaName);
  const authorModel = new AuthorModel(schemaInstance);
  const bookModel = new BookModel(schemaInstance);

  const authorIdsRecord = await authorModel.insert(authorsDataset);
  const authorIds = Object.values(authorIdsRecord);

  const booksDataset: Partial<Book>[] = [
    { authorId: authorIds[0], title: "Alpha Rising", price: 19.99 },
    { authorId: authorIds[1], title: "Beta Stories", price: 29.99 },
    { authorId: authorIds[2], title: "Gamma Tales", price: 9.99 },
    { authorId: authorIds[0], title: "Alpha Returns", price: 24.99 },
    { authorId: orphanAuthorId, title: "Lost Chapter", price: 4.99 },
  ];

  const bookIdsRecord = await bookModel.insert(booksDataset);
  const bookIds = Object.values(bookIdsRecord);

  return { authorIds, bookIds, authorModel, bookModel };
}

async function _dropTables() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(bookTableName).delete();
    await schema.instance().table(authorTableName).delete();
  }
}

async function expectListsRowsWithJoinedFieldsFlattened() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: BookListed[] }>(response);
  expect(data.results).to.have.lengthOf(5);

  const alphaRising = data.results.find((b) => b.title === "Alpha Rising");
  expect(alphaRising).to.not.equal(undefined);
  expect(alphaRising?.name).to.equal("Alice Carter");
  expect(alphaRising?.email).to.equal("alice@example.com");
  expect(alphaRising?.authorId).to.be.a("string");

  const betaStories = data.results.find((b) => b.title === "Beta Stories");
  expect(betaStories?.name).to.equal("Bob Stone");
  expect(betaStories?.email).to.equal("bob@example.com");
}

async function expectGetsRowWithJoinedFieldsFlattened() {
  const { bookIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), { id: bookIds[0] });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`get failed (${response.status}): ${text}`);
  }
  const book = await readJson<BookListed>(response);
  expect(book.title).to.equal("Alpha Rising");
  expect(book.name).to.equal("Alice Carter");
  expect(book.email).to.equal("alice@example.com");
  expect(book.authorId).to.be.a("string");
}

async function expectSortsByJoinedFieldAscending() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    sortKey: "name",
    sortDirection: "asc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: BookListed[] }>(response);
  const namesInOrder = data.results
    .map((b) => b.name)
    .filter((n) => n !== null);
  const sorted = [...namesInOrder].sort((a, b) => a.localeCompare(b));
  expect(namesInOrder).to.deep.equal(sorted);
}

async function expectSortsByJoinedFieldDescending() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    sortKey: "name",
    sortDirection: "desc",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: BookListed[] }>(response);
  const namesInOrder = data.results
    .map((b) => b.name)
    .filter((n) => n !== null);
  const sorted = [...namesInOrder].sort((a, b) => b.localeCompare(a));
  expect(namesInOrder).to.deep.equal(sorted);
}

async function expectFiltersByJoinedField() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    filter_name: "eq:Alice Carter",
  });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`filter failed (${response.status}): ${text}`);
  }
  const data = await readJson<{ results: BookListed[] }>(response);
  expect(data.results.length).to.equal(2);
  for (const book of data.results) {
    expect(book.name).to.equal("Alice Carter");
  }
}

async function expectKeepsJoinedFieldsOnPaginatedRows() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    sortKey: "title",
    sortDirection: "asc",
    offset: "1",
    limit: "2",
  });
  expect(response.status).to.equal(200);
  const data = await readJson<{
    results: BookListed[];
    total: number;
  }>(response);
  expect(data.total).to.equal(5);
  expect(data.results.map((b) => b.title)).to.deep.equal([
    "Alpha Rising",
    "Beta Stories",
  ]);
  expect(data.results.map((b) => b.name)).to.deep.equal([
    "Alice Carter",
    "Bob Stone",
  ]);
  expect(data.results.map((b) => b.email)).to.deep.equal([
    "alice@example.com",
    "bob@example.com",
  ]);
}

async function expectResolvesComputedFieldReadingNonPluckedJoinedField() {
  await _createComputedJoinedController(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = await readJson<ListResponse<BookDisplayed>>(response);
  expect(data.total).to.equal(5);
  expect(data.results).to.have.lengthOf(5);

  const alphaRising = data.results.find((b) => b.title === "Alpha Rising");
  expect(alphaRising).to.not.equal(undefined);
  expect(alphaRising?.display).to.equal("Alice Carter (author)");
  expect(alphaRising?.name).to.equal(undefined);
}

async function expectReturnsNullForOrphanForeignKey() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = await readJson<{ results: BookListed[] }>(response);
  const orphan = data.results.find((b) => b.title === "Lost Chapter");
  expect(orphan).to.not.equal(undefined);
  expect(orphan?.name).to.equal(null);
  expect(orphan?.email).to.equal(null);
  expect(orphan?.authorId).to.equal(orphanAuthorId);
}

async function expectIgnoresJoinedFieldOnEdit() {
  const { bookIds, bookModel, authorIds, authorModel } =
    await _createDataController(getFunctionName());

  const editPayload = {
    title: "Alpha Rising (revised)",
    name: "Hacker Forged Name",
    email: "hacker@example.com",
  };
  const response = await editRequest(getFunctionName(), editPayload, {
    id: bookIds[0],
  });
  expect(response.status).to.equal(200);

  const updatedBook = await bookModel.get(bookIds[0]);
  expect(updatedBook?.title).to.equal("Alpha Rising (revised)");

  const author = await authorModel.get(authorIds[0]);
  expect(author?.name).to.equal("Alice Carter");
  expect(author?.email).to.equal("alice@example.com");
}
