---
covers:
docs:
  - README.md
journeys:
  - every-function
  - smoke-roundtrip
---

# smoke

The fixed journey every verdict runs: the exports answer through core, and one row goes through the four write and read routes.

## Sub-features

- `every-function`: the packed interface loads in `ajs project dev` next to a stub provider and a consumer; the pack walks the declared exports and the `interface.calls` hooks of `verify.config.ts` call each plain function through core and state what it must return (the seventeen functions of the package entry: `DataController`, `GetDataControllerMeta`, `RegisterDataController`, `DefaultRoutes.WithOptions`, `DefaultRoutes.WithGetGuard` and the ten route functions). The package has no proxy, so the stub provider has nothing to implement.
- `smoke-roundtrip`: a user is created through `POST /users/new`, read through `GET /users/get`, edited through `PUT /users/edit`, deleted through `DELETE /users/delete` and gone on the next read, with the consumer, `@antelopejs/api` and `@antelopejs/mongodb` running in `ajs project dev`.

## How to get to it (user POV)

- A module imports `@antelopejs/interface-data-api` and declares one data controller; the project loads an API module and a database module.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" smoke
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The smoke feature covers no glob, so it never marks a file as mapped.
- `every-function` covers the hooks of `verify.config.ts`; a new export of the package entry needs a hook there, or the journey fails on it.
