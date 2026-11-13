import { expect } from "chai";
import { HTTPResult } from "@antelopejs/interface-api";
import {
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

import { Query, Validation } from "../../components";
import { AccessMode, DataAPIMeta, type StoredRow } from "../../metadata";

async function statusOf(run: () => Promise<StoredRow> | void) {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof HTTPResult)) throw error;
    return error.getStatus();
  }
  return 200;
}

function metaOf(target: DataAPIMeta["target"]) {
  const meta = new DataAPIMeta(target);
  meta.tableClass = class TableRow {};
  meta.schemaName = "default";
  return meta;
}

class Tally {
  get total() {
    return 1n;
  }

  get label() {
    return "tally";
  }
}

class Stamped {
  stamp = () => "now";
}

class Hooked {
  onSave = () => "saved";
  title = "draft";
}

class Counted {
  declare table: { count?: bigint };

  set count(value: number) {
    this.table.count = BigInt(value);
  }
}

@RegisterTable("stored-row-owners", "default")
class Owner extends Table {
  name = "ada";
  count = 1n;
}

describe("A row value no database stores", () => {
  before(() => RegisterSchema("default"));

  it("refuses a getter that returns a bigint on read", async () => {
    const meta = metaOf(Tally);
    meta
      .setDescriptor(
        "total",
        Object.getOwnPropertyDescriptor(Tally.prototype, "total"),
      )
      .setMode("total", AccessMode.ReadOnly);

    expect(
      await statusOf(() => Query.ReadProperties(new Tally(), meta, {})),
    ).to.equal(500);
  });

  it("reads a getter that returns text", async () => {
    const meta = metaOf(Tally);
    meta
      .setDescriptor(
        "label",
        Object.getOwnPropertyDescriptor(Tally.prototype, "label"),
      )
      .setMode("label", AccessMode.ReadOnly);

    expect(await Query.ReadProperties(new Tally(), meta, {})).to.eql({
      label: "tally",
    });
  });

  it("refuses a field default that is a function on write", async () => {
    const meta = metaOf(Stamped);
    meta.setMode("stamp", AccessMode.ReadOnly);

    expect(
      await statusOf(() => Query.WriteProperties(new Stamped(), meta, {})),
    ).to.equal(500);
  });

  it("writes a field default beside a member default that is a function", async () => {
    const meta = metaOf(Hooked);
    meta.setMode("title", AccessMode.ReadOnly);

    expect(await Query.WriteProperties(new Hooked(), meta, {})).to.eql({
      title: "draft",
    });
  });

  it("refuses a setter that writes a bigint into the row", async () => {
    const meta = metaOf(Counted);
    meta
      .setDescriptor(
        "count",
        Object.getOwnPropertyDescriptor(Counted.prototype, "count"),
      )
      .setMode("count", AccessMode.WriteOnly);

    expect(
      await statusOf(() =>
        Query.WriteProperties(new Counted(), meta, { count: 2 }),
      ),
    ).to.equal(500);
  });

  it("refuses a related row that holds a bigint", async () => {
    const meta = metaOf(Stamped);
    meta.setForeign("owner", "stored-row-owners");

    expect(
      await statusOf(() =>
        Validation.ClearInternal(meta, { owner: new Owner() }),
      ),
    ).to.equal(500);
  });

  it("refuses a plucked related row that holds a bigint", async () => {
    const meta = metaOf(Stamped);
    meta.setForeign("owner", "stored-row-owners", undefined, undefined, [
      "name",
      "count",
    ]);

    expect(
      await statusOf(() =>
        Validation.ClearInternal(meta, { owner: new Owner() }),
      ),
    ).to.equal(500);
  });

  it("keeps a related row that holds stored values", () => {
    const meta = metaOf(Stamped);
    meta.setForeign("owner", "stored-row-owners");
    const row: StoredRow = { owner: { name: "ada" } };

    Validation.ClearInternal(meta, row);

    expect(row).to.eql({ owner: { name: "ada" } });
  });
});
