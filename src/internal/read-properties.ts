/** @internal @packageDocumentation */

import type {
  DataAPIMeta,
  DataControllerInstance,
  RowFields,
} from "../metadata";
import { isFunction } from "./guards";
import { prototypeOf } from "./prototypes";

export async function ReadProperties(
  obj: DataControllerInstance,
  meta: DataAPIMeta,
  dbData: RowFields,
  action?: string,
  onlyList?: boolean,
) {
  const readable =
    meta.readable[action ?? "_default"] ?? meta.readable._default;
  const instance = { ...obj };
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
    const val: unknown = field.desc?.get?.apply(instance);
    res[key] = await (isFunction(val) ? val() : val);
  }
  return res;
}
