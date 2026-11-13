/** @internal @packageDocumentation */

import { assert } from "@antelopejs/interface-api-util";

import type { Query } from "../components";
import type {
  DataAPIMeta,
  DataControllerInstance,
  StoredRow,
  WritableAccessFields,
} from "../metadata";
import { isWriteValue } from "./guards";
import { ownEntry } from "./meta-records";
import { controllerReceiver, prototypeOf } from "./prototypes";

function writableInBody(
  writable: WritableAccessFields,
  bodyData: Parameters<typeof Query.WriteProperties>[2],
): WritableAccessFields {
  return {
    props: writable.props.filter(([key]) => Object.hasOwn(bodyData, key)),
    setters: writable.setters.filter(([key]) => Object.hasOwn(bodyData, key)),
  };
}

/**
 * Writes the defaults of the controller class's fields into `fields` and
 * `dbData`, and answers the defaults of its other members, which reach the
 * setters unread.
 */
function writeTargetDefaults(
  fields: StoredRow,
  meta: DataAPIMeta,
  dbData: StoredRow,
) {
  const defaults: [string, unknown][] = Object.entries(new meta.target());
  const others: [string, unknown][] = [];
  for (const [key, value] of defaults) {
    if (value === undefined) continue;
    const field = ownEntry(meta.fields, key);
    if (!field) {
      others.push([key, value]);
      continue;
    }
    assert(
      isWriteValue(value),
      500,
      `The default of field '${key}' is a bigint, a symbol or a function, which no database stores`,
    );
    fields[key] = value;
    dbData[field.dbName || key] = value;
  }
  return Object.fromEntries(others);
}

function refuseUnstoredValues(dbData: StoredRow) {
  for (const [key, value] of Object.entries(dbData)) {
    assert(
      isWriteValue(value),
      500,
      `A setter wrote a bigint, a symbol or a function into field '${key}', which no database stores`,
    );
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
  const fields: StoredRow = {};
  const dbData: StoredRow = existingDBData || {};
  Object.setPrototypeOf(dbData, prototypeOf(meta.tableClass));
  const otherDefaults = existingDBData
    ? {}
    : writeTargetDefaults(fields, meta, dbData);
  for (const [key, field] of writable.props) {
    const value = ownEntry(bodyData, key);
    fields[key] = value;
    dbData[field.dbName || key] = value;
  }
  fields.table = dbData;
  const instance = controllerReceiver(
    { ...obj, ...otherDefaults },
    meta.target,
    fields,
  );
  for (const [key, field] of writable.setters) {
    field.desc?.set?.apply(instance, [ownEntry(bodyData, key)]);
  }
  refuseUnstoredValues(dbData);
  return dbData;
}
