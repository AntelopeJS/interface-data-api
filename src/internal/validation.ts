/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";
import type {
  Constructible,
  PlainRow,
} from "@antelopejs/interface-database-decorators/common";
import type { ValueProxy } from "@antelopejs/interface-database";
import {
  fromDatabase,
  lock,
  type OneWayModifier,
  toPlainData,
  unlock,
  unlockrequest,
} from "@antelopejs/interface-database-decorators/modifiers/common";

import type { Validation } from "../components";
import type {
  DataAPIMeta,
  DataControllerInstance,
  StoredRow,
} from "../metadata";
import type { StoredValue } from "./field-types";
import { fieldsOf } from "./prototypes";
import { isFieldValues, isObject, isWriteValue } from "./guards";

type RequestBody = Validation.RequestBody;

/**
 * The fields `keys` of a related row, refused with 500 when one holds a value
 * no response can.
 */
function relatedRow(plain: PlainRow<any>, keys: string[]) {
  const row: StoredRow = {};
  for (const key of keys) {
    const value: unknown = plain[key];
    assert(
      isWriteValue(value),
      500,
      `Field '${key}' of a related row holds a bigint, a symbol or a function, which a response cannot hold`,
    );
    row[key] = value;
  }
  return row;
}

/** Whether a row value is a list, whose items are row values too. */
function isStoredList(value: StoredValue): value is readonly StoredValue[] {
  return Array.isArray(value);
}
type WrittenBody = Validation.WrittenBody;

/**
 * A modifier a controller keys, handed what the controller holds as its key.
 * `ContainerModifier` declares its key a string, and a controller holds none on
 * a request that does not send it (a missing language header): the modifier
 * then finds nothing under the key.
 */
type KeyedModifier = Constructible<OneWayModifier<any, [key: unknown]>>;

export function ParseBody(body: WrittenBody): RequestBody {
  let data: unknown = body;
  if (Buffer.isBuffer(body)) {
    try {
      data = JSON.parse(body.toString());
    } catch {
      assert(false, 400, "Invalid JSON body.");
    }
  }
  assert(isFieldValues(data), 400, "The request body must be a JSON object.");
  return data;
}

export function Lock(
  obj: DataControllerInstance,
  meta: DataAPIMeta,
  data: StoredRow,
  written: string[],
) {
  for (const [modifier, field] of meta.modifierKeys.entries()) {
    const keyed: KeyedModifier = modifier;
    const key = fieldsOf(obj)[field];
    lock(data, keyed, written, key);
  }
}

export function Unlock(
  obj: DataControllerInstance,
  meta: DataAPIMeta,
  dbData: StoredRow,
) {
  for (const [name, field] of Object.entries(meta.fields)) {
    if (field.foreign && isObject(dbData[name]) && field.foreign[1]) {
      const foreignSchema = field.foreign[1];
      const related = dbData[name];
      dbData[name] = isStoredList(related)
        ? related.map((entry) =>
            isObject(entry) ? fromDatabase(entry, foreignSchema) : entry,
          )
        : fromDatabase(related, foreignSchema);
    }
  }
  for (const [modifier, field] of meta.modifierKeys.entries()) {
    const keyed: KeyedModifier = modifier;
    const key = fieldsOf(obj)[field];
    unlock(dbData, keyed, undefined, key);
    for (const [foreign, fieldData] of Object.entries(meta.fields)) {
      const related = dbData[foreign];
      if (fieldData.foreign && isObject(related)) {
        unlock(related, keyed, undefined, key);
      }
    }
  }
}

export function UnlockRequest<T extends {}, K extends keyof T>(
  obj: DataControllerInstance,
  meta: DataAPIMeta,
  row: ValueProxy<T>,
  field: K,
): ValueProxy<T[K]> {
  const modifiers = Array.from(meta.modifierKeys.entries()).map(
    ([modifier, field]) => ({
      modifier,
      args: [fieldsOf(obj)[field]],
    }),
  );
  return unlockrequest<T, K>(meta.tableClass, row, field, modifiers);
}

export function ClearInternal(
  meta: DataAPIMeta,
  obj: Parameters<typeof Validation.ClearInternal>[1],
) {
  const results = Array.isArray(obj) ? obj : [obj];

  const foreignFields = Object.entries(meta.fields).filter(
    ([, field]) => field.foreign,
  );
  for (const entry of results) {
    delete entry._internal;
    for (const [name, { foreign }] of foreignFields) {
      if (
        foreign &&
        isObject(entry[name]) &&
        (!Array.isArray(entry[name]) ||
          entry[name][0] === null ||
          isObject(entry[name][0]))
      ) {
        const processForeign = (data: any): StoredRow | null => {
          const plain = toPlainData(data);
          if (!foreign?.[4]) {
            return relatedRow(plain, Object.keys(plain));
          }
          const targetJoined = foreign[6];
          if (targetJoined?.length) {
            const joinedNames = new Set(targetJoined.map((g) => g.name));
            const physicalKeys = foreign[4].filter((k) => !joinedNames.has(k));
            if (
              physicalKeys.length > 0 &&
              physicalKeys.every(
                (k) => plain[k] === null || plain[k] === undefined,
              )
            ) {
              return null;
            }
          }
          return relatedRow(plain, foreign[4]);
        };
        const related = entry[name];
        entry[name] = isStoredList(related)
          ? related.map((item) =>
              isObject(item) ? processForeign(item) : item,
            )
          : processForeign(related);
      }
    }
  }
}
