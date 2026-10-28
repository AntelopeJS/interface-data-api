import { AsyncLocalStorage } from "node:async_hooks";
import { expect } from "chai";

import { getFunctionName } from "./utils";

type NameReader = typeof getFunctionName;

const WRAPPER_DEPTHS = [1, 2, 5, 20];

describe("Test utils", () => {
  it("returns the name of the calling function", () =>
    expectReturnsTheCallerName());
  it("skips frames added outside the tests folder", () =>
    expectSkipsFramesAddedOutsideTheTestsFolder());
});

function expectReturnsTheCallerName() {
  expect(getFunctionName()).to.equal("expectReturnsTheCallerName");
}

function nameSeenThroughAsyncContexts(depth: number) {
  const storage = new AsyncLocalStorage<number>();
  let read: NameReader = getFunctionName;
  for (let store = 0; store < depth; store++) {
    read = storage.run.bind<
      AsyncLocalStorage<number>,
      [store: number, callback: NameReader],
      [],
      ReturnType<NameReader>
    >(storage, store, read);
  }
  return read();
}

function expectSkipsFramesAddedOutsideTheTestsFolder() {
  for (const depth of WRAPPER_DEPTHS) {
    expect(nameSeenThroughAsyncContexts(depth)).to.equal(
      "nameSeenThroughAsyncContexts",
    );
  }
}
