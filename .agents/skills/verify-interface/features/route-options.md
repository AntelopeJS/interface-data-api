---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/extractors.ts
  - src/internal/list.ts
  - src/internal/tables.ts
docs:
  - docs/3.routes.md
journeys:
  - option-overrides
  - list-unknown
  - issue-90-edit-index
  - no-mandatory-strings
  - no-pluck-strings
  - no-model-500
  - option-beats-query
---

# route-options

A route is customized with `DefaultRoutes.WithOptions`; its options win over the query string.

## Sub-features

- `option-overrides`: `maxPage` caps the `limit` of a query and is the page size without one, `noMandatory` as a route option lets a mandatory field be cleared while the plain route refuses it, any non-empty string (`"false"` included) turns the option on, `index` reads through a secondary index, `noPluck` still answers only readable fields, and a `pluckMode` no field declares answers `No fields found for pluckMode 'nothing'`.
- `list-unknown`: a list route with `noPluck` answers 200 for a `pluckMode` no field declares, and a URL no route matches answers 404.
- `issue-90-edit-index`: fails on purpose until [#90](https://github.com/AntelopeJS/interface-data-api/issues/90) is fixed: an `edit` with the `index` option updates the row the index found.
- `no-mandatory-strings`: `noMandatory` skips the mandatory check for any non-empty string, `"false"` included, on `edit` and on `new`, and not for `""` or when absent.
- `no-pluck-strings`: `noPluck` skips the pluck-mode check only when true.
- `no-model-500`: a controller whose model reference holds no model answers 500.
- `option-beats-query`: a route option beats a query parameter of the same name, nested `WithOptions` keep the inner options and endpoint, and the key name is not served when an endpoint renames it.

## How to get to it (user POV)

- `DefaultRoutes.WithOptions(DefaultRoutes.List, { maxPage: 3 })` under a key of the definition object, then `GET /users/capped?limit=50`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" route-options
```

Each journey compiles the consumer in `fixture/shop-1.ts.txt` and `fixture/shop-2.ts.txt`, joined in that order, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- A query parameter named like a route option is ignored; `noMandatory` is not read from the query at all.
