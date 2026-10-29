/** @internal @packageDocumentation */

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
