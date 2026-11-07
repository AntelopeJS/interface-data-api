---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/computed.ts
  - src/internal/default-filter.ts
  - src/internal/deferred-joined-stream.ts
  - src/internal/extractors.ts
  - src/internal/filters.ts
  - src/internal/foreign.ts
  - src/internal/guards.ts
  - src/internal/joined.ts
  - src/internal/list.ts
  - src/internal/meta-records.ts
  - src/internal/properties.ts
  - src/internal/prototypes.ts
  - src/internal/read-properties.ts
  - src/internal/table-reference.ts
  - src/internal/tables.ts
  - src/internal/validation.ts
docs:
  - docs/11.computed.md
journeys:
  - computed-read
  - computed-access
---

# computed

A row answers a value the database computes.

## Sub-features

- `computed-read`: `@Computed` merges a per-row `count()` subquery and a row-local expression; `default` turns the null aggregate of an empty set into 0, the list sorts and pages on the aggregate with the same total on every page, filters on it, and the field is read-only.
- `computed-access`: an `@Access` written above `@Computed` replaces its read-only mode, on get and on list.

## How to get to it (user POV)

- `GET /groups/list?sortKey=devices_count&sortDirection=desc&limit=2` on a controller whose `devices_count` counts the devices of each group.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" computed
```

Each journey compiles the consumer in `fixture/shop-1.ts.txt` and `fixture/shop-2.ts.txt`, joined in that order, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The aggregate form needs a driver that turns a per-row subquery into a correlated lookup; the journey runs on `@antelopejs/mongodb`.
