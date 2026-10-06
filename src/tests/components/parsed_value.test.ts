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
  Access,
  AccessMode,
  type FieldValidationResult,
  ModelReference,
  Validator,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import {
  editRequest,
  getFunctionName,
  getSchemaInstance,
  newRequest,
} from "../utils";

const currentTestName = path
  .basename(__filename)
  .replace(/\.test\.(ts|js)$/, "");
const eventTableName = `events-${currentTestName}`;
const schemaName = "default";
const startsAt = "2026-01-15T09:30:00.000Z";
const editedStartsAt = "2026-02-20T14:00:00.000Z";

@RegisterTable(eventTableName, schemaName)
class Event extends Table {
  declare _id: string;

  @Field("string")
  declare name: string;

  @Field("date")
  declare startsAt: Date;

  @Field("string")
  declare code: string;
}
class EventModel extends BasicDataModel(Event, eventTableName) {}

function parseDate(value: unknown): FieldValidationResult {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return { success: false };
  }
  return { success: true, data: new Date(value) };
}

async function normalizeCode(value: unknown): Promise<FieldValidationResult> {
  if (typeof value !== "string") {
    return { success: false };
  }
  return { success: true, data: value.trim().toUpperCase() };
}

describe("Field Validator parsed value", () => {
  it("writes the parsed value on new", async () =>
    await writesParsedValueOnNew());
  it("writes the parsed value on edit", async () =>
    await writesParsedValueOnEdit());
  it("writes the value of an asynchronous parse", async () =>
    await writesAsyncParsedValue());
  it("rejects a failed parse with the invalid field message", async () =>
    await rejectsFailedParse());
});

async function _dropEventTable() {
  const schema = Schema.get(schemaName);
  if (schema) {
    await schema.instance().table(eventTableName).delete();
  }
}

async function _createDataController(testName: string, event?: Partial<Event>) {
  @RegisterDataController()
  class _ParsedValueTestAPI extends DataController(
    Event,
    { new: DefaultRoutes.New, edit: DefaultRoutes.Edit },
    Controller(`/${testName}`),
  ) {
    @ModelReference()
    @Model(EventModel)
    declare eventModel: EventModel;

    declare _id: string;

    @Access(AccessMode.ReadWrite)
    declare name: string;

    @Access(AccessMode.ReadWrite)
    @Validator(parseDate)
    declare startsAt: Date;

    @Access(AccessMode.ReadWrite)
    @Validator(normalizeCode)
    declare code: string;
  }
  await RegisterSchema(schemaName);
  await _dropEventTable();
  const eventModel = new EventModel(getSchemaInstance(schemaName));

  if (event) {
    const insertResult = await eventModel.insert(event);
    return { id: insertResult[0], eventModel };
  }
  return { eventModel };
}

async function writesParsedValueOnNew() {
  const { eventModel } = await _createDataController(getFunctionName());

  const response = await newRequest(getFunctionName(), {
    name: "Launch",
    startsAt,
  });
  expect(response.status).to.equal(200);
  const [id] = (await response.json()) as string[];

  const event = await eventModel.get(id);
  expect(event?.startsAt).to.be.instanceOf(Date);
  expect(event?.startsAt.toISOString()).to.equal(startsAt);
}

async function writesParsedValueOnEdit() {
  const { id, eventModel } = await _createDataController(getFunctionName(), {
    name: "Launch",
    startsAt: new Date(startsAt),
  });
  if (!id) throw new Error("Expected id from _createDataController");

  const response = await editRequest(
    getFunctionName(),
    { startsAt: editedStartsAt },
    { id },
  );
  expect(response.status).to.equal(200);

  const event = await eventModel.get(id);
  expect(event?.startsAt).to.be.instanceOf(Date);
  expect(event?.startsAt.toISOString()).to.equal(editedStartsAt);
}

async function writesAsyncParsedValue() {
  const { eventModel } = await _createDataController(getFunctionName());

  const response = await newRequest(getFunctionName(), {
    name: "Launch",
    code: "  launch-26 ",
  });
  expect(response.status).to.equal(200);
  const [id] = (await response.json()) as string[];

  const event = await eventModel.get(id);
  expect(event?.code).to.equal("LAUNCH-26");
}

async function rejectsFailedParse() {
  await _createDataController(getFunctionName());

  const response = await newRequest(getFunctionName(), {
    name: "Launch",
    startsAt: "not-a-date",
  });
  expect(response.status).to.equal(400);
  expect(await response.text()).to.include("Invalid field type(s): startsAt");
}
