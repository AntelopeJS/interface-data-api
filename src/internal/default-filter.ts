/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";

import type { DataAPIMeta } from "../metadata";
import type { Comparison, FilterValue } from "./field-types";
import { ownEntry } from "./meta-records";

type ProxyFilterOperator = (
  proxy: ValueProxy<unknown>,
  value: string,
) => ValueProxyOrValue<boolean>;

type DefaultFilterOperators = Record<Comparison, ProxyFilterOperator>;

export type DefaultFilterFunction = Parameters<DataAPIMeta["setFilter"]>[1];

const DEFAULT_FILTER_OPERATORS: DefaultFilterOperators = {
  eq: (proxy, value) => proxy.eq(value),
  ne: (proxy, value) => proxy.ne(value),
  gt: (proxy, value) => proxy.gt(value),
  ge: (proxy, value) => proxy.ge(value),
  lt: (proxy, value) => proxy.lt(value),
  le: (proxy, value) => proxy.le(value),
};

/**
 * Applies a comparison to the column.
 *
 * @throws HTTPResult 400 when `mode` is not one of the default filter's
 * comparisons; a custom filter receives its mode unchecked
 */
function applyDefaultFilterMode(
  proxy: ValueProxy<unknown>,
  value: string,
  mode: FilterValue[1],
): ValueProxyOrValue<boolean> {
  const operator = ownEntry(DEFAULT_FILTER_OPERATORS, mode);
  assert(
    operator,
    400,
    `Unknown filter comparison "${mode}": use one of ${Object.keys(DEFAULT_FILTER_OPERATORS).join(", ")}, or start a value that contains a colon with "eq:".`,
  );
  return operator(proxy, value);
}

export function createDefaultFilter(): DefaultFilterFunction {
  return (_context, proxy, _key, value, mode) =>
    applyDefaultFilterMode(proxy, value, mode);
}
