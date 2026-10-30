/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";

import { isObject } from "./guards";

/** The object the instances of a class inherit from. */
export function prototypeOf(target: Class): object {
  const prototype: unknown = target.prototype;
  if (!isObject(prototype)) {
    throw new TypeError("A class prototype must be an object.");
  }
  return prototype;
}
