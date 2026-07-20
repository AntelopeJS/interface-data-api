---
name: data-api-interface
description: AntelopeJS interface that generates CRUD REST endpoints from a database table via a DataController class and field decorators (Access, Listable, Mandatory, Sortable, Filter, Foreign, Joined, Computed, Validator). Use when importing @antelopejs/interface-data-api or @antelopejs/interface-data-api/metadata, when building a data controller / data API over an interface-database table, or when working with DataController, DefaultRoutes, RegisterDataController, ModelReference, or filter_/sortKey/sortDirection list query parameters.
category: antelopejs-interface
tags: [antelopejs, data-api, crud, rest, decorators]
---

# Data API Interface

Declarative CRUD layer on top of `@antelopejs/interface-api` (HTTP) and
`@antelopejs/interface-database(-decorators)` (storage). You build a controller class with
`DataController(tableClass, routes, Controller("/path"))`, decorate fields to expose them, and get
`get/list/new/edit/delete` routes generated. Everything here is consumer-side: there is no proxy
point of its own to implement — the underlying api/database interfaces do the actual crossings, so
your module must also import those peer interfaces.

## Imports

```typescript
import { DataController, DefaultRoutes, RegisterDataController, GetDataControllerMeta } from "@antelopejs/interface-data-api";
import { Access, AccessMode, Listable, Mandatory, Optional, Sortable, Filter, Foreign, Joined, Computed, Validator, ModelReference, ModifierKey } from "@antelopejs/interface-data-api/metadata";
import { Parameters, Query, Validation } from "@antelopejs/interface-data-api/components";
```

`/components` is only needed for custom route callbacks (query building, validation helpers).

## Minimal consumption example

```typescript
import { Controller } from "@antelopejs/interface-api";
import { DataController, DefaultRoutes, RegisterDataController } from "@antelopejs/interface-data-api";
import { Access, AccessMode, Listable, Mandatory, ModelReference, Sortable } from "@antelopejs/interface-data-api/metadata";
import { BasicDataModel, Field, Model, RegisterTable, Table } from "@antelopejs/interface-database-decorators";

@RegisterTable("tasks", "default")
class Task extends Table {
  declare _id: string;

  @Field("string")
  declare summary: string;
}

class TaskModel extends BasicDataModel(Task, "tasks") {}

@RegisterDataController()
class TaskAPI extends DataController(Task, DefaultRoutes.All, Controller("/tasks")) {
  @ModelReference()
  @Model(TaskModel, "my-database")
  declare taskModel: TaskModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Sortable()
  @Mandatory("new")
  @Access(AccessMode.ReadWrite)
  declare summary: string;
}
```

This exposes `GET /tasks/get?id=`, `GET /tasks/list`, `POST /tasks/new`, `PUT /tasks/edit?id=`,
`DELETE /tasks/delete?id=` (repeat `id` to delete several).

## Gotchas

- `@RegisterDataController()` is mandatory: it wires field decorators, parameter providers, and
  routes. A `@ModelReference()` property holding a `@Model` instance is required too (`Query.GetModel`
  throws 500 without it).
- Fields with no decorator are invisible to the API — neither returned nor writable; visibility
  requires `@Access`. `@Optional()` only registers a field as not-mandatory (it does not expose it).
- `list` responds `{ results, total, offset, limit }`. `limit` defaults to 10 and is capped at 100
  (`maxPage`). Sorting uses `sortKey`/`sortDirection` query params and requires `@Sortable` on the
  field (400 otherwise). List responses only include `@Listable` fields unless `noPluck` is set.
- Filters come from `filter_<name>=<mode>:<value>` query params (plain value means `eq`); modes are
  `eq|ne|gt|ge|lt|le` (the default filter compares the raw query-string value — pass a custom filter
  function to cast for numeric ranges). Only fields declared with `@Filter()` are filterable.
- `@Joined` and `@Computed` fields are materialized in-database, so `@Sortable` and `@Filter()` work
  efficiently on them — but those decorators must still be applied explicitly. Such fields are
  forced read-only and to non-indexed sorting.
- Route selection: pass a subset like `{ get: DefaultRoutes.Get, list: DefaultRoutes.List }` instead
  of `DefaultRoutes.All`; use `DefaultRoutes.WithOptions(route, options, endpoint)` to rename an
  endpoint or preset parameter options.
- `@Access` accepts per-action overrides, e.g. `@Access(AccessMode.ReadOnly, { edit: AccessMode.ReadWrite })`.

## Deeper reference

See this package's `docs/` chapters — Introduction, Data Controllers, Routes, Access Rights,
Validators, Listable Fields, Foreign Keys, Filters, Modifiers, Joined Fields, Computed Fields — and
the shipped `.d.ts` files for exact signatures. Do not duplicate them here.
