import path from "node:path";
import { expect } from "chai";
import type { RequestContext } from "@antelopejs/interface-api";
import { Controller } from "@antelopejs/interface-api";
import { Schema, type Stream } from "@antelopejs/interface-database";
import {
  Field,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import * as DataApi from "../../index";
import * as Components from "../../components";
import * as Metadata from "../../metadata";
import { CreateOtherInstance } from "../helpers/other-instance";

type ComponentsModule = typeof Components;
type MetadataModule = typeof Metadata;
type StagedSchemaModule =
  typeof import("@antelopejs/interface-database/schema");

const buildFolder = path.resolve(__dirname, "..", "..");
const packageFolder = (name: string) =>
  path.join(path.dirname(require.resolve(`${name}/package.json`)), "dist");
const databaseFolder = packageFolder("@antelopejs/interface-database");
const otherInstance = CreateOtherInstance([
  buildFolder,
  databaseFolder,
  packageFolder("@antelopejs/interface-database-decorators"),
]);
const OtherComponents = otherInstance(
  path.join(buildFolder, "components.js"),
) as ComponentsModule;
const OtherMetadata = otherInstance(
  path.join(buildFolder, "metadata.js"),
) as MetadataModule;
const OtherStagedSchema = otherInstance(
  path.join(databaseFolder, "staged-query", "schema.js"),
) as StagedSchemaModule;

const clientSchema = "cross-instance-client";
const coreSchema = "cross-instance-core";
const requestContext = { url: new URL("http://localhost/") } as RequestContext;

@RegisterTable("users", coreSchema)
class User extends Table {
  @Field("string")
  declare name: string;
}

@RegisterTable("customers", clientSchema)
class Customer extends Table {
  @Field("string")
  declare name: string;

  @Field("string")
  declare city: string;

  @Field("string")
  declare owner: string;

  @Field("string")
  declare ownerId: string;
}

@DataApi.RegisterDataController()
class CustomerAPI extends DataApi.DataController(
  Customer,
  {},
  Controller("/cross-instance-customers"),
) {
  @Metadata.Listable()
  @Metadata.Sortable()
  declare name: string;

  @Metadata.Listable()
  @Metadata.Filter()
  declare city: string;

  @Metadata.Listable()
  @Metadata.Foreign(User, "_id", false, ["name"])
  declare owner: string;

  @Metadata.Listable()
  declare ownerId: string;

  @Metadata.Listable()
  @Metadata.Joined({ table: User, localKey: "ownerId", remoteField: "name" })
  declare ownerName: string;
}

interface ListedCustomer {
  name: string;
  owner: { name: string } | null;
  ownerName: string | null;
}

describe("Data API across interface instances", () => {
  before(async () => {
    await RegisterSchema(coreSchema);
    await RegisterSchema(clientSchema);
    new OtherStagedSchema.Schema(coreSchema, {});
    await seed();
  });

  it(
    "GetDataControllerMeta from another instance reads the controller's metadata (dms and interface-dms read generated controllers)",
    OtherInstanceReadsMetaTest,
  );
  it(
    "Query.List and Foreign from another instance apply the filter, sort, foreign and joined fields of a controller declared through this one, resolving the other schema through the target class even when the listing instance holds a schema with the same id (dms search-route)",
    OtherInstanceListsTest,
  );
  it(
    "a cross-schema foreign target declared by name with no registered class fails at decoration, naming the field",
    UnregisteredCrossSchemaTargetTest,
  );
});

async function seed() {
  await User.table().delete();
  await Customer.table().delete();
  const [ada, bea] = await User.table().insert([
    { name: "Ada Owner" },
    { name: "Bea Owner" },
  ]);
  await Customer.table().insert([
    { name: "Ada", city: "Paris", owner: ada, ownerId: ada },
    { name: "Bea", city: "Paris", owner: bea, ownerId: bea },
    { name: "Cid", city: "Rome", owner: ada, ownerId: ada },
  ]);
}

function OtherInstanceReadsMetaTest() {
  const meta = OtherMetadata.GetDataControllerMeta(new CustomerAPI());
  expect(Object.keys(meta.filters)).to.deep.equal(["city"]);
  expect(meta.fields.name.sortable).to.not.equal(undefined);
  expect(meta.fields.owner.foreign?.[5]).to.equal(coreSchema);
  expect(meta.fields.ownerName.joined?.schemaName).to.equal(coreSchema);
}

async function OtherInstanceListsTest() {
  const controller = new CustomerAPI();
  const meta = OtherMetadata.GetDataControllerMeta(controller);
  const db = Schema.get(clientSchema)!.instance();
  const [sorted, total] = OtherComponents.Query.List(
    controller,
    meta,
    Customer.table(),
    requestContext,
    ["name", "desc"],
    { city: ["Paris", "eq"] },
    db,
  );
  const listed = OtherComponents.Query.Foreign(db, meta, sorted as Stream<any>);
  const rows = (await listed.run()) as ListedCustomer[];
  expect(await total.run()).to.equal(2);
  expect(
    rows.map(({ name, owner, ownerName }) => [name, owner?.name, ownerName]),
  ).to.deep.equal([
    ["Bea", "Bea Owner", "Bea Owner"],
    ["Ada", "Ada Owner", "Ada Owner"],
  ]);
}

function UnregisteredCrossSchemaTargetTest() {
  const declare = () => {
    class _BrokenAPI extends DataApi.DataController(
      Customer,
      {},
      Controller("/cross-instance-broken"),
    ) {
      @Metadata.Foreign("missing", "_id", false, undefined, coreSchema)
      declare missing: string;
    }
    return _BrokenAPI;
  };
  expect(declare).to.throw(
    /Table "missing" is not registered in schema "cross-instance-core" for foreign field "missing"/,
  );
}
