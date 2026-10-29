/** @internal @packageDocumentation */

import type { FieldValue, FieldValues } from "./field-types";

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

/** Whether a value is a number. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** Whether a value is a boolean. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFieldValueWithin(
  value: unknown,
  ancestors: Set<unknown>,
): value is FieldValue {
  if (value === null || isString(value) || isNumber(value)) return true;
  if (isBoolean(value) || value instanceof Date) return true;
  if (!isObject(value) || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  ancestors.add(value);
  const holds = Object.values(value).every((member) =>
    member === undefined ? !isArray : isFieldValueWithin(member, ancestors),
  );
  ancestors.delete(value);
  return holds;
}

/** Whether a value is a {@link FieldValue}: JSON or `Date` all the way down. */
export function isFieldValue(value: unknown): value is FieldValue {
  return isFieldValueWithin(value, new Set());
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
