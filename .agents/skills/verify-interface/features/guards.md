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
  - src/internal/properties.ts
  - src/internal/prototypes.ts
  - src/internal/read-properties.ts
  - src/internal/table-reference.ts
  - src/internal/tables.ts
  - src/internal/validation.ts
docs:
  - docs/3.routes.md
journeys:
  - get-guard
  - guard-unlocked
  - amend-body
  - custom-route
  - guard-semantics
---

# guards

A module guards a read, amends a body or adds a route beyond CRUD.

## Sub-features

- `get-guard`: `DefaultRoutes.WithGetGuard` denies a read by throwing (the stored discriminator never appears in the answer), a missing row answers 404 without the guard, and a plain `get` route is not guarded.
- `guard-unlocked`: a `WithGetGuard` guard on `/articles/translated` reads the localized `title` unlocked with the request's `x-content-language`: the English read passes it, a German read finds no title and answers the guard's 404, and the plain `get` answers both.
- `amend-body`: a route that wraps `new`, parses the body with `Validation.ParseBody` and stamps a field stores the stamped value, while the plain `new` stores what was sent.
- `custom-route`: a route declared with `func`, `args` and `method` is served next to the defaults.
- `guard-semantics`: `WithGetGuard` allows the read on a normal return even of `false`, runs with the controller as `this` and the parsed Get parameters, runs for a stored row, and is skipped for a missing one (404).

## How to get to it (user POV)

- `GET /documents/invoice?id=x2` on a route built with `DefaultRoutes.WithGetGuard`; `POST /documents/stamped`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" guards
```

Each journey compiles the consumer in `fixture/shop-1.ts.txt` and `fixture/shop-2.ts.txt`, joined in that order, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The guard-throws-`HTTPResult` and `assert` forms answer the same; the journey uses `assert`.
