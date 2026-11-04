---
covers:
  - src/index.ts
  - src/internal/controller-types.ts
  - src/internal/properties.ts
docs:
  - README.md
  - docs/1.introduction.md
  - docs/2.data-controllers.md
  - docs/3.routes.md
journeys:
  - crud-lifecycle
  - crud-errors
  - crud-subset
  - new-row-shape
  - edit-setters
  - edit-answers-foreign
  - unstorable-body
---

# crud

A client calls the five default routes of a data controller and the table follows.

## Sub-features

- `crud-lifecycle`: `new`, `get`, `edit` and `delete` on the `users` controller change exactly the rows they name: the write-only password is stored but never answered, the age allowed on `new` is stored, an edit keeps the fields it was not sent, and a delete of two ids and one that does not exist leaves every other row; MongoDB shows each write.
- `crud-errors`: `Missing id.` (400), `Not Found` (404), `Invalid JSON body.` and `The request body must be a JSON object.` (400) on every route that reads them, a delete of an unknown id answers 200, and no refused request writes a row.
- `crud-subset`: a controller that declares only `get`, `list` and `new` answers 404 on `edit` and `delete`; `WithOptions(Edit, options, "patch")` serves under `patch` and not under its key; a controller derived with `Controller("/staff", UserAPI)` reads through the inherited model reference.
- `new-row-shape`: `new` answers its `_id` on a controller whose `_id` has no `@Access`, starts from the defaults the controller class declares, and runs every writable setter, with `undefined` for a field absent from the body.
- `edit-setters`: `edit` runs the setters of the fields present in the body and no other, and the class defaults do not overwrite stored fields.
- `edit-answers-foreign`: `edit` answers the stored record with its foreign fields resolved.
- `unstorable-body`: a route that hands `Validation.ParseBody` a parsed body holding a `bigint` answers 400 and writes nothing.

## How to get to it (user POV)

- `GET /users/get?id=`, `GET /users/list`, `POST /users/new`, `PUT /users/edit?id=`, `DELETE /users/delete?id=` on a controller declared with `DataController(Table, DefaultRoutes.All, Controller("/users"))`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" crud
```

Each journey compiles the consumer in `fixture/shop.ts.txt`, starts `ajs project dev` with `@antelopejs/api` and `@antelopejs/mongodb` against a Docker MongoDB, drives the routes with curl and reads the writes back with `mongosh`.

## Gotchas

- The delete route answers an empty body, not `0`, when nothing matched; the journey checks the status only.
- `Unregistered Database Table` is not driven: see the README table.
