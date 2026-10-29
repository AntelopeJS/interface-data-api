/** @internal @packageDocumentation */

/** Whether a value is a string. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether a value is an object other than `null`; arrays and functions are objects too. */
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
