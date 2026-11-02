import { expect } from "chai";
import { GetMetadata } from "@antelopejs/interface-core";
import { Access, AccessMode, DataAPIMeta } from "../../metadata";

const REFUSAL = "A field decorator applies to a class.";

describe("field decorators - target", () => {
  it("refuses a target whose constructor is an arrow function", () => {
    const target = { constructor: () => undefined };

    expect(() => Access(AccessMode.ReadOnly)(target, "title")).to.throw(
      TypeError,
      REFUSAL,
    );
  });

  it("declares the field on a target whose constructor is a class", () => {
    class Target {
      declare title: string;
    }

    Access(AccessMode.ReadOnly)(Target.prototype, "title");

    const { fields } = GetMetadata(Target, DataAPIMeta);
    expect(Object.hasOwn(fields, "title")).to.equal(true);
  });
});
