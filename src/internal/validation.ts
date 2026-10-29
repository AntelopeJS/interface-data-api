/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";
import type { ValueProxy } from "@antelopejs/interface-database";
import {
  fromDatabase,
  toPlainData,
  unlock,
  unlockrequest,
} from "@antelopejs/interface-database-decorators/modifiers/common";

import type { Validation } from "../components";
import type { DataAPIMeta } from "../metadata";
import { isObject } from "./guards";

type RequestBody = Validation.RequestBody;
type WrittenBody = Validation.WrittenBody;

export function ParseBody(body: WrittenBody): RequestBody {
  let data: unknown = body;
  if (Buffer.isBuffer(body)) {
    try {
      data = JSON.parse(body.toString());
    } catch {
      assert(false, 400, "Invalid JSON body.");
    }
  }
  assert(
    isObject(data) && !Array.isArray(data),
    400,
    "The request body must be a JSON object.",
  );
  return data;
}

export function Unlock(obj: any, meta: DataAPIMeta, dbData: any) {
  for (const [name, field] of Object.entries(meta.fields)) {
    if (field.foreign && isObject(dbData[name]) && field.foreign[1]) {
      const foreignSchema = field.foreign[1];
      dbData[name] = Array.isArray(dbData[name])
        ? dbData[name].map((entry) => fromDatabase(entry, foreignSchema))
        : fromDatabase(dbData[name], field.foreign[1]);
    }
  }
  for (const [modifier, field] of meta.modifierKeys.entries()) {
    const key = obj[field];
    unlock(dbData, modifier, undefined, key);
    for (const [foreign, fieldData] of Object.entries(meta.fields)) {
      if (fieldData.foreign && isObject(dbData[foreign])) {
        unlock(dbData[foreign], modifier, undefined, key);
      }
    }
  }
}

export function UnlockRequest<T extends {}, K extends keyof T>(
  obj: any,
  meta: DataAPIMeta,
  row: ValueProxy<T>,
  field: K,
): ValueProxy<T[K]> {
  const modifiers = Array.from(meta.modifierKeys.entries()).map(
    ([modifier, field]) => ({
      modifier,
      args: [obj[field]],
    }),
  );
  return unlockrequest(meta.tableClass, row, field, modifiers);
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
        const processForeign = (data: any) => {
          const plain = toPlainData(data);
          if (!foreign?.[4]) {
            return plain;
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
          const plainPlucked: ReturnType<typeof toPlainData> = {};
          for (const key of foreign[4]) {
            plainPlucked[key] = plain[key];
          }
          return plainPlucked;
        };
        entry[name] = Array.isArray(entry[name])
          ? entry[name].map(processForeign)
          : processForeign(entry[name]);
      }
    }
  }
}
