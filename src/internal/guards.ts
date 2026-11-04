/** @internal @packageDocumentation */

import type { Class } from "@antelopejs/interface-core/decorators";
import type {
  WriteDocument,
  WriteValue,
} from "@antelopejs/interface-database/common";

import type { FieldValue, FieldValues, RowFields } from "./field-types";

/** Whether a value is a string. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether `typeof` calls a value an object and it is not `null`: arrays qualify, functions do not (the predicate `object` still types a function as one). */
export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Whether a value is a function, whatever its parameters. */
export function isFunction(value: unknown): value is Function {
  return typeof value === "function";
}

/**
 * Whether a value is a class: a function with an object `prototype`, which
 * arrow functions, methods and bound functions lack. A generator function
 * has one too, a language limit this check shares with every `prototype`
 * test.
 */
export function isClass(value: unknown): value is Class<object> {
  return isFunction(value) && isObject(value.prototype);
}

/** Whether a value is a number. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** Whether a value is a boolean. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** A step of the walk in {@link isFieldValue}: enter a value, or leave a container. */
interface WalkStep {
  value: unknown;
  leaving: boolean;
}

/**
 * Whether a value is a {@link FieldValue}: JSON or `Date` all the way down,
 * with no cycle. The walk keeps its own stack, so a deeply nested body is
 * not bounded by the call stack.
 */
export function isFieldValue(value: unknown): value is FieldValue {
  const ancestors = new Set<unknown>();
  const steps: WalkStep[] = [{ value, leaving: false }];
  for (let step = steps.pop(); step; step = steps.pop()) {
    if (step.leaving) {
      ancestors.delete(step.value);
      continue;
    }
    const current = step.value;
    if (current === null || isString(current) || isNumber(current)) continue;
    if (isBoolean(current) || current instanceof Date) continue;
    if (!isObject(current) || ancestors.has(current)) return false;
    const isArray = Array.isArray(current);
    const prototype: unknown = Object.getPrototypeOf(current);
    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    ancestors.add(current);
    steps.push({ value: current, leaving: true });
    for (const member of Object.values(current)) {
      if (member === undefined && isArray) return false;
      if (member !== undefined) steps.push({ value: member, leaving: false });
    }
  }
  return true;
}

/** Whether a value is {@link FieldValues}: a plain object holding field values. */
export function isFieldValues(value: unknown): value is FieldValues {
  return (
    isFieldValue(value) &&
    isObject(value) &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/** The `typeof` answers of the primitives a {@link WriteValue} may be. */
const STORED_PRIMITIVES = new Set(["string", "number", "boolean", "undefined"]);

/**
 * Whether a value is a {@link WriteValue}: `null`, text, a number, a boolean,
 * `undefined`, or an object whose own enumerable values are write values, all
 * the way down. A `bigint`, a `symbol` or a function anywhere fails. An object
 * is read by its own values whatever its prototype, as the type reads it, and
 * an object met again, as in a cycle, is read once.
 */
export function isWriteValue(value: unknown): value is WriteValue {
  const seen = new Set<object>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || STORED_PRIMITIVES.has(typeof current)) continue;
    if (!isObject(current)) return false;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const member of Object.values(current)) pending.push(member);
  }
  return true;
}

/** Whether every own field of a row holds a {@link WriteValue}. */
export function isWriteDocument(row: RowFields): row is WriteDocument {
  return Object.values(row).every(isWriteValue);
}
