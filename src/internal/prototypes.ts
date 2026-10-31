/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";

import type { DataControllerInstance } from "./controller-types";
import { isClass, isObject } from "./guards";

/** The object the instances of a class inherit from. */
export function prototypeOf(target: Class): object {
  const prototype: unknown = target.prototype;
  if (!isObject(prototype)) {
    throw new TypeError("A class prototype must be an object.");
  }
  return prototype;
}

/** The class an instance was built from, read from its prototype. */
export function classOf(instance: DataControllerInstance): Class<object> {
  const prototype: unknown = Object.getPrototypeOf(instance);
  if (!isObject(prototype) || !isClass(prototype.constructor)) {
    throw new TypeError("A data controller must be a class instance.");
  }
  return prototype.constructor;
}
