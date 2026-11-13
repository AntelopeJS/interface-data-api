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

type StreamOperation<S extends Stream<any>> = (
  this: S,
  ...args: any[]
) => ReturnType<Stream<any>[keyof Stream<any>]>;

type DeferredJoinedOperation = StreamOperation<DeferredJoinedStream>;

/** The methods of a stream, keyed by name. */
interface StreamOperations<S extends Stream<any>> {
  [name: string]: StreamOperation<S>;
}

/**
 * `stream` viewed as its methods by name, read and written only under the
 * names {@link wireDeferredJoinedStream} lists.
 */
function operationsOf<S extends Stream<any>>(
  stream: S,
): S & StreamOperations<S> {
  // SAFETY: callers index the result only with a name wireDeferredJoinedStream lists (an own method name of Stream.prototype, or run, cursor or build), each a method on the prototype chain of every Stream that returns one of Stream's member return types, and they write only such an operation under such a name.
  return stream as S & StreamOperations<S>;
}

function materializeDeferredJoin(stream: DeferredJoinedStream) {
  const { db, meta, names, raw } = stream.deferredJoin;
  return Joined(db, meta, raw, names);
}

function pagedDeferredJoinOperation(): DeferredJoinedOperation {
  return function (
    this: DeferredJoinedStream,
    ...args: Parameters<Stream<any>["slice"]>
  ) {
    const { db, meta, names, raw } = this.deferredJoin;
    return Joined(db, meta, raw.slice(...args), names);
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

/**
 * `cast` changes only the row type, so the wrapper answers itself and keeps
 * its deferred joins; a `Stream` built from the wrapper would copy its raw
 * stages and drop them.
 */
function castDeferredJoinOperation(): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream) {
    return this;
  };
}

function rawDeferredJoinOperation(): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream) {
    return this.deferredJoin.raw.changes();
  };
}

type FieldAggregate = "count" | "sum" | "avg" | "min" | "max" | "distinct";

function aggregate(stream: Stream<any>, name: FieldAggregate, field?: string) {
  switch (name) {
    case "count":
      return stream.count(field);
    case "sum":
      return stream.sum(field);
    case "avg":
      return stream.avg(field);
    case "min":
      return stream.min(field);
    case "max":
      return stream.max(field);
    case "distinct":
      return field === undefined ? stream.distinct() : stream.distinct(field);
  }
}

function fieldAggregateDeferredJoinOperation(
  name: FieldAggregate,
  bareCallOnRaw: boolean,
): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, field?: string) {
    const { db, meta, names, raw } = this.deferredJoin;
    if (!field) {
      const bareTarget = bareCallOnRaw ? raw : materializeDeferredJoin(this);
      return aggregate(bareTarget, name);
    }
    const target = names.has(field)
      ? Joined(db, meta, raw, new Set([field]))
      : raw;
    return aggregate(target, name, field);
  };
}

function forwardingDeferredJoinOperation(
  name: string,
): DeferredJoinedOperation {
  return function (this: DeferredJoinedStream, ...args: any[]) {
    const materialized = materializeDeferredJoin(this);
    return operationsOf(materialized)[name].apply(materialized, args);
  };
}

/** The operation a {@link DeferredJoinedStream} installs for a stream method. */
const DEFERRED_JOIN_OPERATION_FACTORIES = new Map<
  string,
  (name: string) => DeferredJoinedOperation
>([
  ["slice", pagedDeferredJoinOperation],
  ["nth", nthDeferredJoinOperation],
  ["cast", castDeferredJoinOperation],
  ["changes", rawDeferredJoinOperation],
  ["count", () => fieldAggregateDeferredJoinOperation("count", true)],
  ["sum", () => fieldAggregateDeferredJoinOperation("sum", false)],
  ["avg", () => fieldAggregateDeferredJoinOperation("avg", false)],
  ["min", () => fieldAggregateDeferredJoinOperation("min", false)],
  ["max", () => fieldAggregateDeferredJoinOperation("max", false)],
  ["distinct", () => fieldAggregateDeferredJoinOperation("distinct", false)],
]);

const DEFERRED_JOIN_INHERITED_OPERATIONS = new Set(["constructor"]);

function wireDeferredJoinedStream() {
  const operationNames = [
    ...Object.getOwnPropertyNames(Stream.prototype),
    "run",
    "cursor",
    "build",
  ].filter((name) => !DEFERRED_JOIN_INHERITED_OPERATIONS.has(name));
  for (const name of operationNames) {
    const factory =
      DEFERRED_JOIN_OPERATION_FACTORIES.get(name) ??
      forwardingDeferredJoinOperation;
    operationsOf(DeferredJoinedStream.prototype)[name] = factory(name);
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
  const stages = raw.build();
  const wrapped = new DeferredJoinedStream(stages[0]);
  Object.assign(wrapped, { stages });
  wrapped.deferredJoin = { db, meta, names, raw };
  return wrapped;
}
