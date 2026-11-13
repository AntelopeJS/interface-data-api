/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";

import type { DataControllerInstance } from "./controller-types";
import type { StoredRow } from "./field-types";
import { isClass, isObject } from "./guards";

/**
 * The field `name` of a controller, as `@ModifierKey` and `@ModelReference`
 * name it: read as a property of the controller itself, so an own field, an
 * injected parameter and an inherited accessor all answer, and a field the
 * controller lacks answers `undefined`. It comes as the one argument a keyed
 * modifier takes.
 */
export function controllerField(
  controller: DataControllerInstance,
  name: string,
): [value: unknown] {
  if (!isObject(controller)) {
    throw new TypeError("A data controller must be an object.");
  }
  // SAFETY: the controller is an object (checked above), so reading any string key is an ordinary property read that runs inherited accessors and answers undefined for a missing field; the assertion types the runtime name a decorator recorded as keyof object, which is never, only so TypeScript lets the controller be indexed; the never-typed value is widened to unknown by this function's declared return type, which Query.GetModel parses with isModelInstance and the keyed modifiers take as the [key: unknown] they declare.
  return [controller[name as keyof DataControllerInstance]];
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
