---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/foreign.ts
  - src/internal/list.ts
  - src/internal/table-reference.ts
  - src/internal/tables.ts
  - src/internal/validation.ts
docs:
  - docs/7.foreign-keys.md
journeys:
  - foreign-resolve
  - foreign-raw
  - issue-93-multi-foreign
  - no-foreign-strings
  - foreign-declaration-throws
  - foreign-unplucked
---

# foreign

A field that holds a key of another table answers the record it points to.

## Sub-features

- `foreign-resolve`: `@Foreign` answers the referenced record in place of the key: with `pluck`, through a secondary `index`, by table name, across schemas, and as an array (`multi`); a key that matches nothing answers `null`.
- `foreign-raw`: the `noForeign` route option answers the raw keys of single references on a get and on a list.
- `issue-93-multi-foreign`: fails on purpose until [#93](https://github.com/AntelopeJS/interface-data-api/issues/93) is fixed: a multi reference answers `null` for a missing element and raw ids with `noForeign`.
- `no-foreign-strings`: the Get `noForeign` option skips resolving for any non-empty string, `"false"` included, and not for `""` or when absent; the List option is a boolean.
- `foreign-declaration-throws`: `@Foreign` throws at declaration for a schema mismatch between the class and the `schema` parameter, and for a string table name with no class registered in that schema.
- `foreign-unplucked`: a foreign key without `pluck` answers the whole target row, including fields the target controller's `@Access` hides.

## How to get to it (user POV)

- `GET /orders/get?id=o1` on a controller whose `userId` field is declared `@Foreign(User, undefined, false, ["_id", "name", "email"])`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" foreign
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- A missing element of a multi reference answers `{}` and `noForeign` spreads its ids into character-index objects: [#93](https://github.com/AntelopeJS/interface-data-api/issues/93), driven by `issue-93-multi-foreign`.
