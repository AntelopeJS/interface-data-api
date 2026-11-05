---
name: formal-field-access
description: Bounded exhaustive check of field exposure and write gating in @antelopejs/interface-data-api (AccessMode, @Access overrides, @Listable, @Computed, @Joined, derived controllers), run against the real decorators, ReadProperties and WriteProperties. Use when a change touches src/metadata.ts, src/internal/read-properties.ts, src/internal/properties.ts or src/internal/meta-records.ts, or when a change to access modes, descriptors, pluck or metadata inheritance needs proof that no field leaks and no body key bypasses its access.
---

# Formal check: field exposure and write gating

A module author declares a controller class over a table and marks each field with `@Access(mode, overrides?)`, `@Listable`, `@Computed` or `@Joined`. Per action (`get`, `list`, `new`, `edit`, or a custom one), a field's effective mode decides which fields a response holds and which body keys reach the database: `ReadProperties` builds the response from `meta.readable[action]`, `WriteProperties` builds the row from `meta.writable[action]`, both rebuilt by `DataAPIMeta.recomputeAccess`. The `exposure` door of `verify.config.ts` names the harm: a write-only field that leaks exposes a secret.

No verifier runs on this TypeScript, so the check enumerates every controller declaration within the bounds below and runs the real code on each: `cases.ts` lists the declarations, `build.ts` turns each into real classes (`class extends DataController(Row, {}, Controller(...))`, the accessors, then each decorator in the order TypeScript applies them, bottom first, with the descriptor `__decorate` would pass), and `rules.ts` runs `Query.ReadProperties` and `Query.WriteProperties` for every action and compares them with an oracle built from the decorators' TSDoc. `field-access.ts` holds the record of findings. `ts-loader.mjs` lets Node run the `src` TypeScript as it is.

## Run it

From the repository root, with Node 24 and `pnpm install` done:

```sh
node .agents/skills/formal-field-access/check.mjs          # CI bounds
node .agents/skills/formal-field-access/check.mjs --full   # full bounds
node .agents/skills/formal-field-access/check.mjs --show   # also print every violating case with what the check saw
```

| Configuration | Classes and fields | CI cases | Full cases |
| --- | --- | --- | --- |
| `single` | one controller `C`, field `a` in each of 5 declarations | 3,413 | 32,384 |
| `pair` | `C` with fields `a` and `b` (`b` defaulted or a setter) | 1,820 | 16,562 |
| `derived` | `P`, then `A extends P`, then `B extends P`, field `a` | 600 (1,800 classes) | 5,460 (16,380 classes) |

One run of each on a shared 16-core machine: CI 6.8 s, full 34 s. Every class is read for 7 actions with and without `onlyList`, and written for 7 actions, 2 or 3 bodies, as a new row and over a stored row.

- Exit 0 means every rule that held still holds, and each finding still breaks on the recorded number of cases with the recorded shortest case.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks. `CHANGED` names a finding whose case count or shortest case changed. `HOLDS` names a finding that no longer breaks. Each line carries the shortest case as source and, below it, what the check saw.
- Exit 2 means the check could not run, or the arguments were wrong.

The lines that name a changed rule match `^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)`. A rule that still holds prints as lowercase `holds A, B (N cases, configuration)`.

## When to run it

Run `--full` when a change touches a covered file (see the coverage record) or this folder. A changed rule (exit 1) makes the Verdict FAIL. The recorded findings fail it only when the diff changes what the covered files do, which `antelopejs-verify formal` decides by comparing their JavaScript on the base and on HEAD (`verify-interface` verdict rule 5; the entry is `formal-field-access` in `.agents/skills/verify-interface/verify.config.ts`, which runs `--full` on HEAD and the CI bounds on the base).

## The rules

The oracle reads the decorators as their TSDoc states them. `@Access` sets the mode and replaces the override table. `@Computed` and `@Joined` make the field read-only and keep the override table, which no doc mentions. `@Listable` adds the field to a list mode with the database names it selects, plus itself and its local key once joined (`listedNames`). `@Access` and `@Listable` hand the framework the accessor's descriptor (`setDescriptor`, "the known field descriptor"); `@Computed` and `@Joined` are property decorators and see none, so an accessor they alone decorate is read and written as a plain property. A child's declarations come after its parent's. The effective mode of an action is its override, else the mode; `_default` and no action mean the mode.

| Rule | Plain sentence | Harm when it breaks | `single` | `pair` | `derived` |
| --- | --- | --- | --- | --- | --- |
| `ReadNoLeak` | `ReadProperties` answers no field, and runs no getter, without read access for the action; with `onlyList`, none that no `@Listable` names. | A write-only secret, or a private field, is in a response. | holds | holds | finding F2 (244, 2,840) |
| `ReadComplete` | Every field with read access is answered with the row value, or with the known getter's value. | A client misses a field, or gets another class's getter. | finding F3 (24, 32) | holds | findings F2, F3 (202, 2,146) |
| `WriteGated` | `WriteProperties` stores nothing but the stored row (or the class defaults of decorated fields) plus the body keys with write access, only those present on edit, and runs no other setter. | A body sets a read-only or private column. | holds | holds | finding F2 (100, 1,240) |
| `WriteComplete` | Every writable body key is stored (`undefined` when absent on new), or the known setter runs with it. | A write is silently dropped, or another class's setter runs. | holds | holds | finding F2 (184, 1,958) |
| `ComputedReadOnly` | A `@Computed` or `@Joined` field is never stored from the body and its setter never runs, whatever `@Access` says ("The value is read-only"). | A column the table never declares is persisted and hidden by the query-time value. | finding F1 (492, 4,338) | finding F1 (200, 3,440) | finding F1 (60, 1,164) |
| `ListPluck` | `meta.pluck[mode]` is exactly the union of the database names the fields listable in that mode select. | A list fetches, or drops, a column no declaration names. | holds | holds | finding F2 (16, 288) |

The numbers in brackets are the violating cases under the CI and the full bounds, which `check.mjs` records per configuration with the shortest case.

## Findings at the sync commit

- **F1, a computed or joined field becomes writable (`ComputedReadOnly`).** `setComputed` (metadata.ts:312) and `setJoined` (line 357) set `field.mode = ReadOnly` and nothing else. Two sequences defeat it. `@Access(AccessMode.ReadWrite) @Computed(expr) declare a`: decorators run bottom-up, so `setMode` runs last and `a` is read-write; docs/11.computed.md and docs/10.joined.md warn "do not combine the two". `@Computed(expr) @Access(AccessMode.ReadOnly, { new: AccessMode.ReadWrite }) declare a`: `setComputed` runs last but leaves `modeOverrides`, so `a` is writable on `new`; no doc mentions it (62 of the 492 `single` CI cases, per the `fix-derived-clears-overrides` row below). In both, `WriteProperties("new")` and `("edit")` store `body.a` under `a`, and a setter on `a` runs. The stored value is hidden at read time by the computed or joined value.
- **F2, a derived controller rewrites the fields of its base and its siblings (`ReadNoLeak`, `ReadComplete`, `WriteGated`, `WriteComplete`, `ListPluck`).** `inherit` copies the parent's `FieldData` objects by reference (`merge(parent.fields, this.fields)`, metadata.ts:152, meta-records.ts:6-15), and `field(name)` (line 170-175) returns that shared object, so a child's decorator mutates the parent's field. `P { @Access(AccessMode.WriteOnly) declare a } A extends P { @Access(AccessMode.ReadWrite) declare a } B extends P {}`: `B`, defined after `A` with no declaration of its own, inherits `a` as read-write and answers it on every action, though `P` and `B` declare it write-only. `P { @Access(AccessMode.ReadOnly) get a() } A extends P { @Access(AccessMode.ReadOnly) get a() }`: `P.ReadProperties` answers `get:A:a`, the derived class's getter run on the base instance, because `setDescriptor` replaced the shared `desc`. `B`'s `@Listable` rebuilds its pluck from fields `A` changed. The `fix-inherit-copies-fields` row below turns four rules back to holding.
- **F3, a getter that `@Listable` hands over after `@Computed` or `@Joined` never runs (`ReadComplete`).** `setListable` and `setDescriptor` do not call `recomputeAccess`, so `@Listable() @Computed(expr) get a()` keeps `a` in `readable.props`, built when `setComputed` ran without a descriptor, and answers the row value; `@Computed(expr) @Listable() get a()` runs the getter. The `fix-listable-recomputes-access` row confirms the cause.

## Real bug or check error

The check runs the published code: `Query.ReadProperties` and `Query.WriteProperties` from `src/components.ts`, the decorators from `src/metadata.ts`, `DataController` from `src/index.ts`, with `GetDataControllerMeta` reading the metadata as the routes do. The routes answer what `ReadProperties` returns, minus `_internal` and with foreign relations reshaped (`Validation.ClearInternal`), plus `_id` on `new`. A violation is a check error only when the oracle in `promiseOf` (rules.ts) misreads a decorator's TSDoc, or when the case builds a class TypeScript would refuse: a child redeclaring an accessor as a property, or the reverse. Replay a shortest case by writing its class in a scratch test under `src/tests` and asserting on the route's answer or on the row `WriteProperties` returns. A getter answers `get:<class>:<field>`, so the class whose accessor ran is in the value. Run `--show` to list every violating case with what the check saw.

## Changing the check

- For an intended code change, edit the oracle step in `promiseOf` that maps to that decorator, then run both bounds. A fix that clears the override table in `setComputed` and `setJoined` also changes the `Computed` and `Joined` steps, as the `fix-derived-clears-overrides` row shows.
- Never weaken or drop a rule to make the check pass. A fixed finding leaves `FINDINGS` in `field-access.ts`, for both modes, once a replay confirms the fix. A new finding goes into `FINDINGS` with its case count and shortest case for each mode, and into this file with its sequence.
- When you change the alphabet or the depths in `cases.ts`, rerun the scratch changes below. The CI bounds must still catch each one.
- After you confirm that the oracle and the coverage record describe the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Check part | Code |
| --- | --- |
| alphabet and oracle of `@Access` | `Access` (metadata.ts:525-537), `setDescriptor` (433-436), `setMode` (231-241), `GetEffectiveMode` (93-99), `AccessMode` (78-82) |
| oracle of `@Listable` and `ListPluck` | `Listable` (550-562), `setListable` (250-263), `recomputeListable` (177-179), `listedNames` and `rebuildPluck` (meta-records.ts:80-94, 26-45) |
| oracle of `@Computed` and `@Joined` | `Computed` (643-647), `setComputed` (305-318), `Joined` (613-627), `setJoined` (330-375), `resolveTableReference` for a table name in the same schema (table-reference.ts:56-72) |
| the known descriptor, `readable` and `writable` | `onField` (507-518), `recomputeAccess` (181-223), `field` (170-175) |
| `derived` configuration | `inherit` (150-168), `merge` (meta-records.ts:6-15), `DataController` (index.ts:54-91), `GetDataControllerMeta` (metadata.ts:735-739), `classOf` and `prototypeOf` (prototypes.ts:26-41) |
| reads | `Query.ReadProperties` (components.ts:347-355), `ReadProperties` (read-properties.ts:11-39), `fieldsOf` (prototypes.ts:14-19); read from the code, not driven: the routes pass `get` (index.ts:180-185) and `list` (251) and never `onlyList` |
| writes | `Query.WriteProperties` (components.ts:367-381), `WriteProperties`, `writableInBody`, `writeTargetDefaults` (properties.ts:12-66); read from the code, not driven: the routes pass `new` (index.ts:279) and `edit` with the stored row (309-315) |

The sync commit is `a91c1c0` on AntelopeJS/interface-data-api `feat/verify-interface-skill` (PR #91).

## Bounds and what is left out

The full alphabet is `@Access` with each mode and each of 8 override tables (none, `get`, `new`, `edit`, `custom`, `_default`, two actions), `@Computed`, `@Joined` on the other field or on the undeclared key `k`, and `@Listable` with `true`, `false`, `[other]` and `(true, "detailed")`: 30 decorators. The core alphabet has 9: one of each, two override tables. `single` CI runs every sequence of up to 2 of the 30 on `declare a` and on `get a() / set a(v)`, up to 1 on the defaulted property, the getter and the setter, and every sequence of 3 of the core 9 on the first two. `pair` CI runs up to 2 of the core 9 on `a` and up to 1 on `b`. `derived` CI runs up to 1 on `P`, up to 1 on `A`, and none, `@Access(ReadOnly)` or `@Listable()` on `B`. Full raises `single` to 3 of the 30 on `declare a`, 3 of the core 9 and 2 of the 30 on the accessor, 2 of the 30 on the others, and `b` and `A` to 2. Bodies send every field plus `k`, nothing, and (`pair`) `a` alone; rows hold every field plus `k`.

The check leaves out:

- the routes and the database. From `src/index.ts` the check runs only `DataController`, and from `src/components.ts` only `Query.ReadProperties` and `Query.WriteProperties`. Both files stay in `covers` so that a diff to them reruns the check, but the rest of them is not driven here: which action each route passes, `Validation.Lock` and `Unlock`, the get guard, and `ListPage`, which applies `pluck` (so a database field a getter's `@Listable([...])` names is answered when it has read access). The `verify-interface` features `access`, `modifiers`, `guards` and `listing` drive those through HTTP. Foreign, joined and computed values, the rest of `Validation`, modifiers, and `dbName`, which nothing in `src` sets, are left out too.
- `@Mandatory`, `@Sortable`, `@Validator`, `@Foreign` and `@Filter`, which create the field and record its descriptor without changing access.
- a class default on a property no decorator names: `writeTargetDefaults` stores defaults only for keys in `meta.fields`, and the oracle follows (`decorated`).
- getters and setters that read other fields (the `verify-interface` journey `listing/pluck-modes` drives one), actions named like `Object.prototype` keys, three levels of inheritance, and more than two siblings.

## Confirm the check can fail

Apply one change at a time to `src`, run `check.mjs` with the CI bounds, then `git checkout -- src`. These ran at the sync commit; every row exited 1 and the unchanged tree exits 0.

| Scratch change in the code | CI bounds |
| --- | --- |
| `drop-onlylist-skip`: `ReadProperties` ignores `onlyList` for props (read-properties.ts:23-25) | `BROKEN ReadNoLeak` 977 (`single`), 1,476 (`pair`); `CHANGED ReadNoLeak` 408 (`derived`) |
| `read-default-action`: `ReadProperties` reads `meta.readable._default` whatever the action (line 18-19) | `BROKEN ReadNoLeak` 316, shortest `@Access(ReadOnly, { get: WriteOnly }) get a()` answered on `get`; `CHANGED ReadComplete` 389 |
| `drop-writable-in-body`: edit writes every writable field (properties.ts:47-49) | `BROKEN WriteGated` 2,477 (`single`), 1,328 (`pair`), `CHANGED` 384 (`derived`): an empty edit body writes `a = undefined` and runs setters |
| `writable-on-readonly`: `recomputeAccess` fills `writable` from the read bit (metadata.ts:218) | `BROKEN WriteGated`, `BROKEN WriteComplete`, `CHANGED ComputedReadOnly` in every configuration |
| `computed-keeps-mode`: `setComputed` no longer sets `ReadOnly` (line 312) | `BROKEN WriteGated` 116 (`single`), 60 (`pair`), `BROKEN ReadComplete` 308 (`pair`), `CHANGED` on six rules |
| Fix candidate `fix-inherit-copies-fields`: `inherit` copies each parent field and its `listable` table | `HOLDS ReadNoLeak`, `HOLDS WriteGated`, `HOLDS WriteComplete`, `HOLDS ListPluck` (`derived`); `CHANGED ReadComplete` 28, all F3 |
| Fix candidate `fix-derived-clears-overrides`: `setComputed` clears `modeOverrides` | `CHANGED ComputedReadOnly` 430, 180, 54; `BROKEN ReadNoLeak` 12 and `WriteComplete` 62 (`single`), from the oracle keeping overrides |
| Fix candidate `fix-listable-recomputes-access`: `setListable` calls `recomputeAccess` | `HOLDS ReadComplete` (`single`); `CHANGED ReadComplete` 196 (`derived`) |
