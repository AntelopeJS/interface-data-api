<a href="https://github.com/AntelopeJS/antelopejs"><img data-illustration src="./.github/readme/strip.svg" width="100%" alt="INTERFACE · DATA API: part of AntelopeJS, hexagonal architecture beyond your own code. A glowing button reads Star AntelopeJS."></a>

<div align="center">

# `@antelopejs/interface-data-api`

<a href="https://www.npmjs.com/package/@antelopejs/interface-data-api"><img data-illustration alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-data-api?style=for-the-badge&labelColor=000000&color=000000"></a> <a href="./LICENSE"><img data-illustration alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-data-api?style=for-the-badge&labelColor=000000&color=000000"></a> <a href="https://discord.gg/g4pFt6eXqu"><img data-illustration alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a> <a href="https://interfaces.antelopejs.com/docs/data-api"><img data-illustration alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a> <a href="https://github.com/AntelopeJS/antelopejs"><img data-illustration alt="Star AntelopeJS" src="https://img.shields.io/github/stars/AntelopeJS/antelopejs?label=Star%20AntelopeJS&style=for-the-badge&labelColor=000000&color=000000&logo=github"></a>

**CRUD REST endpoints generated from a database table for AntelopeJS, with access rules, validation and pagination.**

[Documentation](https://interfaces.antelopejs.com/docs/data-api) · [Implementations](#implementations) · [All interfaces and providers](https://github.com/AntelopeJS/antelopejs#ecosystem)

</div>

The AntelopeJS interface that generates CRUD REST endpoints from a database table. Declare a data controller and its fields, and it serves the `get`, `list`, `new`, `edit` and `delete` routes with access rules, validation and pagination.

## What it offers

- `DataController` and `@RegisterDataController()` turn a table class into a controller with the default routes you pick from `DefaultRoutes`.
- `@Access` decides which fields each route reads and writes. `@Mandatory` and `@Validator` check the written values.
- `@Listable`, `@Sortable` and `@Filter` shape the paginated `list` route.
- `@Foreign`, `@Joined` and `@Computed` resolve references, flatten remote fields and add values computed in the database.

## Implementations

The package runs in your module and has no implementing module of its own. The project needs modules that implement the interfaces it builds on.

| Interface                        | Module                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@antelopejs/interface-api`      | [`@antelopejs/api`](https://github.com/AntelopeJS/api)                                                                               |
| `@antelopejs/interface-database` | [`@antelopejs/mongodb`](https://github.com/AntelopeJS/mongodb) or [`@antelopejs/rethinkdb`](https://github.com/AntelopeJS/rethinkdb) |

## Install

Add the package and its peer interfaces to your module.

```bash
pnpm add @antelopejs/interface-data-api @antelopejs/interface-api @antelopejs/interface-api-util @antelopejs/interface-core @antelopejs/interface-database @antelopejs/interface-database-decorators
```

Then add the implementations to the project.

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

The controller serves `GET /tasks/get?id=`, `GET /tasks/list`, `POST /tasks/new`, `PUT /tasks/edit?id=` and `DELETE /tasks/delete?id=`. A field without `@Access` stays out of every response and every write, unless `@Joined` or `@Computed` makes it read-only.

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

The package declares these `@antelopejs/*` peer dependencies.

<!-- antelopejs-docs-compat:start -->

| Package                                     | Supported         | Tested with |
| ------------------------------------------- | ----------------- | ----------- |
| `@antelopejs/interface-api`                 | `>=0.3.0 <1.0.0`  | `0.2.0`     |
| `@antelopejs/interface-api-util`            | `>=0.1.3 <1.0.0`  | `0.3.0`     |
| `@antelopejs/interface-core`                | `>=0.2.4 <1.0.0`  | `0.5.0`     |
| `@antelopejs/interface-database`            | `>=0.1.10 <1.0.0` | `0.3.0`     |
| `@antelopejs/interface-database-decorators` | `>=0.1.10 <1.0.0` | `0.2.0`     |

<!-- antelopejs-docs-compat:end -->

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. Run the local checks with these commands.

```bash
pnpm install
pnpm lint
pnpm test
```

## Part of AntelopeJS

This package belongs to [AntelopeJS](https://github.com/AntelopeJS/antelopejs), the TypeScript framework where modules depend on contracts and the application chooses the provider. The open-source back office [AntelopeJS DMS](https://github.com/AntelopeJS/dms) is built on it.

<!-- antelopejs-framework-modules:start -->

| Area         | Contracts                                                                                                                                                                                                                                                                                                                                                                                                                  | Providers                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API          | [`interface-api`](https://github.com/AntelopeJS/interface-api) · [`interface-api-util`](https://github.com/AntelopeJS/interface-api-util) · **`interface-data-api`**                                                                                                                                                                                                                                                       | [`api`](https://github.com/AntelopeJS/api)                                                                                                                                                                                                          |
| Auth         | [`interface-auth`](https://github.com/AntelopeJS/interface-auth)                                                                                                                                                                                                                                                                                                                                                           | [`auth-jwt`](https://github.com/AntelopeJS/auth-jwt)                                                                                                                                                                                                |
| Database     | [`interface-database`](https://github.com/AntelopeJS/interface-database) · [`interface-database-decorators`](https://github.com/AntelopeJS/interface-database-decorators) · [`interface-database-catalog`](https://github.com/AntelopeJS/interface-database-catalog) · [`interface-mongodb`](https://github.com/AntelopeJS/interface-mongodb) · [`interface-rethinkdb`](https://github.com/AntelopeJS/interface-rethinkdb) | [`postgres`](https://github.com/AntelopeJS/postgres) · [`mongodb`](https://github.com/AntelopeJS/mongodb) · [`rethinkdb`](https://github.com/AntelopeJS/rethinkdb)                                                                                  |
| Redis        | [`interface-redis`](https://github.com/AntelopeJS/interface-redis) · [`interface-redis-scheduler`](https://github.com/AntelopeJS/interface-redis-scheduler)                                                                                                                                                                                                                                                                | [`redis`](https://github.com/AntelopeJS/redis)                                                                                                                                                                                                      |
| Email        | [`interface-email`](https://github.com/AntelopeJS/interface-email)                                                                                                                                                                                                                                                                                                                                                         | [`nodemailer`](https://github.com/AntelopeJS/nodemailer) · [`brevo`](https://github.com/AntelopeJS/brevo)                                                                                                                                           |
| File storage | [`interface-file-storage`](https://github.com/AntelopeJS/interface-file-storage)                                                                                                                                                                                                                                                                                                                                           | [`file-storage-local`](https://github.com/AntelopeJS/file-storage-local) · [`file-storage-s3`](https://github.com/AntelopeJS/file-storage-s3)                                                                                                       |
| Payments     | [`interface-payment`](https://github.com/AntelopeJS/interface-payment) · [`interface-subscriptions`](https://github.com/AntelopeJS/interface-subscriptions) · [`interface-stripe`](https://github.com/AntelopeJS/interface-stripe)                                                                                                                                                                                         | [`stripe`](https://github.com/AntelopeJS/stripe) · [`mollie`](https://github.com/AntelopeJS/mollie) · [`checkout-com`](https://github.com/AntelopeJS/checkout-com) · [`payment-subscriptions`](https://github.com/AntelopeJS/payment-subscriptions) |

<!-- antelopejs-framework-modules:end -->

## License

[Apache-2.0](./LICENSE)
