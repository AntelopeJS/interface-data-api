/** @internal @packageDocumentation */

import { type SchemaInstance, Stream } from "@antelopejs/interface-database";

import type { DataAPIMeta } from "../metadata";
import { Joined } from "./joined";

interface DeferredJoinContext {
  db: SchemaInstance<any>;
  meta: DataAPIMeta;
  names: Set<string>;
  raw: Stream<any>;
}

/**
 * Stream returned by {@link List} when the deferred joined fields are not
 * exposed to the caller: it resolves them itself, so consumers that
 * destructure `[query, total]` alone still observe every `@Joined` field.
 * The lookups are appended after `slice`/`nth`, keeping them on the
 * requested page only; bare `count()` calls and field aggregates on
 * non-joined fields skip them (left-join lookups never change the row
 * count nor other fields); `changes()` attaches to the raw stream, since
 * change feeds cannot carry the lookups. Any other operation may observe
 * the joined fields, so it materializes them first.
 */
class DeferredJoinedStream extends Stream<any> {
  declare deferredJoin: DeferredJoinContext;
}

type DeferredJoinedOperation = (
  this: DeferredJoinedStream,
  ...args: any[]
) => any;

function materializeDeferredJoin(stream: DeferredJoinedStream) {
  const { db, meta, names, raw } = stream.deferredJoin;
  return Joined(db, meta, raw, names);
}

function pagedDeferredJoinOperation(name: string): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, ...args: any[]) {
    const { db, meta, names, raw } = this.deferredJoin;
    const paged = (raw as any)[name](...args);
    return Joined(db, meta, paged, names);
  };
}

/**
 * Resolves the joined fields through the stream form of {@link Joined}
 * rather than its datum form: only the datum form has no way to drop the
 * temporary key it stages (neither `Datum` nor `ValueProxy` exposes
 * `without`), so it would leave `__joined_orig_*` on the row.
 */
function nthDeferredJoinOperation(): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, n: number) {
    const { db, meta, names, raw } = this.deferredJoin;
    return Joined(db, meta, raw.slice(n, 1), names).nth(0);
  };
}

function rawDeferredJoinOperation(name: string): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, ...args: any[]) {
    return (this.deferredJoin.raw as any)[name](...args);
  };
}

function fieldAggregateDeferredJoinOperation(
  name: string,
  bareCallOnRaw: boolean,
): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, field?: string) {
    const { db, meta, names, raw } = this.deferredJoin;
    if (!field) {
      const bareTarget = bareCallOnRaw ? raw : materializeDeferredJoin(this);
      return (bareTarget as any)[name]();
    }
    const target = names.has(field)
      ? Joined(db, meta, raw, new Set([field]))
      : raw;
    return (target as any)[name](field);
  };
}

function forwardingDeferredJoinOperation(
  name: string,
): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, ...args: any[]) {
    return (materializeDeferredJoin(this) as any)[name](...args);
  };
}

/** The operation a {@link DeferredJoinedStream} installs for a stream method. */
interface DeferredJoinOperationFactories {
  [method: string]: (name: string) => DeferredJoinedOperation;
}

const DEFERRED_JOIN_OPERATION_FACTORIES: DeferredJoinOperationFactories = {
  slice: pagedDeferredJoinOperation,
  nth: nthDeferredJoinOperation,
  changes: rawDeferredJoinOperation,
  count: (name) => fieldAggregateDeferredJoinOperation(name, true),
  sum: (name) => fieldAggregateDeferredJoinOperation(name, false),
  avg: (name) => fieldAggregateDeferredJoinOperation(name, false),
  min: (name) => fieldAggregateDeferredJoinOperation(name, false),
  max: (name) => fieldAggregateDeferredJoinOperation(name, false),
  distinct: (name) => fieldAggregateDeferredJoinOperation(name, false),
};

const DEFERRED_JOIN_INHERITED_OPERATIONS = new Set(["constructor", "cast"]);

function wireDeferredJoinedStream() {
  const operationNames = [
    ...Object.getOwnPropertyNames(Stream.prototype),
    "run",
    "cursor",
    "build",
  ].filter((name) => !DEFERRED_JOIN_INHERITED_OPERATIONS.has(name));
  for (const name of operationNames) {
    const factory =
      DEFERRED_JOIN_OPERATION_FACTORIES[name] ??
      forwardingDeferredJoinOperation;
    (DeferredJoinedStream.prototype as any)[name] = factory(name);
  }
}

wireDeferredJoinedStream();

/**
 * Wraps `raw` into a {@link DeferredJoinedStream}. The wrapper keeps the
 * raw stages as its own (an unobservable fallback, since every operation
 * is overridden) while `build()` serializes the materialized pipeline, so
 * a wrapper embedded as an argument of another query never leaks rows
 * without the joined fields.
 */
export function wrapDeferredJoined(
  db: SchemaInstance<any>,
  meta: DataAPIMeta,
  names: Set<string>,
  raw: Stream<any>,
): Stream<any> {
  const wrapped: DeferredJoinedStream = Object.create(
    DeferredJoinedStream.prototype,
  );
  (wrapped as any).stages = raw.build();
  wrapped.deferredJoin = { db, meta, names, raw };
  return wrapped;
}
