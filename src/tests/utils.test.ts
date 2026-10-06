import { AsyncLocalStorage } from "node:async_hooks";
import { expect } from "chai";

import { getFunctionName } from "./utils";

type Callable = (...args: unknown[]) => unknown;

const WRAPPER_DEPTHS = [1, 2, 5, 20];

describe("Test utils", () => {
  it("returns the name of the calling function", () => returnsTheCallerName());
  it("skips frames added outside the tests folder", () =>
    skipsFramesAddedOutsideTheTestsFolder());
});

function returnsTheCallerName() {
  expect(getFunctionName()).to.equal("returnsTheCallerName");
}

function nameSeenThroughAsyncContexts(depth: number) {
  const storage = new AsyncLocalStorage<number>();
  const run = storage.run.bind(storage) as Callable;
  const nestedRuns = Array.from({ length: depth - 1 }, (_, store) => [
    run,
    store,
  ]).flat();
  return run(depth, ...nestedRuns, getFunctionName);
}

function skipsFramesAddedOutsideTheTestsFolder() {
  for (const depth of WRAPPER_DEPTHS) {
    expect(nameSeenThroughAsyncContexts(depth)).to.equal(
      "nameSeenThroughAsyncContexts",
    );
  }
}
