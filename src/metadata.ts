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
  ForeignJoinedRef,
  FieldValidator,
  FieldData,
  ComputedExpression,
  ComputedOptions,
  FilterValue,
  FieldFilter,
  FilterFunction,
  ReadableAccessFields,
  WritableAccessFields,
} from "./internal/field-types";
import { merge } from "./internal/meta-records";
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
  /**
   * Key symbol.
   */
  public static key = Symbol.for(
    "@antelopejs/interface-data-api/DataAPIMeta@1",
  );

  public readonly filters: Record<string, FilterFunction<any>> = {};

  /**
   * Fields information.
   */
  public readonly fields: Record<string, FieldData> = {};

  /**
   * Fields to pluck in listing endpoints.
   */
  public readonly pluck: Record<string, Set<string>> = {};

  /**
   * Key of the DataAPI class containing a database table instance.
   */
  public modelKey?: string;

  /**
   * Keys of the DataAPI class containing database modifier keys.
   */
  public modifierKeys = new Map<typeof ContainerModifier<any>, string>();

  /**
   * Schema name where the table is registered.
   */
  public schemaName!: string;

  /**
   * Database Schema class.
   */
  public tableClass!: Class;

  /**
   * Database Schema table name.
   */
  public tableName!: string;

  /**
   * Readable fields.
   */
  public readonly readable: Record<string, ReadableAccessFields> = {};

  /**
   * Writeable fields.
   */
  public readonly writable: Record<string, WritableAccessFields> = {};

  /**
   * Registered DataAPI endpoints.
   */
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
    if (!(name in this.fields)) {
      this.fields[name] = {};
    }
    return this.fields[name];
  }

  private recomputeListable() {
    for (const set of Object.values(this.pluck)) {
      set.clear();
    }
    for (const [_, field] of Object.entries(this.fields)) {
      if (field.listable) {
        for (const [mode, names] of Object.entries(field.listable)) {
          if (!(mode in this.pluck)) {
            this.pluck[mode] = new Set();
          }
          for (const name of names) {
            this.pluck[mode].add(name);
          }
        }
      }
    }
  }

  private recomputeAccess() {
    for (const key of Object.keys(this.readable)) {
      delete this.readable[key];
    }
    for (const key of Object.keys(this.writable)) {
      delete this.writable[key];
    }

    const actions = new Set<string>([DEFAULT_ACTION]);
    for (const field of Object.values(this.fields)) {
      if (field.modeOverrides) {
        for (const action of Object.keys(field.modeOverrides)) {
          actions.add(action);
        }
      }
    }

    for (const action of actions) {
      this.readable[action] = { getters: [], props: [] };
      this.writable[action] = { setters: [], props: [] };
    }

    for (const [key, field] of Object.entries(this.fields)) {
      for (const action of actions) {
        const effectiveMode = GetEffectiveMode(field, action);
        if (!effectiveMode) {
          continue;
        }

        if (effectiveMode & AccessMode.ReadOnly) {
          const target = field.desc?.get ? "getters" : "props";
          this.readable[action][target].push([key, field]);
        }
        if (effectiveMode & AccessMode.WriteOnly) {
          const target = field.desc?.set ? "setters" : "props";
          this.writable[action][target].push([key, field]);
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
    const baseNames =
      requiredFields === true
        ? [name]
        : requiredFields === false
          ? []
          : requiredFields;
    const names =
      baseNames.length > 0 && field.joined
        ? Array.from(new Set([...baseNames, name, field.joined.localKey]))
        : baseNames;
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
   * @returns
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
    index?: string,
    multi?: boolean,
    pluck?: string[],
    schema?: string,
    targetMeta?: DataAPIMeta,
  ) {
    const resolved = resolveTableReference(
      this.schemaName,
      table,
      schema,
      `foreign field "${name}"`,
    );

    let targetJoined: ForeignJoinedRef[] | undefined;
    if (targetMeta) {
      const pluckSet = pluck ? new Set(pluck) : undefined;
      const groups: ForeignJoinedRef[] = [];
      for (const [fieldName, field] of Object.entries(targetMeta.fields)) {
        if (!field.joined || (pluckSet && !pluckSet.has(fieldName))) {
          continue;
        }
        const j = field.joined;
        groups.push({
          name: fieldName,
          table: j.table,
          tableClass: j.tableClass,
          localKey: j.localKey,
          remoteField: j.remoteField,
          remoteIndex: j.remoteIndex,
          schemaName: j.schemaName,
        });
      }
      if (groups.length > 0) {
        targetJoined = groups;
      }
    }

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
    func: FilterFunction<Record<string, any>, Record<string, any>>,
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
  public setModelKey(name: string) {
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
    name: string,
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
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setMode(key as string, mode, overrides);
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
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setListable(
        key as string,
        typeof requiredFields !== "undefined" ? requiredFields : true,
        mode,
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
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setMandatory(key as string, modes);
  },
);

/**
 * Declares a field as being optional.
 *
 * This must be used on fields with no other decorators.
 */
export const Optional = MakeMethodAndPropertyDecorator((target, key, desc) => {
  GetMetadata(target.constructor, DataAPIMeta)
    .setDescriptor(key as string, desc)
    .setMandatory(key as string, []);
});

/**
 * Declares a field to be useable as the sorting key.
 *
 * @param options Options
 */
export const Sortable = MakeMethodAndPropertyDecorator(
  (target, key, desc, options?: { noIndex?: boolean }) => {
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setSortable(key as string, true, options?.noIndex ?? false);
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
    GetMetadata(target.constructor, DataAPIMeta).setJoined(
      key as string,
      options,
    );
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
    GetMetadata(target.constructor, DataAPIMeta).setComputed(
      key as string,
      expr,
      options,
    );
  },
);

type ForeignArguments =
  Parameters<DataAPIMeta["setForeign"]> extends [string, ...infer Rest]
    ? Rest
    : never;

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
    ...[table, index, multi, pluck, schema, targetMeta]: ForeignArguments
  ) => {
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setForeign(
        key as string,
        table,
        index,
        multi,
        pluck,
        schema,
        targetMeta,
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
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setValidator(key as string, validator);
  },
);

const FilterDecoratorFactory = MakePropertyDecorator(
  (target, key, func?: DefaultFilterFunction, useIndex?: boolean) => {
    GetMetadata(key ? target.constructor : target, DataAPIMeta).setFilter(
      key as string,
      func || createDefaultFilter(),
      useIndex === undefined ? !func : useIndex,
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
export const Filter = FilterDecoratorFactory as <T extends Record<string, any>>(
  func?: FilterFunction<T, T>,
  useIndex?: boolean,
) => (target: T, propertyKey: string | symbol) => void;

/**
 * Sets which field will contain the reference to the database model instance.
 */
export const ModelReference = MakePropertyDecorator((target, key) => {
  GetMetadata(target.constructor, DataAPIMeta).setModelKey(key as string);
});

/**
 * Sets which field will contain the key for the given database modifier.
 *
 * @param modifierClass Modifier
 */
export const ModifierKey = MakePropertyDecorator(
  (target, key, modifierClass: typeof ContainerModifier<any>) => {
    GetMetadata(target.constructor, DataAPIMeta).setModifierKey(
      key as string,
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
