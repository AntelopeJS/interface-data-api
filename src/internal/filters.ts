/** @internal @packageDocumentation */

import {
  type FieldFilter,
  type FilterValue,
  FilterValuesOf,
} from "../metadata";

export function parseFilter(searchVal: string): FilterValue {
  const match = searchVal.match(/([^:]+):(.*)/);
  return match ? [match[2], match[1] as FilterValue[1]] : [searchVal, "eq"];
}

export function copyFilter(filter: FieldFilter): FieldFilter {
  const copies = FilterValuesOf(filter).map((value): FilterValue => [...value]);
  return copies.length === 1 ? copies[0] : copies;
}
