# @antelopejs/interface-data-api

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/interface-data-api"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-data-api?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-data-api?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://interfaces.antelopejs.com/docs/data-api"><img alt="Docs" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>
</div>

CRUD REST endpoints generated from a database table: declare a data controller and its fields, and get `get`, `list`, `new`, `edit` and `delete` routes with access rules, validation and pagination.

## What it offers

- `DataController` and `@RegisterDataController()` turn a table class into a controller with the default routes you pick from `DefaultRoutes`.
- `@Access`, `@Mandatory` and `@Validator` decide which fields each route reads and writes, and check them.
- `@Listable`, `@Sortable` and `@Filter` shape the paginated `list` route.
- `@Foreign`, `@Joined` and `@Computed` resolve references, flatten remote fields and add values computed in the database.

## Implementations

The package runs in your module and has no implementing module of its own. The project needs modules that implement the interfaces it builds on:

| Interface                        | Module                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@antelopejs/interface-api`      | [`@antelopejs/api`](https://github.com/AntelopeJS/api)                                                                               |
| `@antelopejs/interface-database` | [`@antelopejs/mongodb`](https://github.com/AntelopeJS/mongodb) or [`@antelopejs/rethinkdb`](https://github.com/AntelopeJS/rethinkdb) |

## Install

Add the package and the interfaces your controllers import to your module:

```bash
pnpm add @antelopejs/interface-data-api @antelopejs/interface-api @antelopejs/interface-database-decorators
```

Then add the implementations to the project:

```bash
ajs project modules add @antelopejs/api @antelopejs/mongodb
```

## Quick start

```ts
import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";

@RegisterTable("tasks", "todo")
class Task extends Table {
  declare _id: string;

  @Field("string")
  declare summary: string;
}

class TaskModel extends BasicDataModel(Task, "tasks") {}

@RegisterDataController()
class TaskAPI extends DataController(
  Task,
  DefaultRoutes.All,
  Controller("/tasks"),
) {
  @ModelReference()
  @Model(TaskModel)
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

export async function construct() {
  await RegisterSchema("todo");
}
```

The controller serves `GET /tasks/get?id=`, `GET /tasks/list`, `POST /tasks/new`, `PUT /tasks/edit?id=` and `DELETE /tasks/delete?id=`. Fields without `@Access` stay out of every response.

## Documentation

- [Introduction](https://interfaces.antelopejs.com/docs/data-api/introduction)
- [Data controllers](https://interfaces.antelopejs.com/docs/data-api/data-controllers)
- [Routes](https://interfaces.antelopejs.com/docs/data-api/routes)
- [Access rights](https://interfaces.antelopejs.com/docs/data-api/access-rights)
- [Validators](https://interfaces.antelopejs.com/docs/data-api/validators)
- [Listable fields](https://interfaces.antelopejs.com/docs/data-api/listable)
- [Foreign keys](https://interfaces.antelopejs.com/docs/data-api/foreign-keys)
- [Filters](https://interfaces.antelopejs.com/docs/data-api/filters)
- [Modifiers](https://interfaces.antelopejs.com/docs/data-api/modifiers)
- [Joined fields](https://interfaces.antelopejs.com/docs/data-api/joined)
- [Computed fields](https://interfaces.antelopejs.com/docs/data-api/computed)

## Compatibility

| Package                                            | Range             |
| -------------------------------------------------- | ----------------- |
| `@antelopejs/interface-api` (peer)                 | `>=0.0.13 <1.0.0` |
| `@antelopejs/interface-api-util` (peer)            | `>=0.1.2 <1.0.0`  |
| `@antelopejs/interface-core` (peer)                | `>=0.1.1 <1.0.0`  |
| `@antelopejs/interface-database` (peer)            | `>=0.1.9 <1.0.0`  |
| `@antelopejs/interface-database-decorators` (peer) | `>=0.1.8 <1.0.0`  |
| `@antelopejs/core`                                 | `1.x`             |

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. The local checks are:

```bash
pnpm install
pnpm lint
pnpm test
```

## License

[Apache-2.0](./LICENSE)
