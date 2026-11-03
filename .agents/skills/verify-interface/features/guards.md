---
covers:
  - src/index.ts
docs:
  - docs/3.routes.md
journeys:
  - get-guard
  - amend-body
  - custom-route
---

# guards

A module guards a read, amends a body or adds a route beyond CRUD.

## Sub-features

- `get-guard`: `DefaultRoutes.WithGetGuard` denies a read by throwing (the stored discriminator never appears in the answer), a missing row answers 404 without the guard, and a plain `get` route is not guarded.
- `amend-body`: a route that wraps `new`, parses the body with `Validation.ParseBody` and stamps a field stores the stamped value, while the plain `new` stores what was sent.
- `custom-route`: a route declared with `func`, `args` and `method` is served next to the defaults.

## How to get to it (user POV)

- `GET /documents/invoice?id=x2` on a route built with `DefaultRoutes.WithGetGuard`; `POST /documents/stamped`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" guards
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The guard-throws-`HTTPResult` and `assert` forms answer the same; the journey uses `assert`.
