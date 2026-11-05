# Feature map

One file per feature. `covers:` lists every source file that computes something one of the feature's journeys checks, `docs:` the pages a verdict judges, `journeys:` the journeys it runs, and `seeded-breaks/<feature>.patch` the break its journeys must catch. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

`plan` selects a feature only through `covers:`, so a file a journey depends on but its feature does not list is a break no verdict runs. A file goes under every feature whose journeys check its behaviour, not only the feature named after it. `src/index.ts` (the routes pick the action, lock and unlock modifiers, and run the guard), `src/components.ts` (the route parameters and the `Query` and `Validation` steps) and `src/metadata.ts` (every decorator) serve every feature, so every feature lists them. When a journey starts checking a new file, add that file to the journey's feature.

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
| [guards](guards.md) | A module guards a read, amends a body or adds a route. | get-guard, guard-unlocked, amend-body, custom-route |
| [metadata](metadata.md) | A module author reads metadata and declares controllers. | effective-modes, declaration-errors, exports-runtime, consumer-compiles |
| [smoke](smoke.md) | The fixed journey every verdict runs. | every-function, smoke-roundtrip |

## Known issues, driven on purpose

Three journeys fail on head and cite their issue: `issue-90-edit-index` ([#90](https://github.com/AntelopeJS/interface-data-api/issues/90)), `issue-92-getter-mode` ([#92](https://github.com/AntelopeJS/interface-data-api/issues/92)) and `issue-93-multi-foreign` ([#93](https://github.com/AntelopeJS/interface-data-api/issues/93)). A verdict that runs their features is FAIL until the issue is fixed; the fix turns the journey green.

## Not driven

Every documented behaviour of the README, `docs/` and the TSDoc has a journey above, or a row here with the reason.

| Behaviour | Why no journey drives it |
|---|---|
| `Unregistered Database Table` (docs/2) | Needs a registered schema that lacks the table class; `@RegisterTable` registers the table. |
| Class metadata and `schema` option name different schemas, the declaration throws (docs/7, docs/10) | Needs a table class whose metadata names a second schema; declaration-time only, no route reaches it. |
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
