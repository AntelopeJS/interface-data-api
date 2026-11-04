---
covers:
  - src/internal/default-filter.ts
  - src/internal/list.ts
  - src/internal/filters.ts
docs:
  - docs/8.filters.md
journeys:
  - default-filter
  - custom-filters
  - filter-details
---

# filters

A list request filters rows through `@Filter` query parameters.

## Sub-features

- `default-filter`: `filter_<field>=<value>` and `<operator>:<value>` with `eq`, `ne`, `gt`, `ge`, `lt`, `le`, several fields at once, the `eq:` prefix for a value that holds a colon, a parameter that names no filter is ignored, and an unknown operator answers the 400 message that lists the operators.
- `custom-filters`: a custom function parses its own value (numbers with `gt`/`ge`/`lt`, the same field twice is an AND, `Invalid number` is a 400), a domain filter escapes its value and refuses other operators, and a mandatory route filter wins on its field while the request filters on the other fields still apply.
- `filter-details`: an indexed field filtered twice applies both filters, a filter function receives the controller as `context.this`, a custom filter with `useIndex` unset runs its function, and the default filter compares strings.

## How to get to it (user POV)

- `GET /users/list?filter_status=active&filter_role=ne:admin`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" filters
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- Whether an equality filter reads through the index is not observable from the answers: see the README table.
