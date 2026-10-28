/** @internal @packageDocumentation */

import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";

import type { DataAPIMeta } from "../metadata";
import type { Comparison, FilterValue } from "./field-types";

type ProxyFilterOperator = (
  proxy: ValueProxy<string>,
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

function applyDefaultFilterMode(
  proxy: ValueProxy<string>,
  value: string,
  mode: FilterValue[1],
): ValueProxyOrValue<boolean> {
  return DEFAULT_FILTER_OPERATORS[mode](proxy, value);
}

export function createDefaultFilter(): DefaultFilterFunction {
  return (_context, proxy, _key, value, mode) =>
    applyDefaultFilterMode(proxy, value, mode);
}
