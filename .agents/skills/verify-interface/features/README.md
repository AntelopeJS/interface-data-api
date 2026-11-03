# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, `journeys:` the journeys it runs, and `seeded-breaks/<feature>.patch` the break its journeys must catch. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

| Feature | What the user does | Journeys |
|---|---|---|
| [crud](crud.md) | A client calls the five default routes of a data controller. | crud-lifecycle, crud-errors, crud-subset |
| [route-options](route-options.md) | A route is customized with `WithOptions`. | option-overrides |
| [access](access.md) | `@Access` decides what each route reads and writes. | access-modes |
| [validation](validation.md) | `@Mandatory`, `@Validator` and `@Optional` check the body. | mandatory-and-validators, parsed-values, unstorable-body, error-codes |
| [listing](listing.md) | A client pages, sorts and narrows a list. | pluck-modes, pagination, sorting |
| [foreign](foreign.md) | A key field answers the record it points to. | foreign-resolve, foreign-raw |
| [filters](filters.md) | A list request filters rows. | default-filter, custom-filters |
| [modifiers](modifiers.md) | A per-request key selects a modifier's value. | localized-key |
| [joined](joined.md) | A remote field is flattened onto the row. | joined-read |
| [computed](computed.md) | A row answers a database-computed value. | computed-read |
| [guards](guards.md) | A module guards a read, amends a body or adds a route. | get-guard, amend-body, custom-route |
| [metadata](metadata.md) | A module author reads metadata and declares controllers. | effective-modes, declaration-errors, exports-runtime, consumer-compiles |
| [smoke](smoke.md) | The fixed journey every verdict runs. | every-function, smoke-roundtrip |

## Not driven

Every documented behaviour of the README, `docs/` and the TSDoc has a journey above, or a row here with the reason.

| Behaviour | Why no journey drives it |
|---|---|
| Multi-reference element that matches nothing answers `null` (docs/7) | Fails on head: it answers `{}`. Drafted as an issue; a journey would make every foreign verdict FAIL. |
| `noForeign` answers raw ids for a multi reference (docs/7) | Fails on head: the ids become character-index objects. Drafted as an issue. |
| A list mode a getter does not declare omits the getter (docs/6) | `/people/brief` still lists the getter. Drafted as an issue. |
| `Unregistered Database Table` (docs/2) | Needs a registered schema that lacks the table class; `@RegisterTable` registers the table. |
| Class metadata and `schema` option name different schemas, the declaration throws (docs/7, docs/10) | Needs a table class whose metadata names a second schema; declaration-time only, no route reaches it. |
| Edit `index` option (docs/3) | The `get` index option is driven; the edit variant needs a second unique index column in the fixture. |
| `@Joined` `remoteIndex` (docs/10) | Needs an indexed non-key column on the remote table. |
| `@Foreign` `targetMeta` joined fields (docs/7) | Needs a second data controller's metadata passed to the decorator. |
| `Query.List` and `Query.ListPage` composed by a custom route, deferred lookup order, bare `count()` skips lookups, `changes()` (docs/10) | Advanced composition by internal helpers; the default list route is driven for the same joined and computed fields. |
| `useIndex`: an indexed equality filter reads through the index (docs/8) | Not observable from an answer; only the query plan differs. |
| `noIndex` changes where the sort sits, the provider decides how it runs (docs/6) | Both settings answer the same rows; the sort is checked for both. |
| `@Localized` sort on `fallbackLocale`, never indexed (docs/6) | The fallback is configured in the modifier, outside this package. |
| `@Hashed`, `@Encrypted` and `EncryptionModifier.unlockrequest` in filters (docs/8, docs/9) | Modifiers of `@antelopejs/interface-database-decorators`; only `@ModifierKey` is this package's. |
| Clearing a mandatory field on edit with `[]` (docs/5) | Same check as `""` and `null`, which are driven. |
| `@Optional` clears what `@Mandatory` set (docs/5) | Only absence on `new` is driven. |
| A wrapped `new` or `edit` receives `Date` or `undefined` values (docs/5) | Needs a route that builds a body with those; the bigint refusal is driven. |
| `500` when the database operation fails or the controller holds no model (docs/3) | Needs a broken database or a controller without `@ModelReference`. |
| An async uniqueness check followed by an insert is not unique under concurrency (docs/5) | Advice about the application's own validator, not package behaviour. |
| `DataControllerCallback<O, R, A>` generic wrappers, `GetGuard` `this` typing (docs/3) | Type-level; the docs-check snippets in CI compile them. |
| Install commands, implementations table, compatibility table, contributing (README) | Prose; the compatibility table is checked by the docs action. |
