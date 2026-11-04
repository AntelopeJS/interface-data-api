import { equal } from "@antelopejs/tooling-configs/verify";

import { holds, keysOf, pick, results, seed, shopJourney, status, stored, text } from "./harness.ts";
import { ORDERS, OVERRIDES, PROBES, USERS } from "./seeds.ts";

const guardSemantics = shopJourney("a get guard allows on a normal return, runs with the controller and the parsed parameters, and is skipped for a missing row", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const lenient = await shop.request("a guard that returns false", "GET", "/probes/lenient?id=p1");
  context.expect(lenient.folder, [status(lenient, 200, "a normal return allows the read, even a return value of false")]);
  const owned = await shop.request("a guard that reads this", "GET", "/probes/owned?id=p1");
  context.expect(owned.folder, [status(owned, 200, "the guard runs with the controller as this")]);
  const withParams = await shop.request("a guard that reads params", "GET", "/probes/withParams?id=p1");
  context.expect(withParams.folder, [status(withParams, 200, "the guard receives the parsed Get parameters")]);
  const other = await shop.request("the same guard on another row", "GET", "/probes/withParams?id=p2");
  context.expect(other.folder, [status(other, 500, "the guard sees the id of the request")]);
  const ran = await shop.request("a guard that always throws, on a stored row", "GET", "/probes/alwaysThrows?id=p1");
  context.expect(ran.folder, [status(ran, 500, "the guard runs for a stored row")]);
  const missing = await shop.request("the same guard on a missing row", "GET", "/probes/alwaysThrows?id=nope");
  context.expect(missing.folder, [status(missing, 404, "a missing record skips the guard"), equal("the answer is the route's own", missing.body, "Not Found")]);
});

const newRowContents = shopJourney("new answers _id when get does not read it, starts from the class defaults and runs every writable setter", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const absent = await shop.request("new without the setter field", "POST", "/probes/new", { body: '{"kind":"c","title":"Three"}' });
  const id = text(pick(absent.json, "_id"));
  context.expect(absent.folder, [status(absent, 200), equal("new answers an _id though no @Access reads it", id.length > 0, true)]);
  const getBody = await shop.request("get the created row", "GET", `/probes/get?id=${id}`);
  context.expect(getBody.folder, [equal("get does not read _id here", keysOf(getBody.json).includes("_id"), false)]);
  const row = await stored(shop, "read the created row", "verify__probes", '{ kind: "c" }');
  context.expect(row.folder, [
    equal("the row starts from the class default of a read-only field", pick(row.rows[0] ?? null, "origin"), "class-default"),
    equal("the setter ran with undefined for the absent field", pick(row.rows[0] ?? null, "trace"), "setter-ran-for-absent"),
    equal("the row is the one new answered", pick(row.rows[0] ?? null, "_id"), id),
  ]);
  const given = await shop.request("new with the setter field", "POST", "/probes/new", { body: '{"kind":"d","title":"Four","mark":"x"}' });
  context.expect(given.folder, [status(given, 200)]);
  const second = await stored(shop, "read the second created row", "verify__probes", '{ kind: "d" }');
  context.expect(second.folder, [equal("the setter ran with the sent value", pick(second.rows[0] ?? null, "trace"), "mark:x")]);
});

const editSetters = shopJourney("edit runs the setters of the fields present in the body and no other", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const without = await shop.request("edit without the setter field", "PUT", "/probes/edit?id=p1", { body: '{"title":"One2"}' });
  context.expect(without.folder, [status(without, 200)]);
  const kept = await stored(shop, "read p1", "verify__probes", '{ _id: "p1" }');
  context.expect(kept.folder, [equal("a setter absent from the body does not run", pick(kept.rows[0] ?? null, "trace"), "seed"), equal("the title was written", pick(kept.rows[0] ?? null, "title"), "One2")]);
  const withField = await shop.request("edit with the setter field", "PUT", "/probes/edit?id=p1", { body: '{"mark":"y"}' });
  context.expect(withField.folder, [status(withField, 200)]);
  const ran = await stored(shop, "read p1 again", "verify__probes", '{ _id: "p1" }');
  context.expect(ran.folder, [equal("a setter present in the body runs with its value", pick(ran.rows[0] ?? null, "trace"), "mark:y"), equal("the class default does not overwrite a stored field on edit", pick(ran.rows[0] ?? null, "origin"), "seed")]);
});

const filterDetails = shopJourney("filters on an indexed field, with the controller as this, with no index for a custom filter, and with string values", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const twice = await shop.request("an indexed field filtered twice", "GET", "/probes/list?filter_kind=a&filter_kind=ne:a");
  context.expect(twice.folder, [status(twice, 200), equal("both filters apply: an indexed equality uses its index only when it is the only filter", pick(twice.json, "total"), 0)]);
  const once = await shop.request("an indexed field filtered once", "GET", "/probes/list?filter_kind=a");
  context.expect(once.folder, [equal("a single indexed equality returns its row", pick(once.json, "total"), 1)]);
  const byThis = await shop.request("a filter that reads this", "GET", "/probes/list?filter_title=Two");
  context.expect(byThis.folder, [equal("the filter context holds the controller as this", pick(byThis.json, "total"), 1)]);
  const custom = await shop.request("a custom filter on an indexed field", "GET", "/probes/list?filter_tag=a");
  context.expect(custom.folder, [equal("a custom filter with useIndex unset runs its function, not an index lookup on the raw value", pick(custom.json, "total"), 1)]);
  const strings = await shop.request("the default filter on a number", "GET", "/probes/list?filter_score=5");
  context.expect(strings.folder, [status(strings, 200), equal("filter values stay strings, so a stored number does not match", pick(strings.json, "total"), 0)]);
});

const listUnknown = shopJourney("a list route with noPluck answers for a mode no field declares, and an unknown route answers 404", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const plain = await shop.request("noPluck with a mode nobody declares", "GET", "/probes/plain");
  context.expect(plain.folder, [status(plain, 200, "noPluck skips the pluck-mode check"), equal("every row is listed", results(plain).length, 2)]);
  const unknown = await shop.request("a URL no route matches", "GET", "/users/nothing");
  context.expect(unknown.folder, [status(unknown, 404)]);
});

const listableAlone = shopJourney("a field that is only @Listable is never answered", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const list = await shop.request("list", "GET", "/users/list");
  context.expect(list.folder, [equal("@Listable alone grants no access", results(list).some((row) => keysOf(row).includes("secretNote")), false)]);
});

const editAnswersForeign = shopJourney("edit answers the stored record with its foreign fields resolved", async (shop) => {
  const { context } = shop;
  await seed(shop, ORDERS);
  const edited = await shop.request("edit an order", "PUT", "/orders/edit?id=o1", { body: '{"total":100}' });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { total: 100, userId: { _id: "u1", name: "Alice", email: "alice@example.com" } })]);
});

const readOverrides = shopJourney("a per-action read override hides or grants a field on get and on list, and GetEffectiveMode agrees", async (shop) => {
  const { context } = shop;
  await seed(shop, OVERRIDES);
  const got = await shop.request("get", "GET", "/overrides/get?id=u1");
  const gotKeys = keysOf(got.json);
  context.expect(got.folder, [
    status(got, 200),
    equal("a get override to write-only hides the field on get", gotKeys.includes("email"), false),
    equal("a field readable by default and write-only on list is read on get", pick(got.json, "name"), "Alice"),
    equal("a write-only field with a get override to read-only is read on get", pick(got.json, "notes"), "note1"),
    equal("a write-only field without a get override stays out of get", gotKeys.includes("nickname"), false),
  ]);
  const listed = await shop.request("list", "GET", "/overrides/list");
  const first = results(listed).find((row) => pick(row, "_id") === "u1") ?? null;
  const listedKeys = keysOf(first);
  context.expect(listed.folder, [
    status(listed, 200),
    equal("a list override to write-only hides the field on list", listedKeys.includes("name"), false),
    equal("a field readable by default and write-only on get is listed", pick(first, "email"), "alice@example.com"),
    equal("a write-only field with a list override to read-only is listed", pick(first, "nickname"), "al"),
    equal("a write-only field without a list override stays out of list", listedKeys.includes("notes"), false),
  ]);
  const modes = await shop.request("effective modes", "GET", "/overrides/modes");
  context.expect(modes.folder, [
    ...holds(modes, {
      email: { get: 2, list: 1, new: 1, edit: 1 },
      name: { get: 1, list: 2, new: 1, edit: 1 },
      notes: { get: 1, list: 2, new: 2, edit: 2 },
      nickname: { get: 2, list: 1, new: 2, edit: 2 },
    }),
  ]);
  const created = await shop.request("new reads its own overrides", "POST", "/overrides/new", { body: '{"notes":"fresh","nickname":"nn"}' });
  context.expect(created.folder, [status(created, 200)]);
  const row = await stored(shop, "read the created row", "verify__users", '{ notes: "fresh" }');
  context.expect(row.folder, [equal("a write-only field is written on new", pick(row.rows[0] ?? null, "nickname"), "nn")]);
});

const issue90 = shopJourney("fails on purpose until #90 is fixed: edit with the index option updates the row the index found", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const edited = await shop.request("edit p1 by its tag", "PUT", "/probes/slugEdit?id=A", { body: '{"title":"New"}' });
  context.expect(edited.folder, [status(edited, 200), equal("#90: the response shows the new title", pick(edited.json, "title"), "New")]);
  const row = await stored(shop, "read p1", "verify__probes", '{ _id: "p1" }');
  context.expect(row.folder, [equal("#90: the row found through the index holds the new title", pick(row.rows[0] ?? null, "title"), "New")]);
});

const issue92 = shopJourney("fails on purpose until #92 is fixed: a getter that a list mode does not declare is left out of it", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const brief = await shop.request("people in the brief mode", "GET", "/people/brief");
  context.expect(brief.folder, [status(brief, 200), equal("#92: the brief mode lists only _id", keysOf(results(brief)[0] ?? null), ["_id"])]);
});

const issue93 = shopJourney("fails on purpose until #93 is fixed: a multi reference answers null for a missing element and raw ids with noForeign", async (shop) => {
  const { context } = shop;
  await seed(shop, `${ORDERS}\nd.verify__orders.insertOne({ _id: "o3", items: [], itemsAll: ["i1", "ghost"], labels: [], total: 1 });`);
  const resolved = await shop.request("an order with a missing element", "GET", "/orders/get?id=o3");
  const items = pick(resolved.json, "itemsAll");
  context.expect(resolved.folder, [status(resolved, 200), equal("#93: the missing element is null", Array.isArray(items) ? items[1] : "not an array", null)]);
  const raw = await shop.request("the same order with noForeign", "GET", "/orders/raw?id=o3");
  context.expect(raw.folder, [equal("#93: noForeign answers the raw ids of a multi reference", pick(raw.json, "itemsAll"), ["i1", "ghost"])]);
});

const noForeignStrings = shopJourney("the Get noForeign option skips resolving for any non-empty string, false included, and the List one is a boolean", async (shop) => {
  const { context } = shop;
  await seed(shop, ORDERS);
  const cases: [string, string, string | { _id: string; name: string; email: string }][] = [
    ["noForeign absent", "/orders/get?id=o1", { _id: "u1", name: "Alice", email: "alice@example.com" }],
    ["noForeign true", "/orders/raw?id=o1", "u1"],
    ["noForeign the string false", "/orders/rawFalse?id=o1", "u1"],
    ["noForeign the empty string", "/orders/rawEmpty?id=o1", { _id: "u1", name: "Alice", email: "alice@example.com" }],
  ];
  for (const [name, path, expected] of cases) {
    const answer = await shop.request(name, "GET", path);
    context.expect(answer.folder, [status(answer, 200), equal(`${name}: userId`, pick(answer.json, "userId"), expected)]);
  }
  const listTrue = await shop.request("list noForeign true", "GET", "/orders/rawList");
  context.expect(listTrue.folder, [equal("list noForeign true answers the raw key", pick(results(listTrue)[0] ?? null, "userId"), "u1")]);
  const listFalse = await shop.request("list noForeign false", "GET", "/orders/listForeignFalse");
  context.expect(listFalse.folder, [equal("list noForeign false resolves", pick(results(listFalse)[0] ?? null, "userId"), { _id: "u1", name: "Alice", email: "alice@example.com" })]);
});

const noMandatoryStrings = shopJourney("the noMandatory option skips the mandatory check for any non-empty string, false included, on edit and on new", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const edits: [string, string, number][] = [
    ["edit with noMandatory absent", "/users/edit?id=u1", 400],
    ["edit with noMandatory true", "/users/quickEdit?id=u1", 200],
    ["edit with noMandatory the string false", "/users/falseSkip?id=u2", 200],
    ["edit with noMandatory the empty string", "/users/emptySkip?id=u3", 400],
  ];
  for (const [name, path, code] of edits) {
    const answer = await shop.request(name, "PUT", path, { body: '{"status":null}' });
    context.expect(answer.folder, [status(answer, code)]);
  }
  const creates: [string, string, number][] = [
    ["new with noMandatory absent", "/users/new", 400],
    ["new with noMandatory true", "/users/newSkip", 200],
    ["new with noMandatory the string false", "/users/newSkipFalse", 200],
    ["new with noMandatory the empty string", "/users/newSkipEmpty", 400],
  ];
  for (const [name, path, code] of creates) {
    const answer = await shop.request(name, "POST", path, { body: '{"name":"Zed"}' });
    context.expect(answer.folder, [status(answer, code)]);
  }
  const rows = await stored(shop, "read the users", "verify__users");
  context.expect(rows.folder, [equal("only the two skipped creates wrote a row", rows.rows.length, 7)]);
});

const noPluckStrings = shopJourney("the noPluck option skips the pluck-mode check only when it is true", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const on = await shop.request("noPluck true", "GET", "/probes/plain");
  context.expect(on.folder, [status(on, 200)]);
  const off = await shop.request("noPluck false", "GET", "/probes/plainFalse");
  context.expect(off.folder, [status(off, 400), equal("the mode is checked", off.body, "No fields found for pluckMode 'nothing'")]);
});

export const PROBE_JOURNEYS = {
  "guard-semantics": guardSemantics,
  "new-row-shape": newRowContents,
  "edit-setters": editSetters,
  "filter-details": filterDetails,
  "list-unknown": listUnknown,
  "listable-alone": listableAlone,
  "edit-answers-foreign": editAnswersForeign,
  "read-overrides": readOverrides,
  "no-foreign-strings": noForeignStrings,
  "no-mandatory-strings": noMandatoryStrings,
  "no-pluck-strings": noPluckStrings,
  "issue-90-edit-index": issue90,
  "issue-92-getter-mode": issue92,
  "issue-93-multi-foreign": issue93,
};
