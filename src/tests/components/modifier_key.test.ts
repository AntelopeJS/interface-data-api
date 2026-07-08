import path from "node:path";
import { Controller, Parameter } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Foreign,
  Listable,
  ModelReference,
  ModifierKey,
} from "@antelopejs/interface-data-api/metadata";
import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  LocalizationModifier,
  Localized,
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
const postTableName = `posts-${currentTestName}`;
const schemaName = "default";
const locale = "en";

@RegisterTable(authorTableName, schemaName)
class Author extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;

  @Field("string")
  declare email: string;
}
class AuthorModel extends BasicDataModel(Author, authorTableName) {}

@RegisterTable(postTableName, schemaName)
class Post extends Table.with(LocalizationModifier) {
  declare _id: string;

  @Field("string")
  @Relation({ to: () => Author })
  declare authorId: string | null;

  @Localized()
  declare title: string;
}
class PostModel extends BasicDataModel(Post, postTableName) {}

interface AuthorReference {
  _id: string;
  name: string;
  email: string;
}

interface PostListed {
  _id: string;
  authorId: AuthorReference | null;
}

const authorDataset: Partial<Author>[] = [
  { name: "Alice Carter", email: "alice@example.com" },
];

const orphanAuthorId = "orphan-author-id";

describe("Modifier key with foreign fields", () => {
  it("gets row with resolved foreign reference", async () =>
    await getsRowWithResolvedForeignReference());
  it("gets row with null foreign reference", async () =>
    await getsRowWithNullForeignReference());
  it("gets row with dangling foreign reference", async () =>
    await getsRowWithDanglingForeignReference());
  it("lists rows containing null foreign references", async () =>
    await listsRowsContainingNullForeignReferences());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _ModifierKeyTestAPI extends DataController(
    Post,
    {
      list: DefaultRoutes.List,
      get: DefaultRoutes.Get,
    },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(PostModel)
    declare postModel: PostModel;

    @Parameter("locale", "query")
    @ModifierKey(LocalizationModifier)
    declare locale: string;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    @Foreign(Author)
    declare authorId: Author | null;

    @Listable()
    @Access(AccessMode.ReadWrite)
    declare title: string;
  }

  await RegisterSchema(schemaName);
  await _dropTables();

  const schemaInstance = getSchemaInstance(schemaName);
  const authorModel = new AuthorModel(schemaInstance);
  const postModel = new PostModel(schemaInstance);

  const authorIdsRecord = await authorModel.insert(authorDataset);
  const authorIds = Object.values(authorIdsRecord);

  const postsDataset: Partial<Post>[] = [
    { authorId: authorIds[0] },
    { authorId: orphanAuthorId },
    { authorId: null },
  ];

  const postIdsRecord = await postModel.insert(postsDataset);
  const postIds = Object.values(postIdsRecord);

  return { authorIds, postIds };
}

async function _dropTables() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(postTableName).delete();
    await schema.instance().table(authorTableName).delete();
  }
}

async function getsRowWithResolvedForeignReference() {
  const { postIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), {
    id: postIds[0],
    locale,
  });
  expect(response.status).to.equal(200);
  const post = (await response.json()) as PostListed;
  expect(post.authorId).to.not.equal(null);
  expect(post.authorId?.name).to.equal("Alice Carter");
}

async function getsRowWithNullForeignReference() {
  const { postIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), {
    id: postIds[2],
    locale,
  });
  expect(response.status).to.equal(200);
  const post = (await response.json()) as PostListed;
  expect(post.authorId).to.equal(null);
}

async function getsRowWithDanglingForeignReference() {
  const { postIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), {
    id: postIds[1],
    locale,
  });
  expect(response.status).to.equal(200);
  const post = (await response.json()) as PostListed;
  expect(post.authorId).to.equal(null);
}

async function listsRowsContainingNullForeignReferences() {
  await _createDataController(getFunctionName());

  const response = await listRequest(getFunctionName(), { locale });
  expect(response.status).to.equal(200);
  const data = (await response.json()) as { results: PostListed[] };
  expect(data.results).to.have.lengthOf(3);

  const nullAuthorPosts = data.results.filter((post) => post.authorId == null);
  expect(nullAuthorPosts).to.have.lengthOf(2);
}
