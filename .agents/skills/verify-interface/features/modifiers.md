---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/list.ts
  - src/internal/prototypes.ts
  - src/internal/validation.ts
docs:
  - docs/9.modifiers.md
journeys:
  - localized-key
---

# modifiers

A modifier that needs a per-request value takes it from a controller field.

## Sub-features

- `localized-key`: `@ModifierKey(LocalizationModifier)` on a field read from the `x-content-language` header selects the language a write stores and a read answers: English on create, French on edit, both kept in MongoDB, an edit without the title keeps both, and a list sorts on the title in the request locale, ascending and descending.

## How to get to it (user POV)

- `POST /articles/new` with `x-content-language: en`, then `PUT /articles/edit?id=` with `fr`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" modifiers
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The sort on a fallback locale is not driven: the modifier that defines it is configured outside this package.
