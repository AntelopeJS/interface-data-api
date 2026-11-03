---
covers:
  - src/internal/foreign.ts
  - src/internal/table-reference.ts
docs:
  - docs/7.foreign-keys.md
journeys:
  - foreign-resolve
  - foreign-raw
---

# foreign

A field that holds a key of another table answers the record it points to.

## Sub-features

- `foreign-resolve`: `@Foreign` answers the referenced record in place of the key: with `pluck`, through a secondary `index`, by table name, across schemas, and as an array (`multi`); a key that matches nothing answers `null`.
- `foreign-raw`: the `noForeign` route option answers the raw keys of single references on a get and on a list.

## How to get to it (user POV)

- `GET /orders/get?id=o1` on a controller whose `userId` field is declared `@Foreign(User, undefined, false, ["_id", "name", "email"])`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" foreign
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- Two documented behaviours of multi references fail on head and are not asserted: a missing element answers `{}` and not `null`, and `noForeign` answers character-index objects and not the raw ids. Both are drafted as issues.
