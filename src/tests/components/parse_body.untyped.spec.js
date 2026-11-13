import { expect } from "chai";
import { HTTPResult } from "@antelopejs/interface-api";

import { Validation } from "../../components";

/**
 * The HTTP status `Validation.ParseBody` refuses `body` with, or 200 when it
 * accepts it.
 *
 * @param {unknown} body A value outside the body types the route declares.
 */
function statusOfRefusal(body) {
  try {
    Validation.ParseBody(body);
  } catch (error) {
    return error instanceof HTTPResult ? error.getStatus() : undefined;
  }
  return 200;
}

class Money {
  amount = 1;
}

describe("Validation.ParseBody on a parsed body its types forbid", () => {
  it("refuses a body nested deeper than the call stack allows that ends in a function", () => {
    const deepest = { __proto__: null, run: () => 1 };
    let nested = { next: deepest };
    for (let depth = 1; depth < 50000; depth += 1) {
      nested = { next: nested };
    }
    expect(statusOfRefusal(nested)).to.equal(400);
  });
  it("refuses a parsed body holding what JSON cannot", () => {
    expect([
      statusOfRefusal({ __proto__: null, run: () => 1 }),
      statusOfRefusal({ __proto__: null, price: new Money() }),
      statusOfRefusal({ __proto__: null, count: 1n }),
      statusOfRefusal({ __proto__: null, list: [1, undefined] }),
    ]).to.eql([400, 400, 400, 400]);
  });
});
