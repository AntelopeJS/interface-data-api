/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";

import type {
  DataAPIMeta,
  DataControllerInstance,
  StoredRow,
} from "../metadata";
import type { FieldData } from "./field-types";
import { isFunction, isWriteValue } from "./guards";
import { ownEntry } from "./meta-records";
import { controllerReceiver } from "./prototypes";

/** Which fields a read leaves out. */
interface ReadFilter {
  /** Leaves out the fields that no list mode lists. */
  onlyList?: boolean;
  /** Leaves out the getters that this list mode does not list. */
  listMode?: string;
}

function listedIn(field: FieldData, mode: string) {
  return (
    field.listable !== undefined && ownEntry(field.listable, mode) !== undefined
  );
}

export async function ReadProperties(
  obj: DataControllerInstance,
  meta: DataAPIMeta,
  dbData: StoredRow,
  action?: string,
  { onlyList, listMode }: ReadFilter = {},
) {
  const readable =
    meta.readable[action ?? "_default"] ?? meta.readable._default;
  const fields: StoredRow = {};
  const res: StoredRow = {};
  for (const [key, field] of readable.props) {
    if (onlyList && !field.listable) {
      continue;
    }
    fields[key] = dbData[field.dbName || key];
    res[key] = dbData[field.dbName || key];
  }
  fields.table = dbData;
  const instance = controllerReceiver(obj, meta.target, fields);
  for (const [key, field] of readable.getters) {
    if (onlyList && !field.listable) {
      continue;
    }
    if (listMode !== undefined && !listedIn(field, listMode)) {
      continue;
    }
    const val: unknown = field.desc?.get?.apply(instance);
    const result: unknown = await (isFunction(val) ? val() : val);
    assert(
      isWriteValue(result),
      500,
      `Getter '${key}' returned a bigint, a symbol or a function, which a response cannot hold`,
    );
    res[key] = result;
  }
  return res;
}
