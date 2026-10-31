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

- [Introduction](./docs/1.introduction.md)
- [Data controllers](./docs/2.data-controllers.md)
- [Routes and loaded-model guards](./docs/3.routes.md)
- [Access rights](./docs/4.access-rights.md)
- [Validators](./docs/5.validators.md)
- [Listable fields](./docs/6.listable.md)
- [Foreign keys](./docs/7.foreign-keys.md)
- [Filters](./docs/8.filters.md)
- [Modifiers](./docs/9.modifiers.md)
- [Joined fields](./docs/10.joined.md)
- [Computed fields](./docs/11.computed.md)

## Compatibility

Use with `@antelopejs/core` 1.x and the following peer dependencies:

<!-- antelopejs-docs-compat:start -->

| Package                                     | Supported         | Tested with                                                    |
| ------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| `@antelopejs/interface-api`                 | `>=0.0.15 <1.0.0` | `0.0.15`                                                       |
| `@antelopejs/interface-api-util`            | `>=0.1.3 <1.0.0`  | `0.1.3`                                                        |
| `@antelopejs/interface-core`                | `>=0.2.4 <1.0.0`  | `0.2.4`                                                        |
| `@antelopejs/interface-database`            | `>=0.1.10 <1.0.0` | `file:.campaign/tgz/antelopejs-interface-database-4939b45.tgz` |
| `@antelopejs/interface-database-decorators` | `>=0.1.10 <1.0.0` | `0.1.10`                                                       |

<!-- antelopejs-docs-compat:end -->

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. The local checks are:

```bash
pnpm install
pnpm lint
pnpm test
```

## License

[Apache-2.0](./LICENSE)
