/** @internal @packageDocumentation */

import type { Query } from "../components";
import type {
  DataAPIMeta,
  DataControllerInstance,
  RowFields,
  WritableAccessFields,
} from "../metadata";
import { ownEntry } from "./meta-records";
import { fieldsOf, prototypeOf } from "./prototypes";

function writableInBody(
  writable: WritableAccessFields,
  bodyData: Parameters<typeof Query.WriteProperties>[2],
): WritableAccessFields {
  return {
    props: writable.props.filter(([key]) => Object.hasOwn(bodyData, key)),
    setters: writable.setters.filter(([key]) => Object.hasOwn(bodyData, key)),
  };
}

function writeTargetDefaults(
  instance: RowFields,
  meta: DataAPIMeta,
  dbData: RowFields,
) {
  const defaults: [string, unknown][] = Object.entries(new meta.target());
  for (const [key, value] of defaults) {
    if (value !== undefined) {
      instance[key] = value;
      const field = ownEntry(meta.fields, key);
      if (field) {
        dbData[field.dbName || key] = value;
      }
    }
  }
}

export function WriteProperties(
  obj: DataControllerInstance,
  meta: DataAPIMeta,
  bodyData: Parameters<typeof Query.WriteProperties>[2],
  action?: string,
  existingDBData?: Parameters<typeof Query.WriteProperties>[4],
) {
  const actionWritable =
    meta.writable[action ?? "_default"] ?? meta.writable._default;
  const writable = existingDBData
    ? writableInBody(actionWritable, bodyData)
    : actionWritable;
  const instance = fieldsOf({ ...obj });
  const dbData: RowFields = existingDBData || {};
  Object.setPrototypeOf(dbData, prototypeOf(meta.tableClass));
  if (!existingDBData) {
    writeTargetDefaults(instance, meta, dbData);
  }
  for (const [key, field] of writable.props) {
    const value = ownEntry(bodyData, key);
    instance[key] = value;
    dbData[field.dbName || key] = value;
  }
  instance.table = dbData;
  Object.setPrototypeOf(instance, prototypeOf(meta.target));
  for (const [key, field] of writable.setters) {
    field.desc?.set?.apply(instance, [ownEntry(bodyData, key)]);
  }
  return dbData;
}
