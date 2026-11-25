import { expect } from "chai";
import { DataAPIMeta, isDataAPIMeta } from "../metadata";

describe("isDataAPIMeta", () => {
  it("accepts a DataAPIMeta", () => {
    expect(isDataAPIMeta(new DataAPIMeta(Object))).to.equal(true);
  });

  it("refuses an object that only holds a fields record", () => {
    expect(isDataAPIMeta({ fields: {} })).to.equal(false);
  });

  it("refuses a DataAPIMeta whose modifierKeys is not a Map", () => {
    const meta = new DataAPIMeta(Object);
    const { modifierKeys: _kept, ...rest } = meta;
    const lookalike = { ...rest, inherit: () => undefined, modifierKeys: {} };
    expect(isDataAPIMeta(lookalike)).to.equal(false);
  });

  it("refuses non-objects", () => {
    expect(isDataAPIMeta(null)).to.equal(false);
    expect(isDataAPIMeta("meta")).to.equal(false);
  });
});
