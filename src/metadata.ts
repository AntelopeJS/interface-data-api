import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type Class,
  MakeMethodAndPropertyDecorator,
  MakePropertyDecorator,
} from "@antelopejs/interface-core/decorators";
import type {
  Query,
  SchemaInstance,
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import {
  DatumStaticMetadata,
  getMetadata,
  getTablesForSchema,
  type Table,
} from "@antelopejs/interface-database-decorators";
import type { ContainerModifier } from "@antelopejs/interface-database-decorators/modifiers/common";
import type { DataControllerCallbackWithOptions } from ".";

/**
 * Field access mode enum.
 */
export enum AccessMode {
  ReadOnly = 1,
  WriteOnly = 2,
  ReadWrite = 3,
}

/**
 * A `@Joined` field declared on the target of a relation, captured so the
 * foreign lookup can re-materialize it (joined fields are not physical columns,
 * so a plain pluck of the target table would return them empty).
 */
export interface ForeignJoinedRef {
  name: string;
  table: string;
  localKey: string;
  remoteField: string;
  remoteIndex: string;
  schemaName?: string;
}

/**
 * DataAPI Metadata field information.
 */
export interface FieldData {
  /**
   * Field name in-database.
   */
  dbName?: string;

  /**
   * Field access mode.
   *
   * @see {@link AccessMode}
   */
  mode?: AccessMode;

  /**
   * Field access mode overrides per DataAPI action.
   */
  modeOverrides?: Record<string, AccessMode>;

  /**
   * DB Fields that should be selected for this field.
   */
  listable?: Record<string, string[]>;

  /**
   * Set of api methods for which the field must be set.
   */
  mandatory?: Set<string>;

  /**
   * Whether the DataAPI can be sorted using this field.
   */
  sortable?: { indexed?: boolean };

  /**
   * Foreign key reference.
   *
   * `schemaName` is set when the target lives in another schema than the
   * controller's table; runtime resolves the foreign lookup against that
   * schema's default instance instead of the source instance.
   */
  foreign?: [
    table: string,
    tableClass?: Class<Table>,
    index?: string,
    multi?: true,
    pluck?: string[],
    schemaName?: string,
    targetJoined?: ForeignJoinedRef[],
  ];

  /**
   * Joined-from-other-table reference.
   *
   * Imports a single scalar field from another table at query time and
   * flattens it into the row, enabling sort/search/filter natively in DB.
   *
   * `schemaName` is set when the target lives in another schema than the
   * controller's table; runtime resolves the join against that schema's
   * default instance instead of the source instance.
   */
  joined?: {
    table: string;
    tableClass?: Class<Table>;
    localKey: string;
    remoteField: string;
    remoteIndex: string;
    schemaName?: string;
  };

  /**
   * In-database computed value.
   *
   * The expression is merged into each row at query time, enabling sort,
   * filter, and pagination natively in DB.
   */
  computed?: ComputedFieldData;

  /**
   * Value validator callback.
   */
  validator?: (value: unknown) => boolean | Promise<boolean>;

  /**
   * Field property descriptor.
   */
  desc?: PropertyDescriptor;

  /**
   * Whether or not an `eq` filter with this field name can use an indexed lookup.
   */
  indexable?: boolean;
}

/**
 * In-database computed field expression.
 *
 * Receives the row proxy and the schema instance of the controller's table.
 * May return a row-local expression (built from `row`) or a per-row subquery
 * (ex: an aggregate over another table).
 */
export type ComputedExpression = (
  row: ValueProxy<Record<string, any>>,
  db: SchemaInstance<any>,
) => ValueProxyOrValue<unknown> | Query<unknown>;

/**
 * Computed field options.
 */
export interface ComputedOptions {
  /**
   * Fallback merged over the computed value when the expression yields null
   * (ex: `0` for an aggregate count over an empty set).
   */
  default?: unknown;
}

/**
 * Computed field information.
 */
export interface ComputedFieldData extends ComputedOptions {
  expr: ComputedExpression;
}

type Comparison = "eq" | "ne" | "gt" | "ge" | "lt" | "le";
export type FilterValue = [value: string, mode: Comparison];

/**
 * Filter callback.
 */
export type FilterFunction<
  T extends Record<string, any>,
  U extends Record<string, any> = Record<string, any>,
> = (
  context: RequestContext & { this: T },
  proxy: ValueProxy<any>,
  key: string,
  value: FilterValue[0],
  mode: FilterValue[1],
  row: ValueProxy<U>,
) => ValueProxyOrValue<boolean>;

export interface ReadableAccessFields {
  getters: [string, FieldData][];
  props: [string, FieldData][];
}

interface ResolvedTableReference {
  tableName: string;
  tableClass?: Class<Table>;
  /** `undefined` means same schema as the source DataAPI. */
  schemaName?: string;
}

function readTableMetadata(table: Class<Table>): {
  schemaName?: string;
  tableName?: string;
} {
  const meta = getMetadata(table, DatumStaticMetadata) as
    | { schemaName?: string; tableName?: string }
    | undefined;
  return { schemaName: meta?.schemaName, tableName: meta?.tableName };
}

function resolveTableReference(
  sourceSchemaName: string,
  table: string | Class<Table>,
  explicitSchema: string | undefined,
  contextLabel: string,
): ResolvedTableReference {
  if (typeof table !== "string") {
    const inferred = readTableMetadata(table);
    const schemaName = explicitSchema ?? inferred.schemaName;
    const tableName = inferred.tableName;
    if (!schemaName || !tableName) {
      throw new Error(
        `Unable to infer table name/schema for ${contextLabel}: pass @RegisterTable on the table class`,
      );
    }
    if (
      explicitSchema &&
      inferred.schemaName &&
      explicitSchema !== inferred.schemaName
    ) {
      throw new Error(
        `Schema mismatch for ${contextLabel}: class registers in "${inferred.schemaName}" but option specifies "${explicitSchema}"`,
      );
    }
    return {
      tableName,
      tableClass: table,
      schemaName: schemaName === sourceSchemaName ? undefined : schemaName,
    };
  }

  const targetSchema = explicitSchema ?? sourceSchemaName;
  const databaseSchema = getTablesForSchema(targetSchema);
  if (!databaseSchema) {
    throw new Error(`Schema "${targetSchema}" not found for ${contextLabel}`);
  }
  return {
    tableName: table,
    tableClass: databaseSchema[table],
    schemaName: targetSchema === sourceSchemaName ? undefined : targetSchema,
  };
}

export interface WritableAccessFields {
  setters: [string, FieldData][];
  props: [string, FieldData][];
}

/**
 * Metadata Class containing the DataAPI information.
 */
export class DataAPIMeta {
  /**
   * Key symbol.
   */
  public static key = Symbol();

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
    const merge = (src: Record<string, any>, dst: Record<string, any>) => {
      for (const key in src) {
        if (!(key in dst)) {
          dst[key] = src[key];
        } else if (Array.isArray(dst[key])) {
          dst[key].push(...src[key]);
        }
      }
    };
    merge(parent.filters, this.filters);
    merge(parent.fields, this.fields);
    for (const [key, list] of Object.entries(parent.pluck)) {
      this.pluck[key] = new Set(list);
    }
    if (!("modelKey" in this)) {
      this.modelKey = parent.modelKey;
    }
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

    const actions = new Set<string>(["_default"]);
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
        const effectiveMode =
          action === "_default"
            ? field.mode
            : (field.modeOverrides?.[action] ?? field.mode);
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
      typeof requiredFields === "boolean"
        ? requiredFields
          ? [name]
          : []
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

    // Capture the target's `@Joined` fields so the foreign lookup can
    // re-materialize them. A joined field is not a physical column, so a plain
    // pluck of the target table returns it empty; we resolve it with a second
    // lookup at query time (see `Query.Foreign`). Only joined fields that are
    // actually requested (present in `pluck`) are captured. Their `localKey`
    // is deliberately NOT added to the stored pluck: `foreign[4]` also drives
    // response field filtering (`Validation.ClearInternal`), so adding the join
    // key here would leak it into the API output. `Query.Foreign` extends the
    // lookup pluck with the join keys at query time instead.
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
  public setValidator(
    name: string,
    validator?: (value: unknown) => boolean | Promise<boolean>,
  ) {
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
 * Listable fields will be included in list method calls.
 *
 * Listable getters must specificy the list of in-database field names they use.
 *
 * @param requiredFields Boolean or table field list
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
    table: string | Class<Table>,
    index?: string,
    multi?: boolean,
    pluck?: string[],
    schema?: string,
    targetMeta?: DataAPIMeta,
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
  (
    target,
    key,
    desc,
    validator: (val: unknown) => boolean | Promise<boolean>,
  ) => {
    GetMetadata(target.constructor, DataAPIMeta)
      .setDescriptor(key as string, desc)
      .setValidator(key as string, validator);
  },
);

type ProxyFilterOperator = (
  proxy: ValueProxy<string>,
  value: string,
) => ValueProxyOrValue<boolean>;
type DefaultFilterOperators = Record<Comparison, ProxyFilterOperator>;
type DefaultFilterFunction = FilterFunction<
  Record<string, any>,
  Record<string, any>
>;

const DEFAULT_FILTER_OPERATORS: DefaultFilterOperators = {
  eq: (proxy, value) => proxy.eq(value),
  ne: (proxy, value) => proxy.ne(value),
  gt: (proxy, value) => proxy.gt(value),
  ge: (proxy, value) => proxy.ge(value),
  lt: (proxy, value) => proxy.lt(value),
  le: (proxy, value) => proxy.le(value),
};

function applyDefaultFilterMode(
  proxy: ValueProxy<string>,
  value: string,
  mode: FilterValue[1],
): ValueProxyOrValue<boolean> {
  return DEFAULT_FILTER_OPERATORS[mode](proxy, value);
}

function createDefaultFilter(): DefaultFilterFunction {
  return (_context, proxy, _key, value, mode) =>
    applyDefaultFilterMode(proxy as ValueProxy<string>, value, mode);
}

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
 * @param func Custom filter function
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
