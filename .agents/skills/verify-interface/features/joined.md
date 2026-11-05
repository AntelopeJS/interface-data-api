---
covers:
  - src/index.ts
  - src/components.ts
  - src/metadata.ts
  - src/internal/deferred-joined-stream.ts
  - src/internal/joined.ts
  - src/internal/list.ts
  - src/internal/table-reference.ts
  - src/internal/tables.ts
docs:
  - docs/10.joined.md
journeys:
  - joined-read
  - joined-access
---

# joined

A list or get answers one field of another table at the top level of the row.

## Sub-features

- `joined-read`: `@Joined` flattens a remote field onto the row (same schema and across schemas), a missing remote row joins as `null`, the list sorts and filters on the joined value in the database, and the field is read-only: an edit that sends it stores nothing.
- `joined-access`: an `@Access` written above `@Joined` replaces its read-only mode.

## How to get to it (user POV)

- `GET /books/list?sortKey=authorName` on a controller whose `authorName` is `@Joined({ table: Author, localKey: "authorId", remoteField: "name" })`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" joined
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The order of the deferred lookups of `Query.ListPage` is not driven: see the README table.
