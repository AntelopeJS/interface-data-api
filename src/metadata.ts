import { GetMetadata } from "@antelopejs/interface-core";
import type { ContainerModifier } from "@antelopejs/interface-database-decorators/modifiers/common";
import {
  DatumStaticMetadata,
  getMetadata,
  type Table,
} from "@antelopejs/interface-database-decorators";
import {
  type Class,
  MakeMethodAndPropertyDecorator,
  MakePropertyDecorator,
} from "@antelopejs/interface-core/decorators";

import type { DataControllerCallbackWithOptions } from "./internal/controller-types";
import {
  createDefaultFilter,
  type DefaultFilterFunction,
} from "./internal/default-filter";
import type {
  FieldValidator,
  FieldData,
  ComputedExpression,
  ComputedOptions,
  FilterValue,
  FieldFilter,
  FilterFunction,
  ForeignOptions,
  ReadableAccessFields,
  WritableAccessFields,
} from "./internal/field-types";
import {
  listedNames,
  merge,
  rebuildPluck,
  targetJoinedFields,
} from "./internal/meta-records";
import { isString } from "./internal/guards";
import { resolveTableReference } from "./internal/table-reference";

export type {
  DataControllerCallback,
  DataControllerCallbackWithOptions,
  ExtractCallback,
  DataControllerDef,
  ExtractDefCallbacks,
} from "./internal/controller-types";
export type {
  ForeignJoinedRef,
  FieldParseSuccess,
  FieldParseFailure,
  FieldParseResult,
  FieldValidationResult,
  FieldValue,
  FieldValues,
  ForeignOptions,
  FieldValidator,
  FieldData,
  ComputedExpression,
  ComputedOptions,
  ComputedFieldData,
  FilterValue,
  FieldFilter,
  FilterFunction,
  ReadableAccessFields,
  WritableAccessFields,
} from "./internal/field-types";

/**
 * Field access mode enum.
 */
export enum AccessMode {
  ReadOnly = 1,
  WriteOnly = 2,
  ReadWrite = 3,
}

/** The action whose access is a field's own `mode`, overrides aside. */
const DEFAULT_ACTION = "_default";

/**
 * The access a field has in one data API action (`get`, `list`, `new`,
 * `edit`…): its {@link FieldData.modeOverrides} entry for that action, else
 * its {@link FieldData.mode}. Without an action, or for `_default`, the
 * field's own mode.
 */
export function GetEffectiveMode(
  field: Pick<FieldData, "mode" | "modeOverrides">,
  action?: string,
): AccessMode | undefined {
  if (!action || action === DEFAULT_ACTION) return field.mode;
  return field.modeOverrides?.[action] ?? field.mode;
}

function isFilterList(filter: FieldFilter): filter is FilterValue[] {
  return Array.isArray(filter[0]);
}

/** The filters of one field as a list, whether it holds one or several. */
export function FilterValuesOf(filter: FieldFilter): FilterValue[] {
  return isFilterList(filter) ? filter : [filter];
}

/**
 * Metadata Class containing the DataAPI information.
 */
export class DataAPIMeta {
  /** Key symbol. */
  public static key = Symbol.for(
    "@antelopejs/interface-data-api/DataAPIMeta@1",
  );

  public readonly filters: Record<string, FilterFunction<any, any>> = {};

  /** Fields information. */
  public readonly fields: Record<string, FieldData> = {};

  /** Fields to pluck in listing endpoints. */
  public readonly pluck: Record<string, Set<string>> = {};

  /** Key of the DataAPI class containing a database table instance. */
  public modelKey?: PropertyKey;

  /** Keys of the DataAPI class containing database modifier keys. */
  public modifierKeys = new Map<typeof ContainerModifier<any>, PropertyKey>();

  /** Schema name where the table is registered. */
  public schemaName!: string;

  /** Database Schema class. */
  public tableClass!: Class;

  /** Database Schema table name. */
  public tableName!: string;

  /** Readable fields. */
  public readonly readable: Record<string, ReadableAccessFields> = {};

  /** Writeable fields. */
  public readonly writable: Record<string, WritableAccessFields> = {};

  /** Registered DataAPI endpoints. */
  public readonly endpoints: Record<string, DataControllerCallbackWithOptions> =
    {};

  constructor(public readonly target: Class) {}

  public inherit(parent: DataAPIMeta) {
    merge(parent.filters, this.filters);
    merge(parent.fields, this.fields);
    for (const [key, list] of Object.entries(parent.pluck)) {
      this.pluck[key] = new Set(list);
    }
    this.modelKey ??= parent.modelKey;
    for (const key of parent.modifierKeys.keys()) {
      if (!this.modifierKeys.has(key)) {
        const value = parent.modifierKeys.get(key);
        if (value !== undefined) this.modifierKeys.set(key, value);
      }
    }
    this.recomputeAccess();
    merge(parent.endpoints, this.endpoints);
    this.tableClass = parent.tableClass;
    this.tableName = parent.tableName;
    this.schemaName = parent.schemaName;
  }

  private field(name: string) {
    if (!Object.hasOwn(this.fields, name)) {
      this.fields[name] = {};
    }
    return this.fields[name];
  }

  private recomputeListable() {
    rebuildPluck(this.pluck, this.fields);
  }

  private recomputeAccess() {
    for (const key of Object.keys(this.readable)) {
      delete this.readable[key];
    }
    for (const key of Object.keys(this.writable)) {
      delete this.writable[key];
    }

    const actions = new Set([
      DEFAULT_ACTION,
      ...Object.values(this.fields).flatMap((field) =>
        Object.keys(field.modeOverrides ?? {}),
      ),
    ]);

    const access = new Map<
      string,
      [ReadableAccessFields, WritableAccessFields]
    >();
    for (const action of actions) {
      const readable: ReadableAccessFields = { getters: [], props: [] };
      const writable: WritableAccessFields = { setters: [], props: [] };
      this.readable[action] = readable;
      this.writable[action] = writable;
      access.set(action, [readable, writable]);
    }

    for (const [key, field] of Object.entries(this.fields)) {
      for (const [action, [readable, writable]] of access) {
        const effectiveMode = GetEffectiveMode(field, action);
        if (!effectiveMode) {
          continue;
        }

        if (effectiveMode & AccessMode.ReadOnly) {
          readable[field.desc?.get ? "getters" : "props"].push([key, field]);
        }
        if (effectiveMode & AccessMode.WriteOnly) {
          writable[field.desc?.set ? "setters" : "props"].push([key, field]);
        }
      }
    }
  }

  /**
   * Sets the access mode of the given field.
   *
   * @param name Field name
   * @param mode Access mode
   */
  public setMode(
    name: string,
    mode: AccessMode,
    overrides?: Record<string, AccessMode>,
  ) {
    const field = this.field(name);
    field.mode = mode;
    field.modeOverrides = overrides;
    this.recomputeAccess();
    return this;
  }

  /**
   * Sets whether a field should be included in list endpoints.
   *
   * @param name Field name
   * @param requiredFields Boolean or table field list
   * @param mode List mode (default: 'list')
   */
  public setListable(
    name: string,
    requiredFields: boolean | string[],
    mode = "list",
  ) {
    const field = this.field(name);
    const names = listedNames(name, requiredFields, field);
    if (!field.listable) {
      field.listable = {};
    }
    field.listable[mode] = names;
    this.recomputeListable();
    return this;
  }

  /**
   * Sets whether or not this field must be present in requests for the given method.
   *
   * @param name Field name
   * @param modes DataAPI methods
   */
  public setMandatory(name: string, modes: string[]) {
    this.field(name).mandatory = new Set(modes);
    return this;
  }

  /**
   * Sets whether or not this field can be used to sort in list endpoints.
   *
   * @param name Field name
   * @param active Sortable
   * @param noIndex Ignore database indexes
   */
  public setSortable(name: string, active: boolean, noIndex?: boolean) {
    const field = this.field(name);
    if (!active) {
      field.sortable = undefined;
      return this;
    }
    field.sortable = { indexed: !noIndex && !field.joined && !field.computed };
    return this;
  }

  /**
   * Declares a field to be computed in-database from an expression.
   *
   * The value is read-only (merged into the row at query time, not persisted
   * on this table). The field becomes natively sortable/filterable/pageable
   * since the expression is applied to the underlying query before
   * sorting/filtering.
   *
   * @param name Field name
   * @param expr Computed expression
   * @param options Computed options
   */
  public setComputed(
    name: string,
    expr: ComputedExpression,
    options?: ComputedOptions,
  ) {
    const field = this.field(name);
    field.computed = { expr, default: options?.default };
    field.mode = AccessMode.ReadOnly;
    if (field.sortable?.indexed) {
      field.sortable = { indexed: false };
    }
    this.recomputeAccess();
    return this;
  }

  /**
   * Declares a field to be a flat join from another table.
   *
   * The value is read-only (set by lookup at query time, not persisted on this table).
   * The field becomes natively sortable/searchable/filterable since the join
   * is applied to the underlying query before sorting/filtering.
   *
   * @param name Field name
   * @param options Joined options (other table, local key, remote field, remote index)
   */
  public setJoined(
    name: string,
    options: {
      table: string | Class<Table>;
      localKey: string;
      remoteField: string;
      remoteIndex?: string;
      schema?: string;
    },
  ) {
    const resolved = resolveTableReference(
      this.schemaName,
      options.table,
      options.schema,
      `joined field "${name}"`,
    );

    const field = this.field(name);
    field.joined = {
      table: resolved.tableName,
      tableClass: resolved.tableClass,
      localKey: options.localKey,
      remoteField: options.remoteField,
      remoteIndex: options.remoteIndex ?? "_id",
      schemaName: resolved.schemaName,
    };

    field.mode = AccessMode.ReadOnly;

    if (field.sortable?.indexed) {
      field.sortable = { indexed: false };
    }

    if (field.listable) {
      for (const mode of Object.keys(field.listable)) {
        if (field.listable[mode].length === 0) continue;
        field.listable[mode] = Array.from(
          new Set([...field.listable[mode], name, field.joined.localKey]),
        );
      }
      this.recomputeListable();
    }

    this.recomputeAccess();
    return this;
  }

  /**
   * Declares a field to be a foreign key.
   *
   * @param name Field name
   * @param table Other table
   * @param index Other table index
   * @param multi Index is a multi index
   * @param targetMeta Metadata of the target's data controller. Its `@Joined`
   *   fields that `pluck` names, or all of them when `pluck` is unset, are
   *   resolved on the relation unless it is `multi`.
   */
  public setForeign(
    name: string,
    table: string | Class<Table>,
    ...[index, multi, pluck, schema, targetMeta]: ForeignOptions
  ) {
    const resolved = resolveTableReference(
      this.schemaName,
      table,
      schema,
      `foreign field "${name}"`,
    );

    const targetJoined = targetMeta
      ? targetJoinedFields(targetMeta.fields, pluck)
      : undefined;

    this.field(name).foreign = [
      resolved.tableName,
      resolved.tableClass,
      index,
      multi || undefined,
      pluck || undefined,
      resolved.schemaName,
      targetJoined,
    ];
    return this;
  }

  /**
   * Set the validation function of a field.
   *
   * @param name Field name
   * @param validator Value validator callback
   */
  public setValidator(name: string, validator?: FieldValidator) {
    this.field(name).validator = validator;
    return this;
  }

  /**
   * Updates the known field descriptor of this field.
   *
   * @param name Field name
   * @param desc Field descriptor
   */
  public setDescriptor(name: string, desc?: PropertyDescriptor) {
    this.field(name).desc = desc;
    return this;
  }

  /**
   * Creates a filter.
   *
   * @param name Filter name
   * @param func Filter callback
   * @param index
   */
  public setFilter(
    name: string,
    func: FilterFunction<any, any>,
    useIndex?: boolean,
  ) {
    this.filters[name] = func;
    const field = this.field(name);
    if (useIndex) {
      const tableMeta = getMetadata(this.tableClass, DatumStaticMetadata);
      const index = tableMeta.indexes[field.dbName ?? name];
      if (index && index.length === 1) {
        field.indexable = true;
      }
    } else {
      field.indexable = false;
    }
    return this;
  }

  /**
   * Sets the key containing the database table instance.
   *
   * @param name Field name
   */
  public setModelKey(name: PropertyKey) {
    this.modelKey = name;
    return this;
  }

  /**
   * Sets the key containing the key for the given database modifier.
   *
   * @param name Field name
   * @param modifierClass Modifier
   */
  public setModifierKey(
    name: PropertyKey,
    modifierClass: typeof ContainerModifier<any>,
  ) {
    this.modifierKeys.set(modifierClass, name);
    return this;
  }

  /**
   * Adds the given endpoint to the DataAPI
   *
   * @param key field name
   * @param endpoint callback information
   */
  public addEndpoint(
    key: string,
    endpoint?: DataControllerCallbackWithOptions,
  ) {
    if (!endpoint) {
      delete this.endpoints[key];
    } else {
      this.endpoints[key] = endpoint;
    }
  }
}

/** Declares a decorated field; a symbol-named property declares none. */
function onField(
  target: { constructor: Class },
  key: PropertyKey,
  declare: (meta: DataAPIMeta, name: string) => void,
) {
  if (!isString(key)) return;
  declare(GetMetadata(target.constructor, DataAPIMeta), key);
}

/**
 * Sets the access mode of a DataAPI field.
 *
 * @param mode Access mode
 */
export const Access = MakeMethodAndPropertyDecorator(
  (
    target,
    key,
    desc,
    mode: AccessMode,
    overrides?: Record<string, AccessMode>,
  ) => {
    onField(target, key, (meta, name) =>
      meta.setDescriptor(name, desc).setMode(name, mode, overrides),
    );
  },
);

/**
 * Sets the listable state of a DataAPI field.
 *
 * Listable fields are selected only for the named mode; modes do not inherit
 * the default mode's fields. Read access is still required for the response.
 *
 * Listable getters must specify the list of in-database field names they use.
 *
 * @param requiredFields Boolean or table field list
 * @param mode Independent list mode, defaulting to "list"
 */
export const Listable = MakeMethodAndPropertyDecorator(
  (target, key, desc, requiredFields?: boolean | string[], mode?: string) => {
    onField(target, key, (meta, name) =>
      meta
        .setDescriptor(name, desc)
        .setListable(
          name,
          requiredFields === undefined ? true : requiredFields,
          mode,
        ),
    );
  },
);

/**
 * Declares a field to be mandatory in calls to the given methods.
 *
 * @param modes DataAPI methods (ex: `new`, `edit`)
 */
export const Mandatory = MakeMethodAndPropertyDecorator(
  (target, key, desc, ...modes: string[]) => {
    onField(target, key, (meta, name) =>
      meta.setDescriptor(name, desc).setMandatory(name, modes),
    );
  },
);

/**
 * Declares a field as being optional.
 *
 * This must be used on fields with no other decorators.
 */
export const Optional = MakeMethodAndPropertyDecorator((target, key, desc) => {
  onField(target, key, (meta, name) =>
    meta.setDescriptor(name, desc).setMandatory(name, []),
  );
});

/**
 * Declares a field to be useable as the sorting key.
 *
 * @param options Options
 */
export const Sortable = MakeMethodAndPropertyDecorator(
  (target, key, desc, options?: { noIndex?: boolean }) => {
    onField(target, key, (meta, name) =>
      meta
        .setDescriptor(name, desc)
        .setSortable(name, true, options?.noIndex ?? false),
    );
  },
);

/**
 * Declares a field whose value is imported (flattened) from another table.
 *
 * The local row carries a foreign key (`localKey`); the framework adds a
 * lookup so the remote field appears at the top level of each row before
 * filters and sorting are applied. This makes the field natively sortable,
 * filterable, and searchable in DB.
 *
 * Joined fields are auto read-only and forced to non-indexed sort.
 */
export const Joined = MakePropertyDecorator(
  (
    target,
    key,
    options: {
      table: string | Class<Table>;
      localKey: string;
      remoteField: string;
      remoteIndex?: string;
      schema?: string;
    },
  ) => {
    onField(target, key, (meta, name) => meta.setJoined(name, options));
  },
);

/**
 * Declares a field whose value is computed in-database from an expression.
 *
 * The expression receives the row proxy and the schema instance and may
 * return a row-local expression or a per-row subquery (ex: an aggregate over
 * another table). The framework merges the result into each row before
 * filters and sorting are applied, making the field natively sortable,
 * filterable, and pageable in DB.
 *
 * Computed fields are auto read-only and forced to non-indexed sort.
 *
 * @param expr Computed expression
 * @param options Computed options (`default`: fallback when the expression yields null)
 */
export const Computed = MakePropertyDecorator(
  (target, key, expr: ComputedExpression, options?: ComputedOptions) => {
    onField(target, key, (meta, name) => meta.setComputed(name, expr, options));
  },
);

/**
 * Declares a field to be a foreign key.
 *
 * @param table Other table
 * @param index Other table index
 * @param multi Index is a multi index
 */
export const Foreign = MakeMethodAndPropertyDecorator(
  (
    target,
    key,
    desc,
    ...[table, index, multi, pluck, schema, targetMeta]: [
      table: string | Class<Table>,
      ...options: ForeignOptions,
    ]
  ) => {
    onField(target, key, (meta, name) =>
      meta
        .setDescriptor(name, desc)
        .setForeign(name, table, index, multi, pluck, schema, targetMeta),
    );
  },
);

/**
 * Set the validation function of a field.
 *
 * @param validator Value validator callback
 */
export const Validator = MakeMethodAndPropertyDecorator(
  (target, key, desc, validator: FieldValidator) => {
    onField(target, key, (meta, name) =>
      meta.setDescriptor(name, desc).setValidator(name, validator),
    );
  },
);

const FilterDecoratorFactory = MakePropertyDecorator(
  (target, key, func?: DefaultFilterFunction, useIndex?: boolean) => {
    onField(target, key, (meta, name) =>
      meta.setFilter(
        name,
        func || createDefaultFilter(),
        useIndex === undefined ? !func : useIndex,
      ),
    );
  },
);

/**
 * Creates a field filter.
 *
 * @param func Custom filter function. Raw query values are strings; parse and
 * validate numeric/boolean values here. The default compares strings unchanged.
 * @param useIndex Allow indexed equality lookup when an index exists. Defaults
 * to true for the default filter and false for custom filters. An indexed
 * equality lookup uses the raw string and bypasses the callback.
 */
export function Filter<T extends Record<string, any>>(
  func?: FilterFunction<T, T>,
  useIndex?: boolean,
): (target: T, propertyKey: string | symbol) => void {
  return FilterDecoratorFactory(func, useIndex);
}

/**
 * Sets which field will contain the reference to the database model instance.
 */
export const ModelReference = MakePropertyDecorator((target, key) => {
  GetMetadata(target.constructor, DataAPIMeta).setModelKey(key);
});

/**
 * Sets which field will contain the key for the given database modifier.
 *
 * @param modifierClass Modifier
 */
export const ModifierKey = MakePropertyDecorator(
  (target, key, modifierClass: typeof ContainerModifier<any>) => {
    GetMetadata(target.constructor, DataAPIMeta).setModifierKey(
      key,
      modifierClass,
    );
  },
);

export function GetDataControllerMeta(thisObj: any): DataAPIMeta {
  return GetMetadata(
    Object.getPrototypeOf(thisObj).constructor,
    DataAPIMeta,
    true,
  );
}
