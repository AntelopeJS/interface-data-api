import { Query } from "../../../src/components.ts";
import { AccessMode, type StoredRow } from "../../../src/metadata.ts";
import { type AccessorCall, type Built, defaultsOf, getterValue, usesGetter, usesSetter } from "./build.ts";
import { type Case, type ClassDecl, classNames, DB_ONLY_KEY, type Declaration, type Op } from "./cases.ts";

export type Rule =
  | "ReadNoLeak"
  | "ReadComplete"
  | "WriteGated"
  | "WriteComplete"
  | "ComputedReadOnly"
  | "ListPluck";

export const RULES: Rule[] = [
  "ReadNoLeak",
  "ReadComplete",
  "WriteGated",
  "WriteComplete",
  "ComputedReadOnly",
  "ListPluck",
];

/** One rule a class broke, and what the check saw, in the code's words. */
export interface Violation {
  rule: Rule;
  detail: string;
}

/**
 * What a field's declarations promise, read as their TSDoc states it.
 * `@Access` sets the mode and replaces the override table. `@Computed` and
 * `@Joined` make the field read-only, and keep the override table, which no
 * doc mentions. `@Listable` adds the field to a list mode with the database
 * names it selects, plus itself and its local key once it is joined.
 * `@Access` and `@Listable` hand the framework the accessor's descriptor
 * (`setDescriptor`, "the known field descriptor"); `@Computed` and `@Joined`
 * are property decorators and see none, so an accessor they alone decorate
 * stays unknown, and the field is read and written as a plain property.
 */
interface FieldPromise {
  declared: Declaration;
  mode?: AccessMode;
  overrides?: Record<string, AccessMode>;
  derived: boolean;
  listable: boolean;
  /** Some decorator names the field, so `WriteProperties` stores its class default on creation. */
  decorated: boolean;
  /** The class whose accessor the framework knows: the last to write `@Access` or `@Listable` on the field. */
  accessorOwner?: string;
  joinedKey?: string;
  selects: Map<string, Set<string>>;
}

/** One class of a case, under the name it was built with. */
interface Declared {
  name: string;
  decl: ClassDecl;
}

/** A decorator with the class that wrote it. */
interface Written {
  owner: string;
  op: Op;
}

/** The actions the routes pass, a custom one, the default action by name, and none. */
const ACTIONS: (string | undefined)[] = ["get", "list", "new", "edit", "custom", "_default", undefined];

function promiseOf(name: string, declared: Declaration, ops: Written[]): FieldPromise {
  const promise: FieldPromise = {
    declared,
    derived: false,
    listable: false,
    decorated: ops.length > 0,
    selects: new Map(),
  };
  for (const { owner, op } of ops) {
    switch (op.decorator) {
      case "Access":
        promise.mode = op.mode;
        promise.overrides = op.overrides;
        promise.accessorOwner = owner;
        break;
      case "Computed":
        promise.derived = true;
        promise.mode = AccessMode.ReadOnly;
        break;
      case "Joined":
        promise.derived = true;
        promise.mode = AccessMode.ReadOnly;
        promise.joinedKey = op.localKey;
        for (const names of promise.selects.values()) {
          if (names.size > 0) names.add(name).add(op.localKey);
        }
        break;
      case "Listable": {
        promise.listable = true;
        promise.accessorOwner = owner;
        const base = op.required === true ? [name] : op.required === false ? [] : op.required;
        const names = new Set(base);
        if (names.size > 0 && promise.joinedKey) names.add(name).add(promise.joinedKey);
        promise.selects.set(op.mode ?? "list", names);
      }
    }
  }
  return promise;
}

/** The promises of a class: its parent's declarations, then its own, per field. */
function promisesOf(chain: Declared[]): Map<string, FieldPromise> {
  const promises = new Map<string, FieldPromise>();
  const names = new Set(chain.flatMap(({ decl }) => Object.keys(decl)));
  for (const name of names) {
    const own = chain.flatMap(({ name: owner, decl }) =>
      Object.hasOwn(decl, name) ? [{ owner, field: decl[name] }] : [],
    );
    const ops = own.flatMap(({ owner, field }) => field.ops.map((op) => ({ owner, op })));
    promises.set(name, promiseOf(name, own[0].field.declared, ops));
  }
  return promises;
}

function effective(promise: FieldPromise, action: string | undefined): AccessMode | undefined {
  if (action === undefined || action === "_default") return promise.mode;
  const overrides = promise.overrides;
  if (overrides && Object.hasOwn(overrides, action)) return overrides[action];
  return promise.mode;
}

function canRead(promise: FieldPromise, action: string | undefined): boolean {
  return ((effective(promise, action) ?? 0) & AccessMode.ReadOnly) !== 0;
}

function canWrite(promise: FieldPromise, action: string | undefined): boolean {
  return ((effective(promise, action) ?? 0) & AccessMode.WriteOnly) !== 0;
}

/** The class whose setter the framework runs for the field, if it knows one. */
function knownSetter(promise: FieldPromise | undefined): string | undefined {
  return promise && usesSetter(promise.declared) ? promise.accessorOwner : undefined;
}

function json(value: string | string[] | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function label(action: string | undefined, extra?: string): string {
  const parts = [action === undefined ? "no action" : json(action), ...(extra ? [extra] : [])];
  return parts.join(", ");
}

/** A row or body: `<prefix>:<name>` for each field and for the key no field declares. */
function valuesOf(names: string[], prefix: string): Map<string, string> {
  return new Map([...names, DB_ONLY_KEY].map((name) => [name, `${prefix}:${name}`]));
}

/** The bodies a write receives: every field, no field, and, with several fields, the first alone. */
function bodiesOf(names: string[]): Map<string, string>[] {
  const bodies = [valuesOf(names, "body"), new Map<string, string>()];
  if (names.length > 1) bodies.push(valuesOf(names.slice(0, 1), "body"));
  return bodies;
}

/** One class under check: the instance the routes would hold, its promises, and the accessor log it writes to. */
interface Observed {
  built: Built;
  instance: object;
  promises: Map<string, FieldPromise>;
  names: string[];
  log: AccessorCall[];
}

async function checkReads({ built, instance, promises, names, log }: Observed): Promise<Violation[]> {
  const violations: Violation[] = [];
  const add = (rule: Rule, detail: string) => violations.push({ rule, detail });
  for (const action of ACTIONS) {
    for (const onlyList of [false, true]) {
      const row = valuesOf(names, "row");
      const where = `${built.name}.ReadProperties(${label(action, onlyList ? "onlyList" : undefined)})`;
      log.length = 0;
      const answered = await Query.ReadProperties(instance, built.meta, Object.fromEntries(row), action, onlyList);
      const readable = names.filter((name) => {
        const promise = promises.get(name);
        return promise !== undefined && canRead(promise, action) && (!onlyList || promise.listable);
      });
      for (const key of Object.keys(answered)) {
        if (!readable.includes(key)) add("ReadNoLeak", `${where} answers ${key}`);
      }
      for (const call of log) {
        if (call.kind === "get" && !readable.includes(call.field)) {
          add("ReadNoLeak", `${where} runs the getter of ${call.field}`);
        }
      }
      for (const name of readable) {
        const promise = promises.get(name);
        const owner = promise?.accessorOwner;
        const expected =
          promise && owner !== undefined && usesGetter(promise.declared) ? getterValue(owner, name) : row.get(name);
        if (!Object.hasOwn(answered, name)) add("ReadComplete", `${where} lacks ${name}`);
        else if (answered[name] !== expected) {
          add("ReadComplete", `${where} answers ${name} as ${JSON.stringify(answered[name])}, not ${json(expected)}`);
        }
      }
    }
  }
  return violations;
}

/** One write the check ran, with what the promises expect of it. */
interface Write {
  where: string;
  result: StoredRow;
  /** The row the write starts from: the stored row, or the class defaults of the decorated fields. */
  start: Map<string, string>;
  body: Map<string, string>;
  /** The fields the promises let this write store. */
  written: string[];
  log: AccessorCall[];
}

function gatedViolations({ where, result, start, body, written, log }: Write, promises: Map<string, FieldPromise>) {
  const violations: Violation[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (start.has(key) && start.get(key) === value) continue;
    if (written.includes(key) && knownSetter(promises.get(key)) === undefined && value === body.get(key)) continue;
    violations.push({ rule: "WriteGated", detail: `${where} writes ${key} = ${JSON.stringify(value)}` });
  }
  for (const key of start.keys()) {
    if (!Object.hasOwn(result, key)) violations.push({ rule: "WriteGated", detail: `${where} drops ${key}` });
  }
  for (const call of log) {
    if (call.kind === "set" && !written.includes(call.field)) {
      violations.push({ rule: "WriteGated", detail: `${where} runs the setter of ${call.field}` });
    }
  }
  return violations;
}

function completeViolations({ where, result, body, written, log }: Write, promises: Map<string, FieldPromise>) {
  const violations: Violation[] = [];
  for (const name of written) {
    const owner = knownSetter(promises.get(name));
    if (owner !== undefined) {
      const ran = log.some(
        (call) => call.kind === "set" && call.field === name && call.owner === owner && call.value === body.get(name),
      );
      if (!ran) {
        violations.push({
          rule: "WriteComplete",
          detail: `${where} does not run ${owner}'s setter of ${name} with ${json(body.get(name))}`,
        });
      }
    } else if (!Object.hasOwn(result, name) || result[name] !== body.get(name)) {
      violations.push({
        rule: "WriteComplete",
        detail: `${where} writes ${name} as ${JSON.stringify(result[name])}, not ${json(body.get(name))}`,
      });
    }
  }
  return violations;
}

function derivedViolations({ where, result, start, log }: Write, promises: Map<string, FieldPromise>) {
  const violations: Violation[] = [];
  for (const [name, promise] of promises) {
    if (!promise.derived) continue;
    const untouched = start.has(name)
      ? Object.hasOwn(result, name) && result[name] === start.get(name)
      : !Object.hasOwn(result, name);
    if (!untouched) {
      violations.push({
        rule: "ComputedReadOnly",
        detail: `${where} writes the computed or joined field ${name} = ${JSON.stringify(result[name])}`,
      });
    }
    if (log.some((call) => call.kind === "set" && call.field === name)) {
      violations.push({
        rule: "ComputedReadOnly",
        detail: `${where} runs the setter of the computed or joined field ${name}`,
      });
    }
  }
  return violations;
}

async function checkWrite(
  { built, instance, promises, names, log }: Observed,
  action: string | undefined,
  body: Map<string, string>,
  stored: Map<string, string> | undefined,
): Promise<Violation[]> {
  const how = `${stored ? "edit" : "new"} with ${json([...body.keys()])}`;
  const where = `${built.name}.WriteProperties(${label(action, how)})`;
  log.length = 0;
  const result = await Query.WriteProperties(
    instance,
    built.meta,
    Object.fromEntries(body),
    action,
    stored ? Object.fromEntries(stored) : undefined,
  );
  const written = names.filter((name) => {
    const promise = promises.get(name);
    return promise !== undefined && canWrite(promise, action) && (stored === undefined || body.has(name));
  });
  const defaults = [...defaultsOf(built.decl)].filter(([name]) => promises.get(name)?.decorated);
  const write: Write = { where, result, start: stored ?? new Map(defaults), body, written, log };
  return [
    ...gatedViolations(write, promises),
    ...completeViolations(write, promises),
    ...derivedViolations(write, promises),
  ];
}

function checkPluck({ built, promises }: Observed): Violation[] {
  const violations: Violation[] = [];
  const expected = new Map<string, Set<string>>();
  for (const promise of promises.values()) {
    for (const [mode, names] of promise.selects) {
      const set = expected.get(mode) ?? new Set<string>();
      for (const name of names) set.add(name);
      expected.set(mode, set);
    }
  }
  const modes = new Set([...expected.keys(), ...Object.keys(built.meta.pluck)]);
  for (const mode of modes) {
    const got = Object.hasOwn(built.meta.pluck, mode) ? [...built.meta.pluck[mode]].sort() : undefined;
    const want = expected.has(mode) ? [...(expected.get(mode) ?? [])].sort() : undefined;
    if (json(got) !== json(want)) {
      violations.push({ rule: "ListPluck", detail: `${built.name}.pluck.${mode} is ${json(got)}, not ${json(want)}` });
    }
  }
  return violations;
}

/**
 * Every rule a case breaks, over every class the case declares: each class
 * is read and written for every action, as the routes do, and compared with
 * what its own declarations and its parent's promise.
 */
export async function checkCase(testCase: Case, classes: Built[], log: AccessorCall[]): Promise<Violation[]> {
  const violations: Violation[] = [];
  const names = classNames(testCase);
  for (const [index, built] of classes.entries()) {
    const parent = { name: names[0], decl: testCase.parent };
    const chain = index === 0 ? [parent] : [parent, { name: names[index], decl: testCase.children[index - 1] }];
    const promises = promisesOf(chain);
    const observed: Observed = { built, instance: new built.cls(), promises, names: [...promises.keys()], log };
    violations.push(...(await checkReads(observed)));
    for (const action of ACTIONS) {
      for (const body of bodiesOf(observed.names)) {
        for (const stored of [undefined, valuesOf(observed.names, "stored")]) {
          violations.push(...(await checkWrite(observed, action, body, stored)));
        }
      }
    }
    violations.push(...checkPluck(observed));
  }
  return violations;
}
