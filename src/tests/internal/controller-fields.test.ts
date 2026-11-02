import assert from "node:assert";

import { fieldsOf } from "../../internal/prototypes";

class Holder {
  own = "own value";

  get inherited(): string {
    return `read from ${this.own}`;
  }
}

describe("fieldsOf", () => {
  it("answers own fields and inherited accessors by name", () => {
    const fields = fieldsOf(new Holder());

    assert.strictEqual(fields.own, "own value");
    assert.strictEqual(fields.inherited, "read from own value");
    assert.strictEqual(fields.absent, undefined);
  });

  it("refuses a value that is not an object", () => {
    assert.throws(
      () => fieldsOf(() => undefined),
      /A data controller must be an object/,
    );
  });
});
