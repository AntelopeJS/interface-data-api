import { expect } from "chai";
import { GetMetadata } from "@antelopejs/interface-core";

import { DataAPIMeta } from "../../metadata";

class Base {}
class Child extends Base {}

describe("DataAPIMeta - target", () => {
  it("answers the controller class GetMetadata builds it for, through the prototype walk", () => {
    expect([
      GetMetadata(Child, DataAPIMeta).target,
      GetMetadata(Base, DataAPIMeta).target,
    ]).to.eql([Child, Base]);
  });

  it("refuses to answer a target for a prototype above the controller classes", () => {
    expect(() => new DataAPIMeta(Object.prototype).target).to.throw(
      TypeError,
      "No controller class.",
    );
  });
});
