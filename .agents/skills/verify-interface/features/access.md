---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/properties.ts
  - src/internal/read-properties.ts
docs:
  - docs/4.access-rights.md
journeys:
  - access-modes
  - listable-alone
  - read-overrides
---

# access

`@Access` decides which fields each route reads and writes, per action.

## Sub-features

- `access-modes`: a write-only field is never answered and is stored, a field with no `@Access` is never answered and never written, a read-only field is answered and ignored in a body, and a per-action override (`role` writable on `new` and read-only on `edit`, `age` the other way) decides what `new` and `edit` store; MongoDB shows each case.
- `listable-alone`: a field that is only `@Listable` never appears in a response, and a route that skips the mandatory check still runs the validators.
- `read-overrides`: `@Access(mode, { get, list })` hides a field on one action and grants it on the other, in both directions (readable by default and write-only on an action, write-only by default and read-only on an action), `new` writes a write-only field, and `GetEffectiveMode` answers what the routes apply.

## How to get to it (user POV)

- `@Access(AccessMode.WriteOnly)` on a password, then `POST /users/new` and `GET /users/get`; `@Access(AccessMode.ReadWrite, { edit: AccessMode.ReadOnly })` on a role, then `PUT /users/edit`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" access
```

Each journey compiles the consumer in `fixture/shop-1.ts.txt` and `fixture/shop-2.ts.txt`, joined in that order, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- A refused write is not an error: the route ignores the value and answers 200.
