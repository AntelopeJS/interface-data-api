import path from "node:path";
import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  DataAPIMeta,
  Foreign,
  Joined,
  Listable,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import {
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
const shelfTableName = `shelves-${currentTestName}`;
const schemaName = "default";

// Join source for the relation target's @Joined label.
@RegisterTable(authorTableName, schemaName)
class Author extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;
}
class AuthorModel extends BasicDataModel(Author, authorTableName) {}

// Relation TARGET: `authorName` is a @Joined field (not a physical column),
// pulled from Author via authorId — like memberSettingDataAPI.name from User.
@RegisterTable(bookTableName, schemaName)
class Book extends Table {
  declare _id: string;

  @Field("string")
  @Relation({ to: () => Author })
  declare authorId: string;

  @Field("string")
  declare title: string;
}
class BookModel extends BasicDataModel(Book, bookTableName) {}

// PARENT (the listed controller): `book` is a relation to Book, whose label is
// the joined `authorName`.
@RegisterTable(shelfTableName, schemaName)
class Shelf extends Table {
  declare _id: string;

  @Field("string")
  @Relation({ to: () => Book })
  declare book: string; // stores a Book._id
}
class ShelfModel extends BasicDataModel(Shelf, shelfTableName) {}

interface ShelfListed {
  _id: string;
  book: {
    _id: string;
    title: string;
    authorId: string;
    authorName: string | null;
  } | null;
}

const orphanBookId = "orphan-book-id";

describe("Foreign relation with @Joined target label", () => {
  it("resolves a joined label through a relation in list", async () =>
    await resolvesJoinedLabelInList());
  it("returns null relation for an orphan foreign key", async () =>
    await returnsNullForOrphanRelation());
  it("resolves a joined label through a relation in get", async () =>
    await resolvesJoinedLabelInGet());
  it("returns null relation for an orphan foreign key in get", async () =>
    await returnsNullForOrphanRelationInGet());
});

async function _setup(testName: string) {
  @RegisterDataController()
  class _BookTargetAPI extends DataController(
    Book,
    { list: DefaultRoutes.List },
    Controller(`/${testName}_book`),
  ) {
    @ModelReference()
    @Model(BookModel)
    declare bookModel: BookModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare authorId: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare title: string;

    @Listable(["authorId"])
    @Joined({
      table: authorTableName,
      localKey: "authorId",
      remoteField: "name",
    })
    declare authorName: string;
  }

  const bookMeta = GetMetadata(_BookTargetAPI, DataAPIMeta);

  @RegisterDataController()
  class _ShelfAPI extends DataController(
    Shelf,
    { list: DefaultRoutes.List, get: DefaultRoutes.Get },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(ShelfModel)
    declare shelfModel: ShelfModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Foreign(
      bookTableName,
      undefined,
      false,
      ["_id", "title", "authorName"],
      undefined,
      bookMeta,
    )
    @Access(AccessMode.ReadWrite)
    declare book: string;
  }

  await RegisterSchema(schemaName);
  await _dropTables();

  const schemaInstance = getSchemaInstance(schemaName);
  const authorModel = new AuthorModel(schemaInstance);
  const bookModel = new BookModel(schemaInstance);
  const shelfModel = new ShelfModel(schemaInstance);

  const authorIdsRecord = await authorModel.insert([
    { name: "Alice Carter" },
    { name: "Bob Stone" },
  ]);
  const authorIds = Object.values(authorIdsRecord);

  const bookIdsRecord = await bookModel.insert([
    { authorId: authorIds[0], title: "Alpha Rising" },
    { authorId: authorIds[1], title: "Beta Stories" },
  ]);
  const bookIds = Object.values(bookIdsRecord);

  const shelfIdsRecord = await shelfModel.insert([
    { book: bookIds[0] },
    { book: bookIds[1] },
    { book: orphanBookId },
  ]);
  const shelfIds = Object.values(shelfIdsRecord);

  return { authorIds, bookIds, shelfIds };
}

async function _dropTables() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(shelfTableName).delete();
    await schema.instance().table(bookTableName).delete();
    await schema.instance().table(authorTableName).delete();
  }
}

async function resolvesJoinedLabelInList() {
  await _setup(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: ShelfListed[] };

  const alpha = data.results.find((s) => s.book?.title === "Alpha Rising");
  expect(alpha, "row for Alpha Rising").to.not.equal(undefined);
  // Core regression: the joined label resolves through the relation.
  expect(alpha?.book?.authorName).to.equal("Alice Carter");
  // The join key must not leak: only the requested fields are exposed.
  expect(Object.keys(alpha?.book ?? {}).sort()).to.deep.equal([
    "_id",
    "authorName",
    "title",
  ]);

  const beta = data.results.find((s) => s.book?.title === "Beta Stories");
  expect(beta?.book?.authorName).to.equal("Bob Stone");
}

async function returnsNullForOrphanRelation() {
  await _setup(getFunctionName());

  const response = await listRequest(getFunctionName(), {});
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: ShelfListed[] };

  const resolved = data.results.filter((s) => s.book?.title);
  expect(resolved).to.have.lengthOf(2);
  // The orphan shelf points to a non-existent book → relation stays null.
  const orphan = data.results.find((s) => !s.book?.title);
  expect(orphan, "orphan relation row present").to.not.equal(undefined);
  expect(orphan?.book, "orphan relation value").to.equal(null);
}

async function resolvesJoinedLabelInGet() {
  const { shelfIds } = await _setup(getFunctionName());

  const response = await getRequest(getFunctionName(), { id: shelfIds[0] });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`get failed (${response.status}): ${text}`);
  }
  const shelf = (await response.json()) as ShelfListed;
  expect(shelf.book?.title).to.equal("Alpha Rising");
  expect(shelf.book?.authorName).to.equal("Alice Carter");
}

async function returnsNullForOrphanRelationInGet() {
  const { shelfIds } = await _setup(getFunctionName());

  // shelfIds[2] points to an orphan book id.
  const response = await getRequest(getFunctionName(), { id: shelfIds[2] });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`get orphan failed (${response.status}): ${text}`);
  }
  const shelf = (await response.json()) as ShelfListed;
  expect(shelf.book, "orphan relation value in get").to.equal(null);
}
