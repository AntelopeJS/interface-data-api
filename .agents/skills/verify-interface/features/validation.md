---
covers:
  - src/internal/validation.ts
  - src/internal/guards.ts
docs:
  - docs/5.validators.md
journeys:
  - mandatory-and-validators
  - parsed-values
  - unstorable-body
  - error-codes
---

# validation

`@Mandatory`, `@Validator` and `@Optional` check the body of `new` and `edit`.

## Sub-features

- `mandatory-and-validators`: a body missing mandatory fields answers `{ code: "missing_mandatory_fields", fields }` with every field, the mandatory check runs before the validators, invalid values answer `{ code: "invalid_field_types", fields }` with every failing field (a sync regex, a range and an async validator), a refused write stores nothing, an edit keeps a mandatory field absent from the body and refuses one cleared with `""` or `null`.
- `parsed-values`: a validator that returns a zod-style parse result makes `new` and `edit` store the parsed `Date`, and a failed parse answers the invalid-types body.
- `unstorable-body`: a route that hands `Validation.ParseBody` a parsed body holding a `bigint` answers 400 and writes nothing.
- `error-codes`: the packed `components` entry exports `Validation.MISSING_MANDATORY_FIELDS` and `Validation.INVALID_FIELD_TYPES` with the codes the bodies carry.

## How to get to it (user POV)

- `POST /users/new` with a body that lacks `email`, or holds `age: 500`, or `nickname: "taken"`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" validation
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- Clearing a mandatory field with `[]` on `edit` is documented and not driven: see the README table.
