# Changelog

## v0.7.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.6.3...v0.7.0)

### Upgrade notes

- **Breaking:** `RowFields` is removed ([#126](https://github.com/AntelopeJS/interface-data-api/pull/126)). Import `StoredRow` from `@antelopejs/interface-data-api/metadata` instead. Its values are typed: a value a database stores (`WriteValue`), a relation's row instance, a nested `StoredRow`, or a list of those. `Query.ReadProperties`, `Query.WriteProperties`, `Validation.Lock`, `Validation.Unlock`, `Validation.ClearInternal` and the `get`, `edit` and list routes of `DefaultRoutes`, including `GetGuard`'s `current`, take or answer `StoredRow`. Code that read a field as `unknown` and narrowed it keeps working; code that wrote a value outside that type no longer compiles.
- **Breaking:** a getter that returns a `bigint`, a `symbol` or a function, or an object holding one (an own `toJSON` method or arrow-function field counts), now fails the read with `500` instead of sending it ([#126](https://github.com/AntelopeJS/interface-data-api/pull/126)). Return a stored value instead, for example `String(total)` for a `bigint`, or `null`.
- **Breaking:** a decorated field whose class default is such a value, or a setter that writes one into `this.table`, now fails the write with `500` before the modifiers and the `insert`/`update` event run. A related row from `@Foreign` that holds one fails the read with `500` ([#126](https://github.com/AntelopeJS/interface-data-api/pull/126)). Convert the value in the default or the setter, or move a callback off the decorated fields.
- Inside a getter or setter, `this` holds only the row fields and `table` as own properties; the controller's other fields are inherited ([#126](https://github.com/AntelopeJS/interface-data-api/pull/126)). Read them as `this.name`; do not enumerate `this`. The default of a non-decorated member, such as an arrow-function field, is no longer re-applied over the controller's current value on create.

### 💅 Refactors

- **deferred-join:** Forward stream operations through one typed view ([#123](https://github.com/AntelopeJS/interface-data-api/pull/123))
- **tables:** Type the plucked lookup side as the stream it is ([#124](https://github.com/AntelopeJS/interface-data-api/pull/124))
- **rows:** ⚠️  Type table rows as the values a database stores ([#126](https://github.com/AntelopeJS/interface-data-api/pull/126))

### 📖 Documentation

- **readme:** Adopt the AntelopeJS framework README style ([#122](https://github.com/AntelopeJS/interface-data-api/pull/122))

### ✅ Tests

- **parse-body:** Feed type-forbidden bodies from a plain JS spec ([#125](https://github.com/AntelopeJS/interface-data-api/pull/125))

#### ⚠️ Breaking Changes

- **rows:** ⚠️  Type table rows as the values a database stores ([#126](https://github.com/AntelopeJS/interface-data-api/pull/126))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.6.3

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.6.2...v0.6.3)

### 🔥 Performance

- **filters:** Parse a filter value in linear time ([#121](https://github.com/AntelopeJS/interface-data-api/pull/121))

### 📦 Build

- **deps:** Update @antelopejs/tooling-configs to 0.5.0 ([#119](https://github.com/AntelopeJS/interface-data-api/pull/119))
- **deps:** Bump @antelopejs/tooling-configs to 0.5.1 ([#120](https://github.com/AntelopeJS/interface-data-api/pull/120))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.6.2

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.6.1...v0.6.2)

### 🚀 Enhancements

- **skills:** Add the verify-interface and formal-field-access skills ([#91](https://github.com/AntelopeJS/interface-data-api/pull/91))

### 🔥 Performance

- **verify:** Compile the shop once per verify run ([#111](https://github.com/AntelopeJS/interface-data-api/pull/111))

### 🩹 Fixes

- **verify:** List every source file a feature's journeys run in its covers ([#110](https://github.com/AntelopeJS/interface-data-api/pull/110))
- **list:** Leave out getters the route's pluck mode does not list ([#117](https://github.com/AntelopeJS/interface-data-api/pull/117))
- **validation:** Read request bodies and field tables by own keys ([#112](https://github.com/AntelopeJS/interface-data-api/pull/112))
- **foreign:** Keep missing elements and raw ids of a multi reference ([#116](https://github.com/AntelopeJS/interface-data-api/pull/116))
- **routes:** Update the row the Edit index option finds ([#113](https://github.com/AntelopeJS/interface-data-api/pull/113))

### 📦 Build

- **deps:** Bump @antelopejs packages to the 2026-11-06 releases ([#109](https://github.com/AntelopeJS/interface-data-api/pull/109))
- **deps:** Bump @antelopejs/tooling-configs to 0.4.0 ([#118](https://github.com/AntelopeJS/interface-data-api/pull/118))

### 🏡 Chore

- **verify:** Remove seeded runs from the verification skill ([#106](https://github.com/AntelopeJS/interface-data-api/pull/106))
- **ci:** Remove the weekly mutation caller ([#107](https://github.com/AntelopeJS/interface-data-api/pull/107))

### 🤖 CI

- Call ci-node.yml@v1 ([#108](https://github.com/AntelopeJS/interface-data-api/pull/108))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.6.1

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.6.0...v0.6.1)

### 🏡 Chore

- Land the cleanup campaign on main ([#105](https://github.com/AntelopeJS/interface-data-api/pull/105))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.6.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.5.0...v0.6.0)

### 💅 Refactors

- **components:** Assert the generic parameter key once in ExtractGeneric ([#55](https://github.com/AntelopeJS/interface-data-api/pull/55))

### 📖 Documentation

- **readme:** Use one Discord invite ([#70](https://github.com/AntelopeJS/interface-data-api/pull/70))
- **github:** Send questions and ideas to Discord ([#87](https://github.com/AntelopeJS/interface-data-api/pull/87))
- **readme:** Link the package to AntelopeJS and AntelopeJS DMS ([2a900b4](https://github.com/AntelopeJS/interface-data-api/commit/2a900b4))

### 📦 Build

- **deps:** Bump @antelopejs/tooling-configs to 0.2.17 ([#58](https://github.com/AntelopeJS/interface-data-api/pull/58))

### 🏡 Chore

- Land the cleanup campaign on main ([#102](https://github.com/AntelopeJS/interface-data-api/pull/102))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.5.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.4.0...v0.5.0)

### 🚀 Enhancements

- **data-api:** ⚠️  Tighten the published contract ([#54](https://github.com/AntelopeJS/interface-data-api/pull/54))

### 💅 Refactors

- Clean the repo with the guardrail pack ([#51](https://github.com/AntelopeJS/interface-data-api/pull/51))
- Clear avoidable findings with pack 0.2.11 ([#53](https://github.com/AntelopeJS/interface-data-api/pull/53))

### 📖 Documentation

- **changelog:** Upgrade notes of interface-data-api 0.4.0 ([#46](https://github.com/AntelopeJS/interface-data-api/pull/46))

### 🏡 Chore

- Adopt the guardrail pack from tooling-configs 0.2.0 ([#47](https://github.com/AntelopeJS/interface-data-api/pull/47))
- Configure Renovate with the shared preset ([#48](https://github.com/AntelopeJS/interface-data-api/pull/48))

### ✅ Tests

- **skills:** Add eval cases for data-api-interface ([#49](https://github.com/AntelopeJS/interface-data-api/pull/49))

#### ⚠️ Breaking Changes

- **data-api:** ⚠️  Tighten the published contract ([#54](https://github.com/AntelopeJS/interface-data-api/pull/54))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.4.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.3.0...v0.4.0)

### Upgrade notes

- **Breaking:** `Validation.MandatoryFields` now answers `400 { code: "missing_mandatory_fields", fields: [...] }` instead of the text `Missing mandatory fields: …`, and `Validation.ValidateTypes` answers `400 { code: "invalid_field_types", fields: [...] }` instead of `Invalid field type(s): …` ([#45](https://github.com/AntelopeJS/interface-data-api/pull/45)). There is no English `message` alongside. Clients must read `code` and `fields`; the constants `Validation.MISSING_MANDATORY_FIELDS`, `Validation.INVALID_FIELD_TYPES` and the type `Validation.FieldsErrorBody` are exported from `components`. `@antelopejs/dms` 0.11 reads this body and requires `>=0.4.0`.
- `Components.List` sorts a `@Localized` field on the value in the request's locale (else its `fallbackLocale`) instead of the stored per-language record ([#44](https://github.com/AntelopeJS/interface-data-api/pull/44)). Such a sort never takes the indexed path. Requires `@antelopejs/interface-database-decorators` `>=0.1.10 <1.0.0`.

### 🚀 Enhancements

- **validation:** ⚠️  Structured 400 for mandatory and invalid fields ([#45](https://github.com/AntelopeJS/interface-data-api/pull/45))

### 🩹 Fixes

- **list:** Sort a localized field in the request's locale ([#44](https://github.com/AntelopeJS/interface-data-api/pull/44))

#### ⚠️ Breaking Changes

- **validation:** ⚠️  Structured 400 for mandatory and invalid fields ([#45](https://github.com/AntelopeJS/interface-data-api/pull/45))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.2.2...v0.3.0)

### 🚀 Enhancements

- **routes:** ⚠️  Computed before foreign, AND filters, row responses and parsed bodies ([#43](https://github.com/AntelopeJS/interface-data-api/pull/43))

### 📖 Documentation

- Improve task-based onboarding and contract guidance ([#40](https://github.com/AntelopeJS/interface-data-api/pull/40))
- Clarify learning paths and illustrate real outcomes ([#42](https://github.com/AntelopeJS/interface-data-api/pull/42))

#### ⚠️ Breaking Changes

- **routes:** ⚠️  Computed before foreign, AND filters, row responses and parsed bodies ([#43](https://github.com/AntelopeJS/interface-data-api/pull/43))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.2.1...v0.2.2)

### 📖 Documentation

- Rewrite the README ([#37](https://github.com/AntelopeJS/interface-data-api/pull/37))
- **agents:** Simplify repository guidance ([#38](https://github.com/AntelopeJS/interface-data-api/pull/38))
- Correct list modes, typed filters and get guards ([#39](https://github.com/AntelopeJS/interface-data-api/pull/39))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.1

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.2.0...v0.2.1)

### 🩹 Fixes

- **components:** Recognise controllers and tables from another interface instance ([#35](https://github.com/AntelopeJS/interface-data-api/pull/35))

### ❤️ Contributors

- Thomas ([@Thomasims](http://github.com/Thomasims))

## v0.2.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.10...v0.2.0)

### 🩹 Fixes

- **routes:** ⚠️  Make edit partial and write validator-parsed values ([#33](https://github.com/AntelopeJS/interface-data-api/pull/33))
- **metadata:** Inherit the model key in derived data controllers ([#34](https://github.com/AntelopeJS/interface-data-api/pull/34))

#### ⚠️ Breaking Changes

- **routes:** ⚠️  Make edit partial and write validator-parsed values ([#33](https://github.com/AntelopeJS/interface-data-api/pull/33))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.10

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.9...v0.1.10)

### 🏡 Chore

- Replace Biome with oxlint, oxfmt and Knip ([#24](https://github.com/AntelopeJS/interface-data-api/pull/24))
- Align community files with the organization defaults ([#27](https://github.com/AntelopeJS/interface-data-api/pull/27))
- Remove .git-blame-ignore-revs ([#28](https://github.com/AntelopeJS/interface-data-api/pull/28))

### 🤖 CI

- Use shared npm release workflow ([#26](https://github.com/AntelopeJS/interface-data-api/pull/26))
- **release:** Release next from a dedicated branch and restore requireCommits ([#29](https://github.com/AntelopeJS/interface-data-api/pull/29))
- **release:** Reference the shared release workflows through v1 ([#30](https://github.com/AntelopeJS/interface-data-api/pull/30))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Thomas

## v0.1.9

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.8...v0.1.9)

### 🩹 Fixes

- Merge mandatory filters and add loaded-model Get guard ([#25](https://github.com/AntelopeJS/interface-data-api/pull/25))

### 🤖 CI

- Standardize npm releases ([#23](https://github.com/AntelopeJS/interface-data-api/pull/23))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.8

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.7...v0.1.8)

### 🩹 Fixes

- Resolve deferred joined fields from the List stream itself ([#21](https://github.com/AntelopeJS/interface-data-api/pull/21), [#22](https://github.com/AntelopeJS/interface-data-api/pull/22))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>

## v0.1.7

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.6...v0.1.7)

### 🚀 Enhancements

- **skills:** Ship a consumer skill with the package ([#20](https://github.com/AntelopeJS/interface-data-api/pull/20))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v0.1.6

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.5...v0.1.6)

### 🔥 Performance

- Defer unused joined-field lookups to the paginated page ([#18](https://github.com/AntelopeJS/interface-data-api/pull/18))

### 📖 Documentation

- Declare table fields with @Field and @Relation decorators in examples ([#19](https://github.com/AntelopeJS/interface-data-api/pull/19))

### ✅ Tests

- Declare table fields with @Field and @Relation decorators in fixtures ([#16](https://github.com/AntelopeJS/interface-data-api/pull/16))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>
- Antony Rizzitelli <upd4ting@gmail.com>

## v0.1.5

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.4...v0.1.5)

### 🩹 Fixes

- Resolve target @Joined fields through relation lookups ([#15](https://github.com/AntelopeJS/interface-data-api/pull/15))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>

## v0.1.4

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.3...v0.1.4)

## v0.1.3

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.2...v0.1.3)

### 🚀 Enhancements

- Add Computed field decorator for in-database computed values ([#12](https://github.com/AntelopeJS/interface-data-api/pull/12))

### 🩹 Fixes

- **types:** Cast ValueProxy arguments to satisfy Table signatures ([2bc5f09](https://github.com/AntelopeJS/interface-data-api/commit/2bc5f09))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v0.1.2

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- Declare interface as standalone ([06e7392](https://github.com/AntelopeJS/interface-data-api/commit/06e7392))

### 🩹 Fixes

- **components:** Guard null foreign values in Validation.Unlock ([#11](https://github.com/AntelopeJS/interface-data-api/pull/11))

### 📖 Documentation

- Document @Joined decorator and @Foreign cross-schema schema param ([c41a51c](https://github.com/AntelopeJS/interface-data-api/commit/c41a51c))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>
- Thomasims <thomasims3@hotmail.fr>

## v0.1.1

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- Support cross-schema targets for Foreign and Joined decorators ([56fad2b](https://github.com/AntelopeJS/interface-data-api/commit/56fad2b))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v0.1.0

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.0.4...v0.1.0)

### 🚀 Enhancements

- Add Joined field decorator for native cross-table flattening ([#10](https://github.com/AntelopeJS/interface-data-api/pull/10))

### 🏡 Chore

- Bump @antelopejs/mongodb to 1.0.8 in test config ([128fd75](https://github.com/AntelopeJS/interface-data-api/commit/128fd75))
- Bump @antelopejs/interface-database{,-decorators} to ^0.1.1 ([9ef87c6](https://github.com/AntelopeJS/interface-data-api/commit/9ef87c6))

### 🎨 Styles

- **tests:** Sort RegisterSchema import alphabetically ([14a8be6](https://github.com/AntelopeJS/interface-data-api/commit/14a8be6))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v0.0.4

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.0.3...v0.0.4)

### 🏡 Chore

- Bump @antelopejs/interface-* deps and revert TS2742 workaround ([a14bb5e](https://github.com/AntelopeJS/interface-data-api/commit/a14bb5e))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v0.0.3

[compare changes](https://github.com/AntelopeJS/interface-data-api/compare/v0.0.2...v0.0.3)

### 🩹 Fixes

- **types:** Annotate DefaultRoutes exports to avoid TS2742 ([5f6d4da](https://github.com/AntelopeJS/interface-data-api/commit/5f6d4da))

### 💅 Refactors

- Switch test modules from local to npm packages ([8c088b3](https://github.com/AntelopeJS/interface-data-api/commit/8c088b3))

### 📖 Documentation

- Rewrite documentation for production readiness ([9b6ae10](https://github.com/AntelopeJS/interface-data-api/commit/9b6ae10))

### 🏡 Chore

- Update dependencies ([e4ddefe](https://github.com/AntelopeJS/interface-data-api/commit/e4ddefe))
- Package maintenance ([#9](https://github.com/AntelopeJS/interface-data-api/pull/9))

### 🤖 CI

- Add test step to CI workflow ([8c1c6c4](https://github.com/AntelopeJS/interface-data-api/commit/8c1c6c4))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v0.0.2

### 🚀 Enhancements

- Add data API interface implementation ([f203c57](https://github.com/AntelopeJS/interface-data-api/commit/f203c57))

### 📖 Documentation

- Clarify current version status ([5ded5b4](https://github.com/AntelopeJS/interface-data-api/commit/5ded5b4))
- Update license section in README.md ([16c984f](https://github.com/AntelopeJS/interface-data-api/commit/16c984f))
- Updates badge URL ([1b3e38c](https://github.com/AntelopeJS/interface-data-api/commit/1b3e38c))
- Improved shields ([#2](https://github.com/AntelopeJS/interface-data-api/pull/2))
- Rewrote documentation to make it smoother to read ([#3](https://github.com/AntelopeJS/interface-data-api/pull/3))
- Fix links accordingly to new documents ([#4](https://github.com/AntelopeJS/interface-data-api/pull/4))
- Fix broken link data-api@beta from README.md ([#5](https://github.com/AntelopeJS/interface-data-api/pull/5))
- Rewrote documentation ([#6](https://github.com/AntelopeJS/interface-data-api/pull/6))
- Update existing documentation + added ModifierKey ([#8](https://github.com/AntelopeJS/interface-data-api/pull/8))

### 🏡 Chore

- Import existing codebase ([b40b697](https://github.com/AntelopeJS/interface-data-api/commit/b40b697))
- Rename license file ([8fecfef](https://github.com/AntelopeJS/interface-data-api/commit/8fecfef))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>
- Glastis ([@Glastis](http://github.com/Glastis))
