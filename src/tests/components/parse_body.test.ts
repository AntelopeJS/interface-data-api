import { expect } from "chai";
import { HTTPResult } from "@antelopejs/interface-api";

import { Validation } from "../../components";
import type { FieldValue, FieldValues } from "../../metadata";

function statusOfRefusal(body: Parameters<typeof Validation.ParseBody>[0]) {
  try {
    Validation.ParseBody(body);
  } catch (error) {
    return error instanceof HTTPResult ? error.getStatus() : undefined;
  }
  return 200;
}

function body(fields: FieldValue) {
  return Buffer.from(JSON.stringify(fields));
}

describe("Validation.ParseBody", () => {
  it("parses a JSON object", () =>
    expect(Validation.ParseBody(body({ name: "a", tags: [1, null] }))).to.eql({
      name: "a",
      tags: [1, null],
    }));
  it("hands back a body a route already parsed, with dates and undefined", () => {
    const stamped: FieldValues = {
      at: new Date(0),
      nested: { list: [new Date(1), "x"], gone: undefined },
    };
    expect(Validation.ParseBody(stamped)).to.equal(stamped);
  });
  it("refuses a body that is not a JSON object", () => {
    expect([
      statusOfRefusal(Buffer.from("{")),
      statusOfRefusal(body([1])),
      statusOfRefusal(Buffer.from("null")),
      statusOfRefusal(Buffer.from('"text"')),
    ]).to.eql([400, 400, 400, 400]);
  });
  it("accepts a body nested far deeper than the call stack allows", () => {
    const depth = 50000;
    const nested = `{"a":${"[".repeat(depth)}${"]".repeat(depth)}}`;
    expect(Object.keys(Validation.ParseBody(Buffer.from(nested)))).to.eql([
      "a",
    ]);
  });
  it("accepts a body without a prototype", () => {
    const bare: FieldValues = { __proto__: null, name: "a" };
    expect(Validation.ParseBody(bare)).to.equal(bare);
  });
  it("refuses a cyclic parsed body", () => {
    const cyclic: FieldValues = {};
    cyclic.self = cyclic;
    expect(statusOfRefusal(cyclic)).to.equal(400);
  });
});
