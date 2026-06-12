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
  Computed,
  DataAPIMeta,
  Filter,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Schema, type ValueProxy } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Index,
  Model,
  RegisterSchema,
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
const groupTableName = `groups-${currentTestName}`;
const deviceTableName = `devices-${currentTestName}`;
const schemaName = "default";

@RegisterTable(groupTableName, schemaName)
class Group extends Table {
  declare _id: string;
  declare name: string;
}
class GroupModel extends BasicDataModel(Group, groupTableName) {}

@RegisterTable(deviceTableName, schemaName)
class Device extends Table {
  declare _id: string;
  @Index()
  declare group_id: string;
  declare label: string;
}
class DeviceModel extends BasicDataModel(Device, deviceTableName) {}

interface GroupListed {
  _id: string;
  name: string;
  devices_count: number;
  display_name: string;
}

interface ListResponse {
  results: GroupListed[];
  total: number;
  offset: number;
  limit: number;
}

const groupsDataset: Partial<Group>[] = [
  { name: "Alpha" },
  { name: "Beta" },
  { name: "Gamma" },
];

describe("Field Computed", () => {
  it("stores computed metadata with forced read-only and non-indexed sort", async () =>
    await storesComputedMetadata());
  it("lists rows with computed values", async () =>
    await listsRowsWithComputedValues());
  it("gets row with computed values", async () =>
    await getsRowWithComputedValues());
  it("sorts by computed aggregate ascending", async () =>
    await sortsByComputedAggregateAscending());
  it("sorts by computed aggregate descending", async () =>
    await sortsByComputedAggregateDescending());
  it("paginates in-DB while sorting by computed aggregate", async () =>
    await paginatesWhileSortingByComputedAggregate());
  it("filters by computed aggregate", async () =>
    await filtersByComputedAggregate());
  it("ignores computed fields on edit body", async () =>
    await ignoresComputedFieldsOnEdit());
});

async function _createDataController(testName: string) {
  @RegisterDataController()
  class _ComputedTestAPI extends DataController(
    Group,
    {
      list: DefaultRoutes.List,
      get: DefaultRoutes.Get,
      edit: DefaultRoutes.Edit,
    },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(GroupModel)
    declare groupModel: GroupModel;

    @Listable()
    @Access(AccessMode.ReadOnly)
    declare _id: string;

    @Listable()
    @Access(AccessMode.ReadWrite)
    @Sortable({ noIndex: true })
    declare name: string;

    @Listable()
    @Computed(
      (row, db) =>
        db.table(deviceTableName).getAll(row.key("_id"), "group_id").count(),
      { default: 0 },
    )
    @Sortable()
    @Filter((_context, proxy, _key, value) =>
      (proxy as ValueProxy<number>).eq(parseFloat(value)),
    )
    declare devices_count: number;

    @Listable()
    @Computed((row) => (row.key("name") as ValueProxy<string>).concat("!"))
    declare display_name: string;
  }

  await RegisterSchema(schemaName);
  await _dropTables();

  const schemaInstance = getSchemaInstance(schemaName);
  const groupModel = new GroupModel(schemaInstance);
  const deviceModel = new DeviceModel(schemaInstance);

  const groupIdsRecord = await groupModel.insert(groupsDataset);
  const groupIds = Object.values(groupIdsRecord);

  const devicesDataset: Partial<Device>[] = [
    { group_id: groupIds[0], label: "alpha-1" },
    { group_id: groupIds[0], label: "alpha-2" },
    { group_id: groupIds[0], label: "alpha-3" },
    { group_id: groupIds[1], label: "beta-1" },
  ];
  await deviceModel.insert(devicesDataset);

  return { groupIds, groupModel, deviceModel, controller: _ComputedTestAPI };
}

async function _dropTables() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(deviceTableName).delete();
    await schema.instance().table(groupTableName).delete();
  }
}

async function _listGroups(
  testName: string,
  queryParams?: Record<string, string>,
): Promise<ListResponse> {
  const response = await listRequest(testName, queryParams);
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`list failed (${response.status}): ${text}`);
  }
  return (await response.json()) as ListResponse;
}

async function storesComputedMetadata() {
  const { controller } = await _createDataController(getFunctionName());

  const meta = GetMetadata(controller, DataAPIMeta, true);
  const field = meta.fields.devices_count;
  expect(field.computed).to.not.equal(undefined);
  expect(field.computed?.default).to.equal(0);
  expect(field.mode).to.equal(AccessMode.ReadOnly);
  expect(field.sortable).to.deep.equal({ indexed: false });

  meta.setSortable("devices_count", true);
  expect(meta.fields.devices_count.sortable).to.deep.equal({ indexed: false });

  expect(meta.fields.display_name.computed).to.not.equal(undefined);
  expect(meta.fields.display_name.mode).to.equal(AccessMode.ReadOnly);
}

async function listsRowsWithComputedValues() {
  await _createDataController(getFunctionName());

  const data = await _listGroups(getFunctionName());
  expect(data.results).to.have.lengthOf(3);

  const byName = Object.fromEntries(data.results.map((g) => [g.name, g]));
  expect(byName.Alpha.devices_count).to.equal(3);
  expect(byName.Beta.devices_count).to.equal(1);
  expect(byName.Gamma.devices_count).to.equal(0);
  expect(byName.Alpha.display_name).to.equal("Alpha!");
  expect(byName.Gamma.display_name).to.equal("Gamma!");
}

async function getsRowWithComputedValues() {
  const { groupIds } = await _createDataController(getFunctionName());

  const response = await getRequest(getFunctionName(), { id: groupIds[0] });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`get failed (${response.status}): ${text}`);
  }
  const group = (await response.json()) as GroupListed;
  expect(group.name).to.equal("Alpha");
  expect(group.devices_count).to.equal(3);
  expect(group.display_name).to.equal("Alpha!");
}

async function sortsByComputedAggregateAscending() {
  await _createDataController(getFunctionName());

  const data = await _listGroups(getFunctionName(), {
    sortKey: "devices_count",
    sortDirection: "asc",
  });
  expect(data.results.map((g) => g.name)).to.deep.equal([
    "Gamma",
    "Beta",
    "Alpha",
  ]);
}

async function sortsByComputedAggregateDescending() {
  await _createDataController(getFunctionName());

  const data = await _listGroups(getFunctionName(), {
    sortKey: "devices_count",
    sortDirection: "desc",
  });
  expect(data.results.map((g) => g.name)).to.deep.equal([
    "Alpha",
    "Beta",
    "Gamma",
  ]);
}

async function paginatesWhileSortingByComputedAggregate() {
  await _createDataController(getFunctionName());

  const page1 = await _listGroups(getFunctionName(), {
    sortKey: "devices_count",
    sortDirection: "asc",
    limit: "2",
    offset: "0",
  });
  expect(page1.results.map((g) => g.name)).to.deep.equal(["Gamma", "Beta"]);
  expect(page1.total).to.equal(3);

  const page2 = await _listGroups(getFunctionName(), {
    sortKey: "devices_count",
    sortDirection: "asc",
    limit: "2",
    offset: "2",
  });
  expect(page2.results.map((g) => g.name)).to.deep.equal(["Alpha"]);
  expect(page2.total).to.equal(3);
}

async function filtersByComputedAggregate() {
  await _createDataController(getFunctionName());

  const data = await _listGroups(getFunctionName(), {
    filter_devices_count: "eq:0",
  });
  expect(data.results.map((g) => g.name)).to.deep.equal(["Gamma"]);
  expect(data.total).to.equal(1);
}

async function ignoresComputedFieldsOnEdit() {
  const { groupIds, groupModel } = await _createDataController(
    getFunctionName(),
  );

  const editPayload = {
    name: "Alpha Prime",
    devices_count: 999,
    display_name: "Forged Name",
  };
  const response = await editRequest(getFunctionName(), editPayload, {
    id: groupIds[0],
  });
  expect(response.status).to.equal(200);

  const updatedGroup = (await groupModel.get(groupIds[0])) as unknown as
    | Record<string, unknown>
    | undefined;
  expect(updatedGroup?.name).to.equal("Alpha Prime");
  expect(updatedGroup?.devices_count).to.equal(undefined);
  expect(updatedGroup?.display_name).to.equal(undefined);
}
