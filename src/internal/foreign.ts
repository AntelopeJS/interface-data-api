/** @internal @packageDocumentation */

import {
  type Datum,
  IsStream,
  type SchemaInstance,
  type Stream,
  type ValueProxy,
} from "@antelopejs/interface-database";

import type { DataAPIMeta, ForeignJoinedRef } from "../metadata";
import { Get, pluckedTable, type TableRow, targetTable } from "./tables";

export function Foreign(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any>,
  pluck?: Set<string>,
): Stream<any>;

export function Foreign(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Datum<any>,
  pluck?: Set<string>,
): Datum<any>;

export function Foreign(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any> | Datum<any>,
  pluck?: Set<string>,
): Stream<any> | Datum<any>;
export function Foreign(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any> | Datum<any>,
  pluck?: Set<string>,
): Stream<any> | Datum<any> {
  if (IsStream(query)) {
    for (const [name, field] of Object.entries(meta.fields)) {
      if (!field.foreign || (pluck && !pluck.has(name))) {
        continue;
      }
      const [
        table,
        tableClass,
        index,
        multi,
        pluckField,
        schemaName,
        targetJoined,
      ] = field.foreign;
      const other = targetTable(db, { table, tableClass, schemaName });
      const hasTargetJoined = !multi && !!targetJoined?.length;
      if (pluckField) {
        const lookupPluck = hasTargetJoined
          ? Array.from(
              new Set([...pluckField, ...targetJoined.map((g) => g.localKey)]),
            )
          : pluckField;
        query = query.lookup(
          pluckedTable(other, ...lookupPluck),
          name,
          index || "_id",
        );
      } else {
        query = query.lookup(other, name, index || "_id");
      }
      if (hasTargetJoined) {
        query = applyForeignJoinedStream(db, query, name, targetJoined);
      }
    }
    return query;
  } else {
    const oldForeign = (obj: TableRow) => {
      const changedFields: Record<string, Datum<any> | ValueProxy<any>> = {};
      for (const [name, field] of Object.entries(meta.fields)) {
        if (!field.foreign || (pluck && !pluck.has(name))) {
          continue;
        }
        const [
          table,
          tableClass,
          index,
          multi,
          pluckField,
          schemaName,
          targetJoined,
        ] = field.foreign;
        const remote = targetTable(db, { table, tableClass, schemaName });
        if (multi) {
          changedFields[name] = obj
            .key(name)
            .cast<string[]>()
            .default([])
            .map((val) => {
              let foreignObject: Datum<any> = Get(remote, val, index);
              if (pluckField) {
                foreignObject = foreignObject.pluck("_internal", ...pluckField);
              }
              return foreignObject.default(null);
            });
        } else {
          let foreignObject: Datum<any> = Get(remote, obj.key(name), index);
          if (targetJoined && targetJoined.length > 0) {
            foreignObject = applyForeignJoinedDatum(
              db,
              foreignObject,
              targetJoined,
            );
          }
          changedFields[name] = foreignObject.default(null);
        }
      }
      return obj.merge(changedFields);
    };
    return query.do(oldForeign);
  }
}

/**
 * Re-materializes the `@Joined` fields of a relation target on the looked-up
 * sub-object (Stream/list path). The base `Foreign` lookup only plucks the
 * target's physical columns, so a joined label would come back empty; here we
 * resolve each joined field with a second lookup keyed on the target's
 * (already plucked) local key, then merge it back into the relation object.
 * For an orphan foreign key the merge yields `{ [joined]: null }`: the
 * database DSL has no value-level conditional to null the relation here, so
 * {@link Validation.ClearInternal} normalizes it back to a null relation.
 */
function applyForeignJoinedStream(
  db: SchemaInstance<any>,
  stream: Stream<any>,
  foreignName: string,
  groups: ForeignJoinedRef[],
): Stream<any> {
  let s = stream;
  for (const group of groups) {
    const remoteTable = pluckedTable(
      targetTable(db, group),
      group.remoteIndex,
      group.remoteField,
    );
    const tmpKey = `__fjoin_${foreignName}_${group.name}`;
    s = s
      .map((row) =>
        row.merge({
          [tmpKey]: row.key(foreignName).key(group.localKey),
        }),
      )
      .lookup(remoteTable, tmpKey, group.remoteIndex)
      .map((row) =>
        row.merge({
          [foreignName]: row.key(foreignName).merge({
            [group.name]: row
              .key(tmpKey)
              .default({})
              .key(group.remoteField)
              .default(null),
          }),
        }),
      )
      .without(tmpKey);
  }
  return s;
}

/**
 * Datum/get counterpart of {@link applyForeignJoinedStream}: resolves each of
 * the target's `@Joined` fields with a secondary `Get` and merges it into the
 * relation object.
 */
function applyForeignJoinedDatum(
  db: SchemaInstance<any>,
  datum: Datum<any>,
  groups: ForeignJoinedRef[],
): Datum<any> {
  let d = datum;
  for (const group of groups) {
    const remoteTable = targetTable(db, group);
    d = d.do((row) =>
      row.merge({
        [group.name]: Get(
          remoteTable,
          row.key(group.localKey),
          group.remoteIndex,
        )
          .key(group.remoteField)
          .default(null),
      }),
    );
  }
  return d;
}
