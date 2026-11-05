import { Controller } from "@antelopejs/interface-api";
import type { Class, DecoratorTarget } from "@antelopejs/interface-core/decorators";
import { RegisterTable, Table } from "@antelopejs/interface-database-decorators";

import { DataController, GetDataControllerMeta } from "../../../src/index.ts";
import { Access, Computed, type DataAPIMeta, Joined, Listable } from "../../../src/metadata.ts";
import { type Case, type ClassDecl, classNames, type Declaration, type Op } from "./cases.ts";

const SCHEMA = "formal-field-access";
const JOINED_TABLE = "formal-field-access-other";

class Row extends Table {}
RegisterTable("formal-field-access-rows", SCHEMA)(Row);

class Other extends Table {}
RegisterTable(JOINED_TABLE, SCHEMA)(Other);

/** One accessor call the check's getters and setters record: which class's accessor ran, on which field, with what. */
export interface AccessorCall {
  owner: string;
  field: string;
  kind: "get" | "set";
  value?: string;
}

/** A controller class the check built, with its metadata, the name it prints under and what it declares. */
export interface Built {
  name: string;
  cls: Class<object>;
  meta: DataAPIMeta;
  decl: ClassDecl;
}

/** A getter answers `get:<class>:<field>`; the class is the one whose prototype holds the accessor. */
export function getterValue(owner: string, field: string): string {
  return `get:${owner}:${field}`;
}

export function usesGetter(declared: Declaration): boolean {
  return declared === "getter" || declared === "accessor";
}

export function usesSetter(declared: Declaration): boolean {
  return declared === "setter" || declared === "accessor";
}

/** The class defaults of a declaration: `name = "default:<name>"` for each defaulted property. */
export function defaultsOf(decl: ClassDecl): Map<string, string> {
  const defaults = new Map<string, string>();
  for (const [name, fieldDecl] of Object.entries(decl)) {
    if (fieldDecl.declared === "defaulted") defaults.set(name, `default:${name}`);
  }
  return defaults;
}

function defineAccessors(
  prototype: DecoratorTarget,
  owner: string,
  field: string,
  declared: Declaration,
  log: AccessorCall[],
) {
  if (!usesGetter(declared) && !usesSetter(declared)) return;
  const descriptor: PropertyDescriptor = { configurable: true, enumerable: false };
  if (usesGetter(declared)) {
    descriptor.get = () => {
      log.push({ owner, field, kind: "get" });
      return getterValue(owner, field);
    };
  }
  if (usesSetter(declared)) {
    descriptor.set = (value: string | undefined) => {
      log.push({ owner, field, kind: "set", value });
    };
  }
  Object.defineProperty(prototype, field, descriptor);
}

/**
 * Applies one decorator as TypeScript's `__decorate` does: a property passes
 * no descriptor, an accessor passes its own property descriptor.
 */
function decorate(op: Op, prototype: DecoratorTarget, field: string, descriptor: PropertyDescriptor | undefined) {
  switch (op.decorator) {
    case "Access": {
      const decorator = Access(op.mode, op.overrides);
      if (descriptor) decorator(prototype, field, descriptor);
      else decorator(prototype, field);
      return;
    }
    case "Computed":
      Computed(() => 0)(prototype, field);
      return;
    case "Joined":
      Joined({ table: JOINED_TABLE, localKey: op.localKey, remoteField: "value" })(prototype, field);
      return;
    case "Listable": {
      const decorator = Listable(op.required, op.mode);
      if (descriptor) decorator(prototype, field, descriptor);
      else decorator(prototype, field);
    }
  }
}

/**
 * Declares one controller class as a module author would: it extends
 * `DataController(Row, {}, Controller(location[, parent]))`, defines its
 * accessors, then runs each field's decorators bottom-up. The metadata is read
 * through `GetDataControllerMeta`, as the routes read it.
 */
function declareClass(name: string, decl: ClassDecl, log: AccessorCall[], parent?: Built): Built {
  const base = parent
    ? DataController(Row, {}, Controller(`/${name}`, parent.cls))
    : DataController(Row, {}, Controller(`/${name}`));
  const defaults = Object.fromEntries(defaultsOf(decl));
  const cls = class extends base {
    constructor() {
      super();
      Object.assign(this, defaults);
    }
  };
  Object.defineProperty(cls, "name", { value: name });
  for (const [field, fieldDecl] of Object.entries(decl)) {
    defineAccessors(cls.prototype, name, field, fieldDecl.declared, log);
    const descriptor = Object.getOwnPropertyDescriptor(cls.prototype, field);
    for (const op of fieldDecl.ops) decorate(op, cls.prototype, field, descriptor);
  }
  return { name, cls, meta: GetDataControllerMeta(new cls()), decl };
}

/** The classes of a case in definition order, and the accessor log they share. */
export interface BuiltCase {
  classes: Built[];
  log: AccessorCall[];
}

/** Builds the classes of a case in definition order, sharing one accessor log. */
export function build(testCase: Case): BuiltCase {
  const log: AccessorCall[] = [];
  const [parentName, ...childNames] = classNames(testCase);
  const parent = declareClass(parentName, testCase.parent, log);
  const children = testCase.children.map((decl, index) => declareClass(childNames[index], decl, log, parent));
  return { classes: [parent, ...children], log };
}
