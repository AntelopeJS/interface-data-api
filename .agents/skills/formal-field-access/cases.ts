import { AccessMode } from "../../../src/metadata.ts";

/** A decorator a controller writes on a field, with the arguments the check varies. */
export type Op =
  | { decorator: "Access"; mode: AccessMode; overrides?: Record<string, AccessMode> }
  | { decorator: "Computed" }
  | { decorator: "Joined"; localKey: string }
  | { decorator: "Listable"; required: boolean | string[]; mode?: string };

/**
 * How a controller class declares a field: `declare a`, `a = "default:a"`,
 * `get a()`, `set a(value)`, or both accessors.
 */
export type Declaration = "property" | "defaulted" | "getter" | "setter" | "accessor";

/** A field as one class declares it, its decorators in the order they run: the bottom one first. */
export interface FieldDecl {
  declared: Declaration;
  ops: Op[];
}

/** The fields of one controller class, by name. */
export type ClassDecl = Record<string, FieldDecl>;

/**
 * One case: a parent controller, then the derived controllers defined after
 * it in order, each extending the parent. A case with no child is one
 * controller on its own.
 */
export interface Case {
  parent: ClassDecl;
  children: ClassDecl[];
}

export type Configuration = "single" | "pair" | "derived";
export type Mode = "ci" | "full";

export const CONFIGURATIONS: Configuration[] = ["single", "pair", "derived"];

/** The database key no field declares: the row holds it, a body sends it, `@Listable([...])` and `@Joined` may name it. */
export const DB_ONLY_KEY = "k";

const { ReadOnly, WriteOnly, ReadWrite } = AccessMode;
const MODES = [ReadOnly, WriteOnly, ReadWrite];
const OVERRIDES: (Record<string, AccessMode> | undefined)[] = [
  undefined,
  { get: ReadOnly },
  { get: WriteOnly },
  { new: ReadWrite },
  { edit: ReadWrite },
  { custom: ReadWrite },
  { _default: WriteOnly },
  { get: WriteOnly, new: ReadWrite },
];
const ALL_DECLARATIONS: Declaration[] = ["property", "defaulted", "getter", "setter", "accessor"];
const MAIN_DECLARATIONS: Declaration[] = ["property", "accessor"];

function access(mode: AccessMode, overrides?: Record<string, AccessMode>): Op {
  return { decorator: "Access", mode, overrides };
}

/** Every decorator the check writes on a field, next to `other` (a second field or {@link DB_ONLY_KEY}). */
function fullAlphabet(other: string): Op[] {
  return [
    ...MODES.flatMap((mode) => OVERRIDES.map((overrides) => access(mode, overrides))),
    { decorator: "Computed" },
    { decorator: "Joined", localKey: other },
    { decorator: "Listable", required: true },
    { decorator: "Listable", required: false },
    { decorator: "Listable", required: [other] },
    { decorator: "Listable", required: true, mode: "detailed" },
  ];
}

/** The alphabet of the longer sequences: each decorator once, plus the two override tables the docs show. */
function coreAlphabet(other: string): Op[] {
  return [
    access(ReadOnly),
    access(WriteOnly),
    access(ReadWrite),
    access(ReadOnly, { new: ReadWrite }),
    access(ReadWrite, { edit: ReadOnly }),
    { decorator: "Computed" },
    { decorator: "Joined", localKey: other },
    { decorator: "Listable", required: true },
    { decorator: "Listable", required: [other] },
  ];
}

/** Every sequence of `min` to `max` symbols of `alphabet`, shortest first. */
function sequences(alphabet: Op[], min: number, max: number): Op[][] {
  let layer: Op[][] = [[]];
  const all: Op[][] = min === 0 ? [[]] : [];
  for (let length = 1; length <= max; length++) {
    layer = layer.flatMap((sequence) => alphabet.map((op) => [...sequence, op]));
    if (length >= min) all.push(...layer);
  }
  return all;
}

function field(declared: Declaration, ops: Op[]): FieldDecl {
  return { declared, ops };
}

function singleCases(mode: Mode): Case[] {
  const alphabet = fullAlphabet(DB_ONLY_KEY);
  const cases: Case[] = [];
  const add = (declarations: Declaration[], ops: Op[][]) => {
    for (const declared of declarations) {
      for (const sequence of ops) cases.push({ parent: { a: field(declared, sequence) }, children: [] });
    }
  };
  const others = ALL_DECLARATIONS.filter((declared) => !MAIN_DECLARATIONS.includes(declared));
  if (mode === "ci") {
    add(MAIN_DECLARATIONS, sequences(alphabet, 0, 2));
    add(others, sequences(alphabet, 0, 1));
    add(MAIN_DECLARATIONS, sequences(coreAlphabet(DB_ONLY_KEY), 3, 3));
  } else {
    add(["property"], sequences(alphabet, 0, 3));
    add(["accessor"], sequences(coreAlphabet(DB_ONLY_KEY), 3, 3));
    add([...others, "accessor"], sequences(alphabet, 0, 2));
  }
  return cases;
}

function pairCases(mode: Mode): Case[] {
  const first = sequences(coreAlphabet("b"), 0, 2);
  const second = sequences(coreAlphabet("a"), 0, mode === "ci" ? 1 : 2);
  const cases: Case[] = [];
  for (const declaredA of ["property"] as const) {
    for (const declaredB of ["defaulted", "setter"] as const) {
      for (const opsA of first) {
        for (const opsB of second) {
          cases.push({ parent: { a: field(declaredA, opsA), b: field(declaredB, opsB) }, children: [] });
        }
      }
    }
  }
  return cases;
}

function derivedCases(mode: Mode): Case[] {
  const alphabet = coreAlphabet(DB_ONLY_KEY);
  const parents = sequences(alphabet, 0, 1);
  const firstChildren = sequences(alphabet, 0, mode === "ci" ? 1 : 2);
  const siblings: Op[][] = [[], [access(ReadOnly)], [{ decorator: "Listable", required: true }]];
  const cases: Case[] = [];
  for (const declared of MAIN_DECLARATIONS) {
    for (const opsP of parents) {
      for (const opsA of firstChildren) {
        for (const opsB of siblings) {
          cases.push({
            parent: { a: field(declared, opsP) },
            children: [{ a: field(declared, opsA) }, { a: field(declared, opsB) }],
          });
        }
      }
    }
  }
  return cases;
}

/** The cases of a configuration within a mode's bounds, in a fixed order. */
export function casesOf(configuration: Configuration, mode: Mode): Case[] {
  switch (configuration) {
    case "single":
      return singleCases(mode);
    case "pair":
      return pairCases(mode);
    case "derived":
      return derivedCases(mode);
  }
}

/** The class names a case prints and builds under: `C` alone, else `P` and its children `A`, `B`, … */
export function classNames(testCase: Case): string[] {
  if (testCase.children.length === 0) return ["C"];
  return ["P", ...testCase.children.map((_, index) => String.fromCharCode(65 + index))];
}

function printMode(mode: AccessMode): string {
  return `AccessMode.${AccessMode[mode]}`;
}

function printOverrides(overrides: Record<string, AccessMode>): string {
  const entries = Object.entries(overrides).map(([action, mode]) => `${action}: ${printMode(mode)}`);
  return `{ ${entries.join(", ")} }`;
}

/** A decorator as a developer writes it. */
export function printOp(op: Op): string {
  switch (op.decorator) {
    case "Access":
      return op.overrides
        ? `@Access(${printMode(op.mode)}, ${printOverrides(op.overrides)})`
        : `@Access(${printMode(op.mode)})`;
    case "Computed":
      return "@Computed(expr)";
    case "Joined":
      return `@Joined({ table, localKey: ${JSON.stringify(op.localKey)}, remoteField })`;
    case "Listable": {
      const args = [JSON.stringify(op.required), ...(op.mode ? [JSON.stringify(op.mode)] : [])];
      return `@Listable(${op.required === true && !op.mode ? "" : args.join(", ")})`;
    }
  }
}

function printDeclaration(name: string, declared: Declaration): string {
  switch (declared) {
    case "property":
      return `declare ${name}`;
    case "defaulted":
      return `${name} = "default:${name}"`;
    case "getter":
      return `get ${name}()`;
    case "setter":
      return `set ${name}(v)`;
    case "accessor":
      return `get ${name}() / set ${name}(v)`;
  }
}

/** A field with its decorators top to bottom, as a developer writes them. */
function printField(name: string, decl: FieldDecl): string {
  const decorators = [...decl.ops].reverse().map(printOp);
  return [...decorators, printDeclaration(name, decl.declared)].join(" ");
}

function printClass(name: string, decl: ClassDecl, parent?: string): string {
  const head = parent ? `${name} extends ${parent}` : name;
  const fields = Object.entries(decl).map(([field, fieldDecl]) => printField(field, fieldDecl));
  return `${head} { ${fields.join("; ")} }`;
}

/** A case as source, one class after the other in definition order. */
export function printCase(testCase: Case): string {
  const [parent, ...children] = classNames(testCase);
  return [
    printClass(parent, testCase.parent),
    ...testCase.children.map((child, index) => printClass(children[index], child, parent)),
  ].join(" ");
}

/** How many decorators a case writes, over every class: the first measure of its size. */
export function opCount(testCase: Case): number {
  return [testCase.parent, ...testCase.children]
    .flatMap((decl) => Object.values(decl))
    .reduce((count, decl) => count + decl.ops.length, 0);
}
