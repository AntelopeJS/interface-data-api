---
covers:
  - src/components.ts
  - src/internal/extractors.ts
docs:
  - docs/3.routes.md
journeys:
  - option-overrides
---

# route-options

A route is customized with `DefaultRoutes.WithOptions`; its options win over the query string.

## Sub-features

- `option-overrides`: `maxPage` caps the `limit` of a query and is the page size without one, `noMandatory` as a route option lets a mandatory field be cleared while the plain route refuses it, any non-empty string (`"false"` included) turns the option on, `index` reads through a secondary index, `noPluck` still answers only readable fields, and a `pluckMode` no field declares answers `No fields found for pluckMode 'nothing'`.

## How to get to it (user POV)

- `DefaultRoutes.WithOptions(DefaultRoutes.List, { maxPage: 3 })` under a key of the definition object, then `GET /users/capped?limit=50`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" route-options
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- A query parameter named like a route option is ignored; `noMandatory` is not read from the query at all.
