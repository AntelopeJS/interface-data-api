import path from "node:path";
import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Filter,
  Joined,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  CreateDatabaseSchemaInstance,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
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
  declare name: string;
  declare email: string;
}
class AuthorModel extends BasicDataModel(Author, authorTableName) {}

@RegisterTable(bookTableName, schemaName)
class Book extends Table {
  declare _id: string;
  declare authorId: string;
  declare title: string;
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

const authorsDataset: Partial<Author>[] = [
  { name: "Alice Carter", email: "alice@example.com" },
  { name: "Bob Stone", email: "bob@example.com" },
  { name: "Carol Wilde", email: "carol@example.com" },
];

const orphanAuthorId = "orphan-author-id";

describe("Field Joined", () => {
  it("lists rows with joined fields flattened", async () =>
    await listsRowsWithJoinedFieldsFlattened());
  it("gets row with joined fields flattened", async () =>
    await getsRowWithJoinedFieldsFlattened());
  it("sorts by joined field ascending", async () =>
    await sortsByJoinedFieldAscending());
  it("sorts by joined field descending", async () =>
    await sortsByJoinedFieldDescending());
  it("filters by joined field", async () => await filtersByJoinedField());
  it("returns null for orphan foreign key", async () =>
    await returnsNullForOrphanForeignKey());
  it("ignores joined field on edit body", async () =>
    await ignoresJoinedFieldOnEdit());
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

  await CreateDatabaseSchemaInstance(schemaName);
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

async function listsRowsWithJoinedFieldsFlattened() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: BookListed[] };
  expect(data.results).to.have.lengthOf(5);

  const alphaRising = data.results.find((b) => b.title === "Alpha Rising");
  expect(alphaRising).to.not.equal(undefined);
  expect(alphaRising?.name).to.equal("Alice Carter");
  expect(alphaRising?.email).to.equal("alice@example.com");
  expect(typeof alphaRising?.authorId).to.equal("string");

  const betaStories = data.results.find((b) => b.title === "Beta Stories");
  expect(betaStories?.name).to.equal("Bob Stone");
  expect(betaStories?.email).to.equal("bob@example.com");
}

async function getsRowWithJoinedFieldsFlattened() {
  const { bookIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), { id: bookIds[0] });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`get failed (${response.status}): ${text}`);
  }
  const book = (await response.json()) as BookListed;
  expect(book.title).to.equal("Alpha Rising");
  expect(book.name).to.equal("Alice Carter");
  expect(book.email).to.equal("alice@example.com");
  expect(typeof book.authorId).to.equal("string");
}

async function sortsByJoinedFieldAscending() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    sortKey: "name",
    sortDirection: "asc",
  });
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: BookListed[] };
  const namesInOrder = data.results
    .map((b) => b.name)
    .filter((n): n is string => typeof n === "string");
  const sorted = [...namesInOrder].sort((a, b) => a.localeCompare(b));
  expect(namesInOrder).to.deep.equal(sorted);
}

async function sortsByJoinedFieldDescending() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    sortKey: "name",
    sortDirection: "desc",
  });
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: BookListed[] };
  const namesInOrder = data.results
    .map((b) => b.name)
    .filter((n): n is string => typeof n === "string");
  const sorted = [...namesInOrder].sort((a, b) => b.localeCompare(a));
  expect(namesInOrder).to.deep.equal(sorted);
}

async function filtersByJoinedField() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {
    filter_name: "eq:Alice Carter",
  });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`filter failed (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { results: BookListed[] };
  expect(data.results.length).to.equal(2);
  for (const book of data.results) {
    expect(book.name).to.equal("Alice Carter");
  }
}

async function returnsNullForOrphanForeignKey() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: BookListed[] };
  const orphan = data.results.find((b) => b.title === "Lost Chapter");
  expect(orphan).to.not.equal(undefined);
  expect(orphan?.name).to.equal(null);
  expect(orphan?.email).to.equal(null);
  expect(orphan?.authorId).to.equal(orphanAuthorId);
}

async function ignoresJoinedFieldOnEdit() {
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
