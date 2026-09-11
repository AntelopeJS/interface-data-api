import { Controller } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { expect } from "chai";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { getRequest, getSchemaInstance, request } from "../utils";

const TABLE = "get-guard-documents";
const SCHEMA = "default";
const LOCATION = "get-guard";
const NOT_FOUND = 404;
const FORBIDDEN = 403;
let calls = 0;
let transforms = 0;

@RegisterTable(TABLE, SCHEMA)
class Document extends Table {
  @Field("string")
  declare documentType: string;
  @Field("string")
  declare name: string;
}
class DocumentModel extends BasicDataModel(Document, TABLE) {}

const guarded = DefaultRoutes.WithGetGuard(
  async function (ctx, current, params) {
    await Promise.resolve();
    calls++;
    expect(this).to.be.instanceOf(DocumentAPI);
    expect(params.id).to.equal(ctx.url.searchParams.get("id"));
    assert(current.documentType === "invoice", NOT_FOUND, "Not Found");
    assert(!ctx.url.searchParams.has("deny"), FORBIDDEN, "Denied");
  },
);

@RegisterDataController()
class DocumentAPI extends DataController(
  Document,
  {
    get: guarded,
    plain: DefaultRoutes.Get,
  },
  Controller(`/${LOCATION}`),
) {
  @ModelReference()
  @Model(DocumentModel)
  declare model: DocumentModel;

  @Access(AccessMode.ReadOnly)
  get name() {
    transforms++;
    return this.table.name.toUpperCase();
  }
}

describe("Get loaded-model guard", () => {
  let invoiceId: string;
  let quoteId: string;
  before(async () => {
    await RegisterSchema(SCHEMA);
    const model = new DocumentModel(getSchemaInstance(SCHEMA));
    [invoiceId] = await model.insert({
      documentType: "invoice",
      name: "Invoice",
    });
    [quoteId] = await model.insert({ documentType: "quote", name: "Quote" });
  });
  beforeEach(() => {
    calls = 0;
    transforms = 0;
  });

  it("reads a non-readable field before transformation and preserves the response", async () => {
    const response = await getRequest(LOCATION, { id: invoiceId });
    expect(response.status).to.equal(200);
    const body = await response.json();
    expect(body).to.deep.equal({ name: "INVOICE" });
    expect(calls).to.equal(1);
    expect(transforms).to.equal(1);
    const plain = await request(LOCATION, "plain", "GET", undefined, {
      id: invoiceId,
    });
    expect(await plain.json()).to.deep.equal(body);
    expect(calls).to.equal(1);
  });

  it("awaits rejection before response transformations and preserves status", async () => {
    expect((await getRequest(LOCATION, { id: quoteId })).status).to.equal(
      NOT_FOUND,
    );
    expect(
      (await getRequest(LOCATION, { id: invoiceId, deny: "1" })).status,
    ).to.equal(FORBIDDEN);
    expect(calls).to.equal(2);
    expect(transforms).to.equal(0);
  });

  it("does not invoke the guard for missing rows", async () => {
    expect(
      (await getRequest(LOCATION, { id: "missing-document" })).status,
    ).to.equal(NOT_FOUND);
    expect(calls).to.equal(0);
    expect(transforms).to.equal(0);
  });
});
