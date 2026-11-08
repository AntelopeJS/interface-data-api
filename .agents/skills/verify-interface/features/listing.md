---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/computed.ts
  - src/internal/default-filter.ts
  - src/internal/deferred-joined-stream.ts
  - src/internal/extractors.ts
  - src/internal/foreign.ts
  - src/internal/guards.ts
  - src/internal/joined.ts
  - src/internal/list.ts
  - src/internal/meta-records.ts
  - src/internal/prototypes.ts
  - src/internal/read-properties.ts
  - src/internal/table-reference.ts
  - src/internal/tables.ts
  - src/internal/validation.ts
docs:
  - docs/6.listable.md
journeys:
  - pluck-modes
  - pagination
  - sorting
  - issue-92-getter-mode
---

# listing

A client pages, sorts and narrows the rows of a table through `GET /resource/list`.

## Sub-features

- `pluck-modes`: the default list mode answers the listable fields with read access, a `detailed` mode answers its own fields and does not inherit the default ones, a field can be left out of a mode, a field that is not listable is still read by `get`, and a getter lists the database fields it reads.
- `pagination`: a list answers `results`, `total`, `offset` and `limit`; `limit` and `offset` page the rows, the last page is short, the default is 10 and a route without `maxPage` caps `limit` at 100.
- `sorting`: `sortKey` and `sortDirection` sort on indexed and non-indexed `@Sortable` fields, any other direction sorts ascending, and a field without `@Sortable` answers `Field is not sortable.`.
- `issue-92-getter-mode`: a getter that a list mode does not declare is left out of that mode ([#92](https://github.com/AntelopeJS/interface-data-api/issues/92)).

## How to get to it (user POV)

- `GET /users/list?limit=2&offset=1&sortKey=name&sortDirection=desc`, `GET /users/detailed`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" listing
```

Each journey compiles the consumer in `fixture/shop-1.ts.txt` and `fixture/shop-2.ts.txt`, joined in that order, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.
