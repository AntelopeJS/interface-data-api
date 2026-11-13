/** @internal @packageDocumentation */

import type {
  FieldData,
  ReadableAccessFields,
  WritableAccessFields,
} from "./field-types";

/** The action whose access is a field's own `mode`, overrides aside. */
export const DEFAULT_ACTION = "_default";

/** Whether a field is read, and whether it is written, in one action. */
type FieldAccess = (field: FieldData, action: string) => [boolean, boolean];

/**
 * Rebuilds `readable` and `writable` from `fields`: one entry per action a
 * field overrides, plus `_default`, each listing the fields `access` lets the
 * action read or write, accessors apart from plain properties.
 */
export function rebuildAccess(
  readable: Record<string, ReadableAccessFields>,
  writable: Record<string, WritableAccessFields>,
  fields: Record<string, FieldData>,
  access: FieldAccess,
) {
  for (const key of Object.keys(readable)) {
    delete readable[key];
  }
  for (const key of Object.keys(writable)) {
    delete writable[key];
  }

  const actions = new Set([
    DEFAULT_ACTION,
    ...Object.values(fields).flatMap((field) =>
      Object.keys(field.modeOverrides ?? {}),
    ),
  ]);

  const lists = new Map<string, [ReadableAccessFields, WritableAccessFields]>();
  for (const action of actions) {
    const read: ReadableAccessFields = { getters: [], props: [] };
    const write: WritableAccessFields = { setters: [], props: [] };
    readable[action] = read;
    writable[action] = write;
    lists.set(action, [read, write]);
  }

  for (const [key, field] of Object.entries(fields)) {
    for (const [action, [read, write]] of lists) {
      const [reads, writes] = access(field, action);
      if (reads) {
        read[field.desc?.get ? "getters" : "props"].push([key, field]);
      }
      if (writes) {
        write[field.desc?.set ? "setters" : "props"].push([key, field]);
      }
    }
  }
}
