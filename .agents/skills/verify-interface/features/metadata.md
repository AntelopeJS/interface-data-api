---
covers:
  - src/metadata.ts
  - src/internal/field-types.ts
  - src/internal/tables.ts
  - src/index.ts
docs:
  - docs/4.access-rights.md
  - docs/2.data-controllers.md
journeys:
  - effective-modes
  - declaration-errors
  - exports-runtime
  - consumer-compiles
  - derived-own-model
  - foreign-target-meta
---

# metadata

A module author reads field metadata and declares controllers with the decorators.

## Sub-features

- `effective-modes`: `GetEffectiveMode` answers the mode each action applies for a read-write field with an edit override, a read-only field with a new override, a write-only field and a read-only field.
- `declaration-errors`: `DataController` throws `Non-existent Database Schema` for a table class whose schema is not registered.
- `exports-runtime`: the packed `metadata` entry exports `AccessMode` as 1, 2 and 3 and `FilterValuesOf`, which reads a single filter and a list of filters as a list.
- `consumer-compiles`: a module written from the docs, with every decorator and route helper, compiles in strict mode against the packed declarations.
- `derived-own-model`: a controller derived from another that declares its own `@ModelReference` reads its own model; one that declares none inherits the parent's.
- `foreign-target-meta`: `@Foreign` given the target controller's metadata resolves the target's `@Joined` fields.

## How to get to it (user POV)

- `GetEffectiveMode(meta.fields.role, "edit")` from `@antelopejs/interface-data-api/metadata`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" metadata
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- `Unregistered Database Table` is not driven: it needs a registered schema without the table class, and `@RegisterTable` registers the table.
