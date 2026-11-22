# interface-data-api

`@antelopejs/interface-data-api` generates CRUD REST routes from `@antelopejs/interface-database` tables, on top of `@antelopejs/interface-api`. It is consumer-side only: it exposes no proxy of its own, so a module using it must also import the api and database interfaces.

## Layout

- `src/index.ts` holds `DataController`, `RegisterDataController` and `DefaultRoutes`. `src/metadata.ts` holds `DataAPIMeta` and the field decorators (`Access`, `Listable`, `Foreign`, `Computed`, `Filter`, …). `src/components.ts` holds the route building blocks (`Parameters`, `Query`, `Validation`). Both are published subpaths (`/metadata`, `/components`).
- `src/internal` holds the implementation behind those entries. The `./*` export publishes its modules too, so each one is marked `@internal`; a split that adds a module there runs `antelopejs-api-diff` with `--allow-added '**/internal/**'`.
- Tests live in `src/tests` and compile to `dist/tests`. The same export publishes the non-test files there, so `src/tests/utils.ts` and `src/tests/helpers` keep their declarations, and new test helpers go in `src/tests/internal`. `pnpm test` builds, then `ajs module test .` loads `src/antelope.test.ts`, which installs `@antelopejs/mongodb` and `@antelopejs/api` at pinned versions into `.antelope/cache` and starts an in-memory MongoDB. The first run needs network access.

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

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
