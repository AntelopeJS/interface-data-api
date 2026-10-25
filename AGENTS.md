# interface-data-api

`@antelopejs/interface-data-api` generates CRUD REST routes from `@antelopejs/interface-database` tables, on top of `@antelopejs/interface-api`. It is consumer-side only: it exposes no proxy of its own, so a module using it must also import the api and database interfaces.

## Layout

- `src/index.ts` holds `DataController`, `RegisterDataController` and `DefaultRoutes`. `src/metadata.ts` holds `DataAPIMeta` and the field decorators (`Access`, `Listable`, `Foreign`, `Computed`, `Filter`, …). `src/components.ts` holds the route building blocks (`Parameters`, `Query`, `Validation`). Both are published subpaths (`/metadata`, `/components`).
- Tests live in `src/tests` and compile to `dist/tests`. `pnpm test` builds, then `ajs module test .` loads `src/antelope.test.ts`, which installs `@antelopejs/mongodb` and `@antelopejs/api` at pinned versions into `.antelope/cache` and starts an in-memory MongoDB. The first run needs network access.

## Versioning

The AntelopeJS interfaces are peer dependencies with ranges below `1.0.0`, and the dev dependencies hold the versions the tests run against. A change that needs a newer interface raises the peer floor, the dev dependency, and the peer table in `README.md` together, and the changelog's upgrade notes name the new floor.

## Checks

`pnpm run checks` runs the whole test suite. It does not run the documentation check, which only CI runs through the `AntelopeJS/tooling-configs` docs action on `README.md` and `docs/`. That action type-checks the docs snippets through `docs/tsconfig.json`, which resolves the package name to `src`; run `pnpm exec tsc -p docs/tsconfig.json` to check them locally. It also matches the README peer table, marked `docs-compat`, against `peerDependencies`.

## Shipped files

- `skills/` ships in the npm package through `antelopeJs.skills`. When a change alters the public API, update `skills/data-api-interface/SKILL.md`.
- `docs/` ships in the package and is the source of interfaces.antelopejs.com/docs/data-api.

## Releases

The release commit writes `CHANGELOG.md`. Upgrade notes for that version follow in a separate `docs(changelog)` pull request, under `### Upgrade notes`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
