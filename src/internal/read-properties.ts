/** @internal @packageDocumentation */

import type {
  DataAPIMeta,
  DataControllerInstance,
  RowFields,
} from "../metadata";
import type { FieldData } from "./field-types";
import { isFunction } from "./guards";
import { ownEntry } from "./meta-records";
import { fieldsOf, prototypeOf } from "./prototypes";

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
  dbData: RowFields,
  action?: string,
  { onlyList, listMode }: ReadFilter = {},
) {
  const readable =
    meta.readable[action ?? "_default"] ?? meta.readable._default;
  const instance = fieldsOf({ ...obj });
  const res: RowFields = {};
  for (const [key, field] of readable.props) {
    if (onlyList && !field.listable) {
      continue;
    }
    instance[key] = dbData[field.dbName || key];
    res[key] = dbData[field.dbName || key];
  }
  instance.table = dbData;
  Object.setPrototypeOf(instance, prototypeOf(meta.target));
  for (const [key, field] of readable.getters) {
    if (onlyList && !field.listable) {
      continue;
    }
    if (listMode !== undefined && !listedIn(field, listMode)) {
      continue;
    }
    const val: unknown = field.desc?.get?.apply(instance);
    res[key] = await (isFunction(val) ? val() : val);
  }
  return res;
}
