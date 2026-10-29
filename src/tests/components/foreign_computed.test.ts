import path from "node:path";
import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import { Schema } from "@antelopejs/interface-database";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import {
  Access,
  AccessMode,
  Computed,
  Filter,
  Foreign,
  Listable,
  ModelReference,
} from "../../metadata";
import {
  BasicDataModel,
  Field,
  Index,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { readJson } from "../internal/http";
import {
  getFunctionName,
  getRequest,
  getSchemaInstance,
  request,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const teamTableName = `teams-${currentTestName}`;
const memberTableName = `members-${currentTestName}`;
const schemaName = "default";

@RegisterTable(teamTableName, schemaName)
class Team extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;
}
class TeamModel extends BasicDataModel(Team, teamTableName) {}

@RegisterTable(memberTableName, schemaName)
class Member extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare team: string;

  @Field("string")
  declare label: string;

  @Field("number")
  declare age: number;
}
class MemberModel extends BasicDataModel(Member, memberTableName) {}

interface MemberListed {
  _id: string;
  label: string;
  team: { _id: string; name: string };
  teammates: number;
}

interface ListResponse {
  results: MemberListed[];
  total: number;
}

describe("Foreign and Computed fields on the same key", () => {
  it("lists the computed value read from the key and the resolved relation", async () =>
    await expectListsComputedFromForeignKey());
  it("gets the computed value read from the key and the resolved relation", async () =>
    await expectGetsComputedFromForeignKey());
  it("combines several filters on one field with AND", async () =>
    await expectCombinesFiltersOnOneField());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _ForeignComputedAPI extends DataController(
    Member,
    { list: DefaultRoutes.List, get: DefaultRoutes.Get },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(MemberModel)
    declare memberModel: MemberModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    @Filter()
    declare label: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    @Filter((_context, proxy, _key, value, mode) =>
      proxy[mode](parseFloat(value)),
    )
    declare age: number;

    @Listable()
    @Foreign(teamTableName, undefined, false, ["_id", "name"])
    @Access(AccessMode.ReadWrite)
    declare team: string;

    @Listable()
    @Computed(
      (row, db) =>
        db.table(memberTableName).getAll(row.key("team"), "team").count(),
      { default: 0 },
    )
    declare teammates: number;
  }

  await RegisterSchema(schemaName);
  await _dropTables();

  const schemaInstance = getSchemaInstance(schemaName);
  const teamIds = Object.values(
    await new TeamModel(schemaInstance).insert([
      { name: "Red" },
      { name: "Blue" },
    ]),
  );
  const memberIds = Object.values(
    await new MemberModel(schemaInstance).insert([
      { team: teamIds[0], label: "red-1", age: 17 },
      { team: teamIds[0], label: "red-2", age: 30 },
      { team: teamIds[0], label: "red-3", age: 70 },
      { team: teamIds[1], label: "blue-1", age: 40 },
    ]),
  );
  return { teamIds, memberIds };
}

async function _dropTables() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(memberTableName).delete();
    await schema.instance().table(teamTableName).delete();
  }
}

async function _list(
  testName: string,
  query: [string, string][],
): Promise<ListResponse> {
  const response = await request(testName, "list", "GET", undefined, query);
  expect(response.status, await response.clone().text()).to.equal(200);
  return await readJson<ListResponse>(response);
}

async function expectListsComputedFromForeignKey() {
  const { teamIds } = await _createDataController(getFunctionName());

  const data = await _list(getFunctionName(), [["limit", "10"]]);
  const byLabel = Object.fromEntries(data.results.map((m) => [m.label, m]));
  expect(byLabel["red-1"].teammates).to.equal(3);
  expect(byLabel["blue-1"].teammates).to.equal(1);
  expect(byLabel["red-1"].team).to.deep.equal({ _id: teamIds[0], name: "Red" });
  expect(byLabel["blue-1"].team).to.deep.equal({
    _id: teamIds[1],
    name: "Blue",
  });
}

async function expectGetsComputedFromForeignKey() {
  const { teamIds, memberIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), { id: memberIds[3] });
  expect(response.status).to.equal(200);
  const member = await readJson<MemberListed>(response);
  expect(member.teammates).to.equal(1);
  expect(member.team).to.deep.equal({ _id: teamIds[1], name: "Blue" });
}

async function expectCombinesFiltersOnOneField() {
  await _createDataController(getFunctionName());

  const range = await _list(getFunctionName(), [
    ["filter_age", "ge:18"],
    ["filter_age", "lt:65"],
  ]);
  expect(range.results.map((m) => m.label).sort()).to.deep.equal([
    "blue-1",
    "red-2",
  ]);
  expect(range.total).to.equal(2);

  const disjoint = await _list(getFunctionName(), [
    ["filter_label", "red-1"],
    ["filter_label", "red-2"],
  ]);
  expect(disjoint.results).to.deep.equal([]);
  expect(disjoint.total).to.equal(0);
}
