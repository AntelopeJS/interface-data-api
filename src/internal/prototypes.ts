/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";

import type { DataControllerInstance } from "./controller-types";
import type { StoredRow } from "./field-types";
import { isClass, isObject } from "./guards";

/**
 * A controller read by field name, as `@ModifierKey` and `@ModelReference`
 * name its fields: an own field, an injected parameter or an inherited
 * accessor, whatever the controller class declares there.
 */
interface ControllerFields {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a controller field named at runtime by a decorator holds whatever the controller class declares there (an injected parameter, a model, an inherited accessor's result), and each reader parses it before use
  [field: string]: unknown;
}

/**
 * A controller instance read by field name: an object answers every string key,
 * with `undefined` for a field it lacks, and inherited accessors run on the
 * instance, because this is the instance itself.
 */
export function fieldsOf(instance: DataControllerInstance): ControllerFields {
  if (!holdsFields(instance)) {
    throw new TypeError("A data controller must be an object.");
  }
  return instance;
}

function holdsFields(
  instance: DataControllerInstance,
): instance is ControllerFields {
  return isObject(instance);
}

/**
 * Makes `fields` the `this` the getters and setters of `target` run on: it
 * holds the fields a route reads or writes, and inherits a copy of the
 * controller's own fields, which inherits the prototype of `target`.
 */
export function controllerReceiver(
  controller: DataControllerInstance,
  target: Class,
  fields: StoredRow,
) {
  const controllerFields = { ...controller };
  Object.setPrototypeOf(controllerFields, prototypeOf(target));
  Object.setPrototypeOf(fields, controllerFields);
  return fields;
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
