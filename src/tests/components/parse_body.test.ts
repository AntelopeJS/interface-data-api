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

class Money {
  amount = 1;
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
  it("refuses a body nested deeper than the call stack allows that ends in a function", () => {
    const deepest = Object.create(null);
    deepest.run = () => 1;
    let nested: FieldValues = deepest;
    for (let level = 0; level < 50000; level++) nested = { next: nested };
    expect(statusOfRefusal(nested)).to.equal(400);
  });
  it("accepts a body without a prototype", () => {
    const bare = Object.create(null);
    bare.name = "a";
    expect(Validation.ParseBody(bare)).to.equal(bare);
  });
  it("refuses a parsed body holding what JSON cannot", () => {
    const withFunction = Object.create(null);
    withFunction.run = () => 1;
    const withInstance = Object.create(null);
    withInstance.price = new Money();
    const withBigInt = Object.create(null);
    withBigInt.count = 1n;
    const withUndefined = Object.create(null);
    withUndefined.list = [1, undefined];
    const cyclic: FieldValues = {};
    cyclic.self = cyclic;
    expect(
      [withFunction, withInstance, withBigInt, withUndefined, cyclic].map(
        statusOfRefusal,
      ),
    ).to.eql([400, 400, 400, 400, 400]);
  });
});
