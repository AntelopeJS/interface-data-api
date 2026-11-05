import { equal, exitIs } from "@antelopejs/tooling-configs/verify";
import type { Journey } from "@antelopejs/tooling-configs/verify";

import { compileOnly, holds, ids, keysOf, pick, results, seed, shopJourney, status, stored, text } from "./harness.ts";
import { BOOKS, DOCUMENTS, GROUPS } from "./seeds.ts";
import { LOCALE } from "./journeys-read-1.ts";

export const joinedRead = shopJourney("a joined field flattens one remote field onto the row and sorts and filters on it in the database", async (shop) => {
  const { context } = shop;
  await seed(shop, BOOKS);
  const one = await shop.request("get b1", "GET", "/books/get?id=b1");
  context.expect(one.folder, [status(one, 200), ...holds(one, { authorName: "Zola", accountLogin: "alice-login", title: "Nana" })]);
  const list = await shop.request("list", "GET", "/books/list");
  context.expect(list.folder, [equal("a missing remote row joins as null", results(list).map((row) => [pick(row, "authorName"), pick(row, "accountLogin")]), [["Zola", "alice-login"], ["Austen", null], [null, null]])]);
  const sorted = await shop.request("sort on the joined field", "GET", "/books/list?sortKey=authorName");
  context.expect(sorted.folder, [equal("the join applies before the sort", results(sorted).map((row) => pick(row, "authorName")), [null, "Austen", "Zola"])]);
  const filtered = await shop.request("filter on the joined field", "GET", "/books/list?filter_authorName=Zola");
  context.expect(filtered.folder, [equal("the join applies before the filter", [ids(filtered), pick(filtered.json, "total")], [["b1"], 1])]);
  const edited = await shop.request("edit a joined field", "PUT", "/books/edit?id=b1", { body: JSON.stringify({ authorName: "Hacked", title: "Nana 2" }) });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { authorName: "Zola", title: "Nana 2" })]);
  const row = await stored(shop, "read b1 back", "verify__books", '{ _id: "b1" }');
  context.expect(row.folder, [equal("a joined field is never stored", keysOf(row.rows[0] ?? null).includes("authorName"), false), equal("the local key is untouched", pick(row.rows[0] ?? null, "authorId"), "au1")]);
});

export const computedRead = shopJourney("a computed field is merged from the database where a step needs it", async (shop) => {
  const { context } = shop;
  await seed(shop, GROUPS);
  const one = await shop.request("get g2", "GET", "/groups/get?id=g2");
  context.expect(one.folder, [status(one, 200), ...holds(one, { devices_count: 0, display_name: "Beta!" })]);
  const first = await shop.request("first page by count", "GET", "/groups/list?sortKey=devices_count&sortDirection=desc&limit=2");
  context.expect(first.folder, [equal("the first page", results(first).map((row) => [pick(row, "name"), pick(row, "devices_count")]), [["Alpha", 3], ["Gamma", 1]]), equal("the total", [pick(first.json, "total"), pick(first.json, "limit")], [3, 2])]);
  const second = await shop.request("second page by count", "GET", "/groups/list?sortKey=devices_count&sortDirection=desc&limit=2&offset=2");
  context.expect(second.folder, [equal("the second page", results(second).map((row) => [pick(row, "name"), pick(row, "devices_count")]), [["Beta", 0]]), equal("the total is the same on every page", pick(second.json, "total"), 3)]);
  const empty = await shop.request("filter on a count of zero", "GET", "/groups/list?filter_devices_count=eq:0");
  context.expect(empty.folder, [equal("the default turns a null aggregate into 0", ids(empty), ["g2"])]);
  const edited = await shop.request("edit computed fields", "PUT", "/groups/edit?id=g1", { body: JSON.stringify({ devices_count: 99, display_name: "x", name: "Alpha2" }) });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { devices_count: 3, display_name: "Alpha2!", name: "Alpha2" })]);
  const row = await stored(shop, "read g1 back", "verify__groups", '{ _id: "g1" }');
  context.expect(row.folder, [equal("a computed field is never stored", [keysOf(row.rows[0] ?? null).includes("devices_count"), keysOf(row.rows[0] ?? null).includes("display_name")], [false, false])]);
});

export const getGuard = shopJourney("a get guard denies by throwing and applies to its own route only", async (shop) => {
  const { context } = shop;
  await seed(shop, DOCUMENTS);
  const allowed = await shop.request("invoice through the guarded route", "GET", "/documents/invoice?id=x1");
  context.expect(allowed.folder, [status(allowed, 200), equal("the guarded row", allowed.json, { _id: "x1", title: "Bill" })]);
  const denied = await shop.request("memo through the guarded route", "GET", "/documents/invoice?id=x2");
  context.expect(denied.folder, [status(denied, 404), equal("the guard's error is the answer", denied.body, "Not Found")]);
  const missing = await shop.request("missing row through the guarded route", "GET", "/documents/invoice?id=zzz");
  context.expect(missing.folder, [status(missing, 404)]);
  const plain = await shop.request("memo through the plain route", "GET", "/documents/get?id=x2");
  context.expect(plain.folder, [status(plain, 200), ...holds(plain, { title: "Memo" })]);
});

export const guardUnlocked = shopJourney("a get guard reads the loaded model unlocked with the request's modifier key", async (shop) => {
  const { context } = shop;
  const created = await shop.request("create in English", "POST", "/articles/new", { body: '{"title":"Hello"}', headers: [`${LOCALE}: en`] });
  const id = text(pick(created.json, "_id"));
  context.expect(created.folder, [status(created, 200)]);
  const english = await shop.request("read through the guarded route in English", "GET", `/articles/translated?id=${id}`, { headers: [`${LOCALE}: en`] });
  context.expect(english.folder, [status(english, 200, "the guard sees the title unlocked in English"), ...holds(english, { title: "Hello" })]);
  const german = await shop.request("read through the guarded route in German", "GET", `/articles/translated?id=${id}`, { headers: [`${LOCALE}: de`] });
  context.expect(german.folder, [status(german, 404, "the guard sees no German title"), equal("the guard's error is the answer", german.body, "Not Found")]);
  const plain = await shop.request("read through the plain route in German", "GET", `/articles/get?id=${id}`, { headers: [`${LOCALE}: de`] });
  context.expect(plain.folder, [status(plain, 200, "the plain route is not guarded")]);
});

export const amendBody = shopJourney("a route that wraps new can amend the parsed body before it is written", async (shop) => {
  const { context } = shop;
  const stamped = await shop.request("new through the stamping route", "POST", "/documents/stamped", { body: '{"title":"Imp","source":"sent"}' });
  const stampedId = text(pick(stamped.json, "_id"));
  const plain = await shop.request("new through the plain route", "POST", "/documents/new", { body: '{"title":"Plain","source":"sent"}' });
  const plainId = text(pick(plain.json, "_id"));
  context.expect(stamped.folder, [status(stamped, 200), ...holds(stamped, { source: "import", title: "Imp" })]);
  const rows = await stored(shop, "read both back", "verify__documents");
  const source = (id: string) => pick(rows.rows.find((row) => pick(row, "_id") === id) ?? null, "source");
  context.expect(rows.folder, [equal("the amended field is written", source(stampedId), "import"), equal("the plain route writes what was sent", source(plainId), "sent")]);
});

export const customRoute: Journey = shopJourney("a custom route declared with func, args and method is served next to the defaults", async (shop) => {
  const { context } = shop;
  const search = await shop.request("custom search route", "GET", "/users/search");
  context.expect(search.folder, [status(search, 200), equal("the custom route answers", search.json, { results: [] })]);
  const list = await shop.request("default route beside it", "GET", "/users/list");
  context.expect(list.folder, [status(list, 200)]);
});

export const effectiveModes = shopJourney("GetEffectiveMode answers the mode each action applies", async (shop) => {
  const { context } = shop;
  const modes = await shop.request("read the effective modes", "GET", "/users/modes");
  context.expect(modes.folder, [
    status(modes, 200),
    ...holds(modes, {
      role: { get: 3, list: 3, new: 3, edit: 1 },
      age: { get: 1, list: 1, new: 3, edit: 1 },
      password: { get: 2, list: 2, new: 2, edit: 2 },
      _id: { get: 1, list: 1, new: 1, edit: 1 },
    }),
  ]);
});

export const declarationErrors = shopJourney("DataController refuses a table class whose schema is not registered", async (shop) => {
  const { context } = shop;
  const declared = await shop.request("declare a controller on an unregistered table", "GET", "/users/declarations");
  context.expect(declared.folder, [status(declared, 200), equal("the declarations throw", declared.json, ["Non-existent Database Schema", "Unregistered Database Table"])]);
});

export const exportsRuntime: Journey = {
  title: "the packed metadata entry exports the enum and the filter reader with their documented values",
  entryPoint: "the packed `metadata` entry required from a consumer",
  async run(context) {
    const loaded = await context.command("read the exports", "node", [
      "-e",
      `const m = require(process.argv[1]);
console.log(JSON.stringify([m.AccessMode.ReadOnly, m.AccessMode.WriteOnly, m.AccessMode.ReadWrite, m.FilterValuesOf(["a", "eq"]), m.FilterValuesOf([["a", "eq"], ["b", "ne"]])]));`,
      `${context.repo}/dist/metadata.js`,
    ]);
    context.expect(loaded.folder, [exitIs(loaded, 0), equal("the enum values and both filter shapes", loaded.stdout.trim(), '[1,2,3,[["a","eq"]],[["a","eq"],["b","ne"]]]')]);
  },
};

export const consumerCompiles: Journey = {
  title: "a consumer written from the docs compiles against the packed declarations",
  entryPoint: "tsc on a module that declares controllers with every decorator the docs show, against the packed types",
  async run(context) {
    await compileOnly(context);
  },
};
