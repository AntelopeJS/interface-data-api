/** @internal @packageDocumentation */

import {
  type Datum,
  IsStream,
  type SchemaInstance,
  type Stream,
  type Table,
  type ValueProxy,
} from "@antelopejs/interface-database";

import type { DataAPIMeta, FieldFilter } from "../metadata";
import { type TableTargetReference, targetTable } from "./tables";

interface JoinedGroup extends TableTargetReference {
  localKey: string;
  remoteIndex: string;
  schemaName?: string;
  fields: Array<{ name: string; remoteField: string }>;
}

function collectJoinedGroups(meta: DataAPIMeta): JoinedGroup[] {
  const groups = new Map<string, JoinedGroup>();
  for (const [name, field] of Object.entries(meta.fields)) {
    if (!field.joined) continue;
    const j = field.joined;
    const groupKey = `${j.schemaName ?? ""}|${j.table}|${j.localKey}|${j.remoteIndex}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        table: j.table,
        tableClass: j.tableClass,
        localKey: j.localKey,
        remoteIndex: j.remoteIndex,
        schemaName: j.schemaName,
        fields: [],
      };
      groups.set(groupKey, group);
    }
    group.fields.push({ name, remoteField: j.remoteField });
  }
  return Array.from(groups.values());
}

export interface JoinedFieldSplit {
  filter: Set<string>;
  sort: Set<string>;
}

function addAll(target: Set<string>, names: string[]) {
  for (const name of names) {
    target.add(name);
  }
}

/**
 * Splits the joined fields of `meta` between those {@link List} must
 * materialize before the filter and count (`filter`) and those it only
 * needs after the count (`sort`). Joined fields referenced by neither are
 * left out so the list route can defer their lookups to the returned page.
 *
 * Computed expressions may read joined fields, so materializing a computed
 * field pulls every remaining joined group in with it. Groups whose local
 * key is also a foreign field must resolve before `Foreign` replaces the
 * key with the looked-up record.
 */
export function splitJoinedFields(
  meta: DataAPIMeta,
  sorting?: [string, "asc" | "desc" | undefined],
  filters?: Record<string, FieldFilter>,
): JoinedFieldSplit {
  const split: JoinedFieldSplit = { filter: new Set(), sort: new Set() };
  const filterNames = Object.keys(meta.filters).filter(
    (name) => filters && name in filters,
  );
  const hasComputedFilter = filterNames.some(
    (name) => meta.fields[name]?.computed,
  );
  const sortField = sorting?.[0];
  const hasComputedSort = !!sortField && !!meta.fields[sortField]?.computed;
  for (const group of collectJoinedGroups(meta)) {
    const names = group.fields.map((field) => field.name);
    if (hasComputedFilter || names.some((name) => filterNames.includes(name))) {
      addAll(split.filter, names);
    } else if (
      hasComputedSort ||
      (sortField && names.includes(sortField)) ||
      meta.fields[group.localKey]?.foreign
    ) {
      addAll(split.sort, names);
    }
  }
  return split;
}

/**
 * Joined field names that {@link List} does not materialize for the given
 * split. The default list route resolves these after pagination so their
 * lookups only run on the returned page.
 */
export function deferredJoinedFields(
  meta: DataAPIMeta,
  split: JoinedFieldSplit,
): Set<string> {
  return new Set(
    Object.entries(meta.fields)
      .filter(
        ([name, field]) =>
          field.joined && !split.filter.has(name) && !split.sort.has(name),
      )
      .map(([name]) => name),
  );
}

export function Joined(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any>,
  only?: Set<string>,
): Stream<any>;

export function Joined(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Datum<any>,
  only?: Set<string>,
): Datum<any>;

export function Joined(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any> | Datum<any>,
  only?: Set<string>,
): Stream<any> | Datum<any>;
export function Joined(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any> | Datum<any>,
  only?: Set<string>,
): Stream<any> | Datum<any> {
  const groups = collectJoinedGroups(meta).filter(
    (group) => !only || group.fields.some((field) => only.has(field.name)),
  );
  if (groups.length === 0) {
    return query;
  }

  const emptyRemote = {};
  const tmpKeyFor = (localKey: string) => `__joined_orig_${localKey}`;

  if (IsStream(query)) {
    let stream = query;
    const tmpKeys: string[] = [];
    for (const group of groups) {
      const remoteFields = group.fields.map((f) => f.remoteField);
      const remoteTable = targetTable(db, group).pluck(
        "_internal",
        group.remoteIndex,
        ...remoteFields,
      ) as Table<any>;
      const tmpKey = tmpKeyFor(group.localKey);
      tmpKeys.push(tmpKey);
      stream = stream
        .map((row) => row.merge({ [tmpKey]: row.key(group.localKey) }))
        .lookup(remoteTable, group.localKey, group.remoteIndex)
        .map((row) => {
          const merged: Record<string, ValueProxy<any>> = {};
          const remote = row.key(group.localKey).default(emptyRemote);
          for (const f of group.fields) {
            merged[f.name] = remote.key(f.remoteField).default(null);
          }
          merged[group.localKey] = row.key(tmpKey);
          return row.merge(merged);
        });
    }
    return stream.without(...tmpKeys);
  }

  let datum = query;
  for (const group of groups) {
    const remoteFields = group.fields.map((f) => f.remoteField);
    const remoteTable = targetTable(db, group).pluck(
      "_internal",
      group.remoteIndex,
      ...remoteFields,
    ) as Table<any>;
    const tmpKey = tmpKeyFor(group.localKey);
    datum = datum
      .do((row) => row.merge({ [tmpKey]: row.key(group.localKey) }))
      .lookup(remoteTable, group.localKey, group.remoteIndex)
      .do((row) => {
        const merged: Record<string, ValueProxy<any>> = {};
        const remote = row.key(group.localKey).default(emptyRemote);
        for (const f of group.fields) {
          merged[f.name] = remote.key(f.remoteField).default(null);
        }
        merged[group.localKey] = row.key(tmpKey);
        return row.merge(merged);
      });
  }
  return datum;
}
