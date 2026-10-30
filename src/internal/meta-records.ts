/** @internal @packageDocumentation */

import type { FieldData, ForeignJoinedRef } from "./field-types";

/** Copies into `dst` the entries of `src` it lacks. */
export function merge<Value>(
  src: Record<string, Value>,
  dst: Record<string, Value>,
) {
  for (const key in src) {
    if (!Object.hasOwn(dst, key)) {
      dst[key] = src[key];
    }
  }
}

/** Rebuilds the fields each list mode plucks from the fields' listable modes. */
export function rebuildPluck(
  pluck: Record<string, Set<string>>,
  fields: Record<string, FieldData>,
) {
  for (const set of Object.values(pluck)) {
    set.clear();
  }
  for (const [_, field] of Object.entries(fields)) {
    if (field.listable) {
      for (const [mode, names] of Object.entries(field.listable)) {
        const modeNames = Object.hasOwn(pluck, mode) ? pluck[mode] : undefined;
        const set = modeNames ?? new Set<string>();
        pluck[mode] = set;
        for (const name of names) {
          set.add(name);
        }
      }
    }
  }
}

/**
 * The `@Joined` fields of a relation target that `pluck` names, or all of
 * them when `pluck` is unset; `undefined` when there are none.
 */
export function targetJoinedFields(
  fields: Record<string, FieldData>,
  pluck?: string[],
) {
  const pluckSet = pluck ? new Set(pluck) : undefined;
  const groups: ForeignJoinedRef[] = [];
  for (const [fieldName, field] of Object.entries(fields)) {
    if (!field.joined || (pluckSet && !pluckSet.has(fieldName))) {
      continue;
    }
    const j = field.joined;
    groups.push({
      name: fieldName,
      table: j.table,
      tableClass: j.tableClass,
      localKey: j.localKey,
      remoteField: j.remoteField,
      remoteIndex: j.remoteIndex,
      schemaName: j.schemaName,
    });
  }
  return groups.length > 0 ? groups : undefined;
}

/**
 * The database fields a listable field selects: itself (`true`), none
 * (`false`) or the given ones, plus the field and its local key when it is
 * joined and selects any.
 */
export function listedNames(
  name: string,
  requiredFields: boolean | string[],
  field: FieldData,
) {
  const baseNames =
    requiredFields === true
      ? [name]
      : requiredFields === false
        ? []
        : requiredFields;
  return baseNames.length > 0 && field.joined
    ? Array.from(new Set([...baseNames, name, field.joined.localKey]))
    : baseNames;
}
