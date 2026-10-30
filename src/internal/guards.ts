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
