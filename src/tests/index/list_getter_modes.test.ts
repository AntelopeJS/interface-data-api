import { expect } from "chai";
import { z } from "zod";
import { Controller } from "@antelopejs/interface-api";
import { Access, AccessMode, Listable, ModelReference } from "../../metadata";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { listResponseSchema, readJson } from "../internal/http";
import { getSchemaInstance, request } from "../utils";

const TABLE = "list-getter-modes-people";
const SCHEMA = "default";
const LOCATION = "list-getter-modes";
let fullNameReads = 0;

@RegisterTable(TABLE, SCHEMA)
class Person extends Table {
  @Field("string")
  declare name: string;
  @Field("string")
  declare email: string;
}
class PersonModel extends BasicDataModel(Person, TABLE) {}

@RegisterDataController()
class _PersonAPI extends DataController(
  Person,
  {
    list: DefaultRoutes.List,
    detailed: DefaultRoutes.WithOptions(DefaultRoutes.List, {
      pluckMode: "detailed",
    }),
    everything: DefaultRoutes.WithOptions(DefaultRoutes.List, {
      pluckMode: "detailed",
      noPluck: true,
    }),
  },
  Controller(`/${LOCATION}`),
) {
  @ModelReference()
  @Model(PersonModel)
  declare model: PersonModel;

  @Listable()
  @Listable(true, "detailed")
  @Access(AccessMode.ReadOnly)
  declare name: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare email: string;

  @Listable(["name", "email"])
  @Access(AccessMode.ReadOnly)
  get fullName(): string {
    fullNameReads++;
    return `${this.name} <${this.email}>`;
  }

  @Listable([])
  @Access(AccessMode.ReadOnly)
  get kind(): string {
    return "person";
  }

  @Listable(["name"], "detailed")
  @Access(AccessMode.ReadOnly)
  get initial(): string {
    return this.name.charAt(0);
  }
}

async function listRows(uri: string) {
  const response = await request(LOCATION, uri, "GET");
  expect(response.status).to.equal(200);
  const body = await readJson(listResponseSchema(z.looseObject({})), response);
  return body.results;
}

describe("List getters per pluck mode", () => {
  before(async () => {
    await RegisterSchema(SCHEMA);
    await new PersonModel(getSchemaInstance(SCHEMA)).insert({
      name: "Alice",
      email: "alice@example.com",
    });
  });
  beforeEach(() => {
    fullNameReads = 0;
  });

  it("evaluates a getter in the mode that lists it", async () => {
    const rows = await listRows("list");
    expect(rows).to.deep.equal([
      {
        name: "Alice",
        email: "alice@example.com",
        fullName: "Alice <alice@example.com>",
        kind: "person",
      },
    ]);
    expect(fullNameReads).to.equal(1);
  });

  it("leaves out a getter the route's mode does not list", async () => {
    const rows = await listRows("detailed");
    expect(rows).to.deep.equal([{ name: "Alice", initial: "A" }]);
    expect(fullNameReads).to.equal(0);
  });

  it("evaluates every getter on a route that does not pluck", async () => {
    const [row] = await listRows("everything");
    expect(row).to.include({
      fullName: "Alice <alice@example.com>",
      kind: "person",
      initial: "A",
    });
  });
});
