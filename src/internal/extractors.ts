/** @internal @packageDocumentation */

import type { RequestContext } from "@antelopejs/interface-api";

import type { DataAPIMeta } from "../metadata";

/**
 * Reads one field of a route's parameters from the request. `undefined` leaves
 * the field out. `key` is the field's name.
 */
export type ParameterExtractor<Value> = (
  reqCtx: RequestContext,
  meta: DataAPIMeta,
  key: string,
) => Value | undefined;

/** The extractors of a route's parameters, by field. */
export type ParameterExtractors<T> = {
  [K in keyof T]?: ParameterExtractor<T[K]>;
};

export function fromSearch<Value>(
  convert: (text: string) => Value,
): ParameterExtractor<Value> {
  return (reqCtx, _meta, key) => {
    const text = reqCtx.url.searchParams.get(key);
    return text === null ? undefined : convert(text);
  };
}

function allFromSearch<Value>(
  convert: (text: string) => Value,
): ParameterExtractor<Value[]> {
  return (reqCtx, _meta, key) =>
    reqCtx.url.searchParams.getAll(key).map((text) => convert(text));
}

const toNumber = (text: string) => parseFloat(text);
const toInt = (text: string) => parseInt(text, 10);
const toBool = (text: string) => text !== "0";
const toText = (text: string) => text;

/** Reads a field from the query string, under the field's name. */
export const FromSearch = {
  number: fromSearch(toNumber),
  int: fromSearch(toInt),
  bool: fromSearch(toBool),
  string: fromSearch(toText),
  /** Every value of the field, none when the request sends none. */
  numbers: allFromSearch(toNumber),
  ints: allFromSearch(toInt),
  bools: allFromSearch(toBool),
  strings: allFromSearch(toText),
};
