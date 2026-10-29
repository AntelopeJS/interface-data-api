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
    // SAFETY: pagedDeferredJoinOperation is registered only under the slice key of DEFERRED_JOIN_OPERATION_FACTORIES, so name is always "slice", which every Stream has; raw is the Stream given to wrapDeferredJoined.
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
    // SAFETY: rawDeferredJoinOperation is registered only under the changes key of DEFERRED_JOIN_OPERATION_FACTORIES, so name is always "changes", which every Stream has; raw is the Stream given to wrapDeferredJoined.
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
      // SAFETY: fieldAggregateDeferredJoinOperation is registered only under count, sum, avg, min, max and distinct, all Stream methods, and bareTarget is a Stream (raw, or the Stream Joined returns for it).
      return (bareTarget as any)[name]();
    }
    const target = names.has(field)
      ? Joined(db, meta, raw, new Set([field]))
      : raw;
    // SAFETY: name is one of count, sum, avg, min, max and distinct, all Stream methods (see the factory table), and target is a Stream (raw, or the Stream Joined returns for it).
    return (target as any)[name](field);
  };
}

function forwardingDeferredJoinOperation(
  name: string,
): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, ...args: any[]) {
    // SAFETY: name comes from wireDeferredJoinedStream, which lists the own method names of Stream.prototype plus run, cursor and build, all present on any Stream, and Joined returns a Stream for the raw Stream it is given.
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
    // SAFETY: name is a method name of Stream.prototype (or run, cursor, build), so the key is a writable data property on DeferredJoinedStream's prototype chain and assigning a function to it cannot throw; each installed operation takes the arguments of the Stream method it replaces.
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
  // SAFETY: Object.create skips the StagedObject constructor that sets the protected stages field, so this assigns the same field, the stage list of raw, that the constructor would have set.
  (wrapped as any).stages = raw.build();
  wrapped.deferredJoin = { db, meta, names, raw };
  return wrapped;
}
