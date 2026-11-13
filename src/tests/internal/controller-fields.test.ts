import assert from "node:assert";

import { controllerField } from "../../internal/prototypes";

class Holder {
  own = "own value";

  get inherited(): string {
    return `read from ${this.own}`;
  }
}

describe("controllerField", () => {
  it("answers own fields and inherited accessors by name", () => {
    const holder = new Holder();

    assert.deepStrictEqual(
      [
        controllerField(holder, "own"),
        controllerField(holder, "inherited"),
        controllerField(holder, "absent"),
      ],
      [["own value"], ["read from own value"], [undefined]],
    );
  });

  it("refuses a value that is not an object", () => {
    assert.throws(
      () => controllerField(() => undefined, "own"),
      /A data controller must be an object/,
    );
  });
});
