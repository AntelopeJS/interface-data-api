/** @internal @packageDocumentation */

import type { Query } from "../components";
import type {
  DataAPIMeta,
  FieldValues,
  WritableAccessFields,
} from "../metadata";
import { isFunction } from "./guards";
import { prototypeOf } from "./prototypes";

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
  instance: Parameters<typeof Query.WriteProperties>[0],
  meta: DataAPIMeta,
  dbData: Exclude<Parameters<typeof Query.WriteProperties>[4], undefined>,
) {
  for (const [key, value] of Object.entries(new meta.target())) {
    if (value !== undefined) {
      instance[key] = value;
      if (key in meta.fields) {
        dbData[meta.fields[key].dbName || key] = value;
      }
    }
  }
}

export async function ReadProperties(
  obj: any,
  meta: DataAPIMeta,
  dbData: any,
  action?: string,
  onlyList?: boolean,
) {
  const readable =
    meta.readable[action ?? "_default"] ?? meta.readable._default;
  const instance = { ...obj };
  const res: FieldValues = {};
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

export function WriteProperties(
  obj: any,
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
  const instance = { ...obj };
  const dbData: Exclude<typeof existingDBData, undefined> =
    existingDBData || {};
  Object.setPrototypeOf(dbData, prototypeOf(meta.tableClass));
  if (!existingDBData) {
    writeTargetDefaults(instance, meta, dbData);
  }
  for (const [key, field] of writable.props) {
    instance[key] = bodyData[key];
    dbData[field.dbName || key] = bodyData[key];
  }
  instance.table = dbData;
  Object.setPrototypeOf(instance, prototypeOf(meta.target));
  for (const [key, field] of writable.setters) {
    field.desc?.set?.apply(instance, [bodyData[key]]);
  }
  return dbData;
}
