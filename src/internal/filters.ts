/** @internal @packageDocumentation */

import type { FieldFilter, FilterValue } from "./field-types";

function isFilterList(filter: FieldFilter): filter is FilterValue[] {
  return Array.isArray(filter[0]);
}

/** The filters of one field as a list, whether it holds one or several. */
export function FilterValuesOf(filter: FieldFilter): FilterValue[] {
  return isFilterList(filter) ? filter : [filter];
}

export function parseFilter(searchVal: string): FilterValue {
  const match = searchVal.match(/([^:]+):(.*)/);
  return match ? [match[2], match[1]] : [searchVal, "eq"];
}

export function copyFilter(filter: FieldFilter): FieldFilter {
  const copies = FilterValuesOf(filter).map((value): FilterValue => [...value]);
  return copies.length === 1 ? copies[0] : copies;
}
