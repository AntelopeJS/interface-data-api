# Feature map

One file per feature. `covers:` lists every source file that computes something one of the feature's journeys checks, `docs:` the pages a verdict judges, and `journeys:` the journeys it runs. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

`plan` selects a feature only through `covers:`, so a file a journey depends on but its feature does not list is a break no verdict runs. A file goes under every feature whose journeys check its behaviour, not only the feature named after it. `src/index.ts` (the routes pick the action, lock and unlock modifiers, and run the guard), `src/components.ts` (the route parameters and the `Query` and `Validation` steps) and `src/metadata.ts` (every decorator) serve every feature, so every feature lists them. When a journey starts checking a new file, add that file to the journey's feature.

| Feature | What the user does | Journeys |
|---|---|---|
| [crud](crud.md) | A client calls the five default routes of a data controller. | crud-lifecycle, crud-errors, crud-subset, new-row-shape, edit-setters, edit-answers-foreign, unstorable-body |
| [route-options](route-options.md) | A route is customized with `WithOptions`. | option-overrides, list-unknown, issue-90-edit-index, no-mandatory-strings, no-pluck-strings, no-model-500, option-beats-query |
| [access](access.md) | `@Access` decides what each route reads and writes. | access-modes, listable-alone, read-overrides |
| [validation](validation.md) | `@Mandatory`, `@Validator` and `@Optional` check the body. | mandatory-and-validators, parsed-values, error-codes, empty-forms, mandatory-before-validators, holey-body |
| [listing](listing.md) | A client pages, sorts and narrows a list. | pluck-modes, pagination, sorting, issue-92-getter-mode |
| [foreign](foreign.md) | A key field answers the record it points to. | foreign-resolve, foreign-raw, foreign-multi, no-foreign-strings, foreign-declaration-throws, foreign-unplucked |
| [filters](filters.md) | A list request filters rows. | default-filter, custom-filters, filter-details, route-filters-list-only |
| [modifiers](modifiers.md) | A per-request key selects a modifier's value. | localized-key |
| [joined](joined.md) | A remote field is flattened onto the row. | joined-read, joined-access |
| [computed](computed.md) | A row answers a database-computed value. | computed-read, computed-access |
| [guards](guards.md) | A module guards a read, amends a body or adds a route. | get-guard, guard-unlocked, amend-body, custom-route, guard-semantics |
| [metadata](metadata.md) | A module author reads metadata and declares controllers. | effective-modes, declaration-errors, exports-runtime, consumer-compiles, derived-own-model, foreign-target-meta |
| [smoke](smoke.md) | The fixed journey every verdict runs. | every-function, smoke-roundtrip |

## Not driven

Every documented behaviour of the README, `docs/` and the TSDoc has a journey above, or a row here with the reason.

| Behaviour | Why no journey drives it |
|---|---|
| `Unregistered Database Table` (docs/2) | Needs a registered schema that lacks the table class; `@RegisterTable` registers the table. |
| Class metadata and `schema` option name different schemas, the declaration throws (docs/7, docs/10) | Needs a table class whose metadata names a second schema; declaration-time only, no route reaches it. |
| `@Joined` `remoteIndex` (docs/10) | Needs an indexed non-key column on the remote table. |
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
