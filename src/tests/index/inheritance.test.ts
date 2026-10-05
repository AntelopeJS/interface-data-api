import { expect } from "chai";
import { Controller } from "@antelopejs/interface-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
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
  Table,
} from "@antelopejs/interface-database-decorators";

import {
  deleteRequest,
  editRequest,
  getRequest,
  getSchemaInstance,
  listRequest,
  newRequest,
} from "../utils";

const NOTE_TABLE = "inheritance-notes";
const ARCHIVE_TABLE = "inheritance-archives";
const SCHEMA = "default";
const DERIVED_LOCATION = "inheritance-derived";
const OVERRIDE_LOCATION = "inheritance-override";
const OK = 200;
const NOT_FOUND = 404;

@RegisterTable(NOTE_TABLE, SCHEMA)
class Note extends Table {
  @Field("string")
  declare title: string;
}
class NoteModel extends BasicDataModel(Note, NOTE_TABLE) {}

@RegisterTable(ARCHIVE_TABLE, SCHEMA)
class Archive extends Table {
  @Field("string")
  declare title: string;
}
class ArchiveModel extends BasicDataModel(Archive, ARCHIVE_TABLE) {}

class NoteBaseAPI extends DataController(
  Note,
  {},
  Controller("/inheritance-base"),
) {
  @ModelReference()
  @Model(NoteModel)
  declare model: NoteModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare title: string;
}

@RegisterDataController()
class _DerivedNoteAPI extends DataController(
  Note,
  DefaultRoutes.All,
  Controller(`/${DERIVED_LOCATION}`, NoteBaseAPI),
) {}

@RegisterDataController()
class _ArchiveAPI extends DataController(
  Archive,
  { get: DefaultRoutes.Get },
  Controller(`/${OVERRIDE_LOCATION}`, NoteBaseAPI),
) {
  @ModelReference()
  @Model(ArchiveModel)
  declare archiveModel: ArchiveModel;
}

interface NoteListResponse {
  results: Partial<Note>[];
}

describe("Derived data controllers", () => {
  let noteModel: NoteModel;
  let archiveModel: ArchiveModel;
  before(async () => {
    await RegisterSchema(SCHEMA);
    noteModel = new NoteModel(getSchemaInstance(SCHEMA));
    archiveModel = new ArchiveModel(getSchemaInstance(SCHEMA));
  });

  it("inherits the parent model reference for get and list", async () => {
    const [id] = await noteModel.insert({ title: "Inherited" });

    const get = await getRequest(DERIVED_LOCATION, { id });
    expect(get.status).to.equal(OK);
    expect(await get.json()).to.deep.equal({ _id: id, title: "Inherited" });

    const list = await listRequest(DERIVED_LOCATION);
    expect(list.status).to.equal(OK);
    const { results } = (await list.json()) as NoteListResponse;
    expect(results).to.deep.include({ _id: id, title: "Inherited" });
  });

  it("inherits the parent model reference for new, edit and delete", async () => {
    const created = await newRequest(DERIVED_LOCATION, { title: "Created" });
    expect(created.status).to.equal(OK);
    const [id] = (await created.json()) as string[];
    expect(await noteModel.get(id)).to.have.property("title", "Created");

    const edited = await editRequest(
      DERIVED_LOCATION,
      { title: "Edited" },
      { id },
    );
    expect(edited.status).to.equal(OK);
    expect(await noteModel.get(id)).to.have.property("title", "Edited");

    const deleted = await deleteRequest(DERIVED_LOCATION, { id });
    expect(deleted.status).to.equal(OK);
    expect(await noteModel.get(id)).to.equal(undefined);
  });

  it("prefers the child's own model reference over the parent's", async () => {
    const [archiveId] = await archiveModel.insert({ title: "Archived" });
    const [noteId] = await noteModel.insert({ title: "Note" });

    const archive = await getRequest(OVERRIDE_LOCATION, { id: archiveId });
    expect(archive.status).to.equal(OK);
    expect(await archive.json()).to.deep.equal({
      _id: archiveId,
      title: "Archived",
    });

    const note = await getRequest(OVERRIDE_LOCATION, { id: noteId });
    expect(note.status).to.equal(NOT_FOUND);
  });
});
