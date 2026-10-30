/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";

import {
  type FieldFilter,
  type FilterValue,
  FilterValuesOf,
} from "../metadata";
import type { Comparison } from "./field-types";

const COMPARISONS: readonly Comparison[] = ["eq", "ne", "gt", "ge", "lt", "le"];

function isComparison(name: string): name is Comparison {
  return COMPARISONS.some((comparison) => comparison === name);
}

/**
 * Reads one `filter_<field>` query value: `<comparison>:<value>`, or a bare
 * value compared with `eq`.
 *
 * @throws HTTPResult 400 when the text before the first colon is not a
 * comparison; a value that contains a colon needs an explicit `eq:`
 */
export function parseFilter(searchVal: string): FilterValue {
  const match = searchVal.match(/([^:]+):(.*)/);
  if (!match) {
    return [searchVal, "eq"];
  }
  const [, comparison, value] = match;
  assert(
    isComparison(comparison),
    400,
    `Unknown filter comparison "${comparison}": use one of ${COMPARISONS.join(", ")}, or start a value that contains a colon with "eq:".`,
  );
  return [value, comparison];
}

export function copyFilter(filter: FieldFilter): FieldFilter {
  const copies = FilterValuesOf(filter).map((value): FilterValue => [...value]);
  return copies.length === 1 ? copies[0] : copies;
}
