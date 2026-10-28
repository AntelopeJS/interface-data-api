/** @internal @packageDocumentation */

import {
  type Datum,
  IsStream,
  type SchemaInstance,
  type Stream,
  type ValueProxy,
} from "@antelopejs/interface-database";

import type { ComputedFieldData, DataAPIMeta } from "../metadata";
import type { TableRow } from "./tables";

type ComputedEntry = [name: string, computed: ComputedFieldData];

type RowMapper = (row: TableRow) => TableRow;

function collectComputedEntries(
  meta: DataAPIMeta,
  only?: Set<string>,
): ComputedEntry[] {
  return Object.entries(meta.fields).flatMap(
    ([name, field]): ComputedEntry[] =>
      field.computed && (!only || only.has(name))
        ? [[name, field.computed]]
        : [],
  );
}

function buildComputedMappers(
  db: SchemaInstance<any>,
  entries: ComputedEntry[],
): RowMapper[] {
  const mergeExpressions: RowMapper = (row) => {
    const merged: Record<string, ReturnType<ComputedFieldData["expr"]>> = {};
    for (const [name, computed] of entries) {
      merged[name] = computed.expr(row, db);
    }
    return row.merge(merged);
  };
  const defaulted = entries.filter(
    ([, computed]) => computed.default !== undefined,
  );
  if (defaulted.length === 0) {
    return [mergeExpressions];
  }
  const applyDefaults: RowMapper = (row) => {
    const merged: Record<string, ValueProxy<any>> = {};
    for (const [name, computed] of defaulted) {
      merged[name] = row.key(name).default(computed.default);
    }
    return row.merge(merged);
  };
  return [mergeExpressions, applyDefaults];
}

export function Computed(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any>,
  only?: Set<string>,
): Stream<any>;

export function Computed(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Datum<any>,
  only?: Set<string>,
): Datum<any>;

export function Computed(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any> | Datum<any>,
  only?: Set<string>,
): Stream<any> | Datum<any>;
export function Computed(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  query: Stream<any> | Datum<any>,
  only?: Set<string>,
): Stream<any> | Datum<any> {
  const entries = collectComputedEntries(meta, only);
  if (entries.length === 0) {
    return query;
  }
  const mappers = buildComputedMappers(db, entries);
  if (IsStream(query)) {
    return mappers.reduce((stream, mapper) => stream.map(mapper), query);
  }
  return mappers.reduce((datum, mapper) => datum.do(mapper), query);
}
