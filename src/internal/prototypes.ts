/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";

import type { DataControllerInstance } from "./controller-types";
import type { RowFields } from "./field-types";
import { isClass, isObject } from "./guards";

/**
 * A controller instance read by field name: an object answers every string key,
 * with `undefined` for a field it lacks, and inherited accessors run on the
 * instance, because this is the instance itself.
 */
export function fieldsOf(instance: DataControllerInstance): RowFields {
  if (!holdsFields(instance)) {
    throw new TypeError("A data controller must be an object.");
  }
  return instance;
}

function holdsFields(instance: DataControllerInstance): instance is RowFields {
  return isObject(instance);
}

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
