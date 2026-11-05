import { equal } from "@antelopejs/tooling-configs/verify";

import { holds, ids, keysOf, pick, results, seed, shopJourney, status, stored, text } from "./harness.ts";
import { ORDERS, USERS } from "./seeds.ts";

export const LOCALE = "x-content-language";
export const UNKNOWN_COMPARISON = 'Unknown filter comparison "bogus": use one of eq, ne, gt, ge, lt, le, or start a value that contains a colon with "eq:".';

export const pluckModes = shopJourney("each pluck mode lists its own fields, and a getter lists the database fields it reads", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const list = await shop.request("default mode", "GET", "/users/list");
  context.expect(list.folder, [equal("the default mode lists the @Listable fields that have read access", keysOf(results(list)[0] ?? null), ["_id", "age", "createdAt", "email", "name", "role", "status"])]);
  const detailed = await shop.request("detailed mode", "GET", "/users/detailed");
  const detailedKeys = keysOf(results(detailed)[0] ?? null);
  context.expect(detailed.folder, [
    equal("the detailed mode lists name and internalNotes", [detailedKeys.includes("name"), detailedKeys.includes("internalNotes")], [true, true]),
    equal("the detailed mode does not inherit the default mode", [detailedKeys.includes("email"), detailedKeys.includes("role")], [false, false]),
  ]);
  const minimal = await shop.request("minimal mode", "GET", "/users/minimal");
  context.expect(minimal.folder, [equal("a field can be left out of a mode", keysOf(results(minimal)[0] ?? null), ["_id"])]);
  const get = await shop.request("get", "GET", "/users/get?id=u1");
  context.expect(get.folder, [equal("a field that is not listable is still read by get", pick(get.json, "biography"), "bio1")]);
  const people = await shop.request("people list", "GET", "/people/list");
  context.expect(people.folder, [equal("a getter lists the fields it reads", pick(results(people)[0] ?? null, "fullName"), "Alice <alice@example.com>")]);
});

export const pagination = shopJourney("a list answers one page with the total, offset and limit it used", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const first = await shop.request("default page", "GET", "/users/list");
  context.expect(first.folder, [equal("the default page", [pick(first.json, "total"), pick(first.json, "offset"), pick(first.json, "limit"), results(first).length], [5, 0, 10, 5])]);
  const middle = await shop.request("limit 2 offset 1", "GET", "/users/list?limit=2&offset=1&sortKey=_id");
  context.expect(middle.folder, [equal("the page skips the offset and holds the limit", ids(middle), ["u2", "u3"]), equal("the envelope", [pick(middle.json, "total"), pick(middle.json, "offset"), pick(middle.json, "limit")], [5, 1, 2])]);
  const tail = await shop.request("limit 2 offset 4", "GET", "/users/list?limit=2&offset=4&sortKey=_id");
  context.expect(tail.folder, [equal("the last page is short", ids(tail), ["u5"]), equal("the total stays the same", pick(tail.json, "total"), 5)]);
  const capped = await shop.request("limit 500", "GET", "/users/list?limit=500");
  context.expect(capped.folder, [equal("a list route without maxPage caps the limit at 100", pick(capped.json, "limit"), 100)]);
});

export const sorting = shopJourney("a list sorts on a @Sortable field in the database and refuses any other", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const byName = await shop.request("name descending", "GET", "/users/list?sortKey=name&sortDirection=desc");
  context.expect(byName.folder, [equal("rows come back in descending name order", results(byName).map((row) => pick(row, "name")), ["Erin", "Dave", "Carol", "Bob", "Alice"])]);
  const bogus = await shop.request("any other direction", "GET", "/users/list?sortKey=name&sortDirection=bogus");
  context.expect(bogus.folder, [equal("any other direction sorts ascending", results(bogus).map((row) => pick(row, "name")), ["Alice", "Bob", "Carol", "Dave", "Erin"])]);
  const byAge = await shop.request("age ascending, not indexed", "GET", "/users/list?sortKey=age");
  context.expect(byAge.folder, [equal("a noIndex field sorts too", results(byAge).map((row) => pick(row, "age")), [18, 22, 30, 40, 65])]);
  const byId = await shop.request("id descending, indexed", "GET", "/users/list?sortKey=_id&sortDirection=desc");
  context.expect(byId.folder, [equal("an indexed field sorts", results(byId).map((row) => pick(row, "_id")), ["u5", "u4", "u3", "u2", "u1"])]);
  const refused = await shop.request("a field that is not sortable", "GET", "/users/list?sortKey=email");
  context.expect(refused.folder, [status(refused, 400), equal("the answer names the problem", refused.body, "Field is not sortable.")]);
});

export const foreignResolve = shopJourney("a foreign key field answers the referenced record, plucked, by index, across schemas and as an array", async (shop) => {
  const { context } = shop;
  await seed(shop, ORDERS);
  const one = await shop.request("order o1", "GET", "/orders/get?id=o1");
  context.expect(one.folder, [
    status(one, 200),
    ...holds(one, {
      userId: { _id: "u1", name: "Alice", email: "alice@example.com" },
      userEmail: { name: "Bob" },
      ownerLogin: { _id: "a1", login: "alice-login" },
      tagged: { name: "Bob" },
      items: [{ name: "Widget", price: 9.99 }, { name: "Gadget", price: 24.99 }],
      itemsAll: [{ _id: "i1", name: "Widget", price: 9.99 }],
      total: 99,
    }),
  ]);
  context.expect(one.folder, [equal("an index without pluck resolves the whole record", pick(pick(one.json, "byEmail"), "name"), "Bob")]);
  const missing = await shop.request("order o2", "GET", "/orders/get?id=o2");
  context.expect(missing.folder, [
    status(missing, 200),
    ...holds(missing, { userId: null, userEmail: null, ownerLogin: null, tagged: { name: "Alice" }, items: [], total: 5 }),
  ]);
  const list = await shop.request("order list", "GET", "/orders/list");
  context.expect(list.folder, [equal("the list resolves the same fields", pick(results(list)[0] ?? null, "userId"), { _id: "u1", name: "Alice", email: "alice@example.com" })]);
});

export const foreignRaw = shopJourney("noForeign answers the raw keys on a get and on a list", async (shop) => {
  const { context } = shop;
  await seed(shop, ORDERS);
  const raw = await shop.request("raw get", "GET", "/orders/raw?id=o1");
  context.expect(raw.folder, [status(raw, 200), ...holds(raw, { userId: "u1", userEmail: "bob@gmail.com", ownerLogin: "a1", tagged: "u2", total: 99 })]);
  const rawList = await shop.request("raw list", "GET", "/orders/rawList");
  const first = results(rawList)[0] ?? null;
  context.expect(rawList.folder, [equal("the list route returns raw keys", [pick(first, "userId"), pick(first, "ownerLogin")], ["u1", "a1"])]);
});

export const defaultFilter = shopJourney("the default filter compares with six operators and refuses any other", async (shop) => {
  const { context } = shop;
  await seed(shop, `${USERS}\nd.verify__users.insertOne({ _id: "u6", email: "colon@example.com", name: "a:b", password: "p6", role: "user", age: 50, status: "active" });`);
  const cases: [string, string, string[]][] = [
    ["equal by default", "filter_status=inactive", ["u2"]],
    ["not equal", "filter_role=ne:admin", ["u2", "u3", "u4", "u5", "u6"]],
    ["several fields", "filter_status=active&filter_role=ne:admin", ["u3", "u4", "u5", "u6"]],
    ["greater than", "filter_name=gt:Dave", ["u5", "u6"]],
    ["greater or equal", "filter_name=ge:Dave", ["u4", "u5", "u6"]],
    ["less than", "filter_name=lt:Bob", ["u1"]],
    ["less or equal", "filter_name=le:Bob", ["u1", "u2"]],
    ["the eq prefix keeps a colon in the value", "filter_name=eq:a:b", ["u6"]],
    ["a field that is not a filter is ignored", "filter_nothing=1", ["u1", "u2", "u3", "u4", "u5", "u6"]],
  ];
  for (const [name, query, expected] of cases) {
    const answer = await shop.request(name, "GET", `/users/list?${query}`);
    context.expect(answer.folder, [status(answer, 200), equal(`${name}: the rows`, ids(answer), expected)]);
  }
  const refused = await shop.request("an operator the table does not hold", "GET", "/users/list?filter_status=bogus:x");
  context.expect(refused.folder, [status(refused, 400), equal("the answer names the operator", refused.body, UNKNOWN_COMPARISON)]);
});

export const customFilters = shopJourney("custom filter functions parse their own values, and a route can force a filter", async (shop) => {
  const { context } = shop;
  await seed(shop, `${USERS}\nd.verify__users.insertOne({ _id: "u7", email: "z@gmailxcom", name: "Zed", password: "p7", role: "user", age: 70, status: "active" });`);
  const older = await shop.request("numeric filter", "GET", "/users/list?filter_age=gt:30");
  context.expect(older.folder, [equal("a number compares as a number", ids(older), ["u2", "u4", "u7"])]);
  const range = await shop.request("one field filtered twice", "GET", "/users/list?filter_age=ge:18&filter_age=lt:65");
  context.expect(range.folder, [equal("both filters apply (AND)", ids(range), ["u1", "u3", "u4", "u5"])]);
  const invalid = await shop.request("an invalid number", "GET", "/users/list?filter_age=abc");
  context.expect(invalid.folder, [status(invalid, 400), equal("the filter answers its message", invalid.body, "Invalid number")]);
  const domain = await shop.request("domain filter", "GET", "/users/list?filter_email=gmail.com");
  context.expect(domain.folder, [equal("the domain is escaped, so the dot is literal", ids(domain), ["u2", "u3"])]);
  const other = await shop.request("domain filter with another operator", "GET", "/users/list?filter_email=ne:gmail.com");
  context.expect(other.folder, [status(other, 400), equal("the filter refuses what it does not support", other.body, "Only equality is supported for email domains")]);
  const forced = await shop.request("route filter", "GET", "/users/activeOnly?filter_status=inactive&filter_role=user");
  context.expect(forced.folder, [equal("the route filter wins on its field and the request filter on the others", ids(forced), ["u3", "u4", "u5", "u7"])]);
});

export const localizedKey = shopJourney("a modifier key read from a header selects the language a write stores and a read answers", async (shop) => {
  const { context } = shop;
  const created = await shop.request("create in English", "POST", "/articles/new", { body: '{"title":"Hello"}', headers: [`${LOCALE}: en`] });
  const id = text(pick(created.json, "_id"));
  context.expect(created.folder, [status(created, 200), ...holds(created, { title: "Hello" })]);
  const french = await shop.request("edit in French", "PUT", `/articles/edit?id=${id}`, { body: '{"title":"Bonjour"}', headers: [`${LOCALE}: fr`] });
  context.expect(french.folder, [status(french, 200), ...holds(french, { title: "Bonjour" })]);
  const english = await shop.request("read in English", "GET", `/articles/get?id=${id}`, { headers: [`${LOCALE}: en`] });
  context.expect(english.folder, [...holds(english, { title: "Hello" })]);
  const kept = await shop.request("edit without the title", "PUT", `/articles/edit?id=${id}`, { body: "{}", headers: [`${LOCALE}: fr`] });
  context.expect(kept.folder, [status(kept, 200), ...holds(kept, { title: "Bonjour" })]);
  const afterKept = await shop.request("read in English again", "GET", `/articles/get?id=${id}`, { headers: [`${LOCALE}: en`] });
  context.expect(afterKept.folder, [...holds(afterKept, { title: "Hello" })]);
  const row = await stored(shop, "read the article back", "verify__articles", `{ _id: "${id}" }`);
  const stored_title = JSON.stringify(row.rows[0] ?? null);
  context.expect(row.folder, [equal("MongoDB holds both languages", [stored_title.includes("Hello"), stored_title.includes("Bonjour")], [true, true])]);
  await shop.request("create Alpha in English", "POST", "/articles/new", { body: '{"title":"Alpha"}', headers: [`${LOCALE}: en`] });
  const sorted = await shop.request("sort on the English title", "GET", "/articles/list?sortKey=title", { headers: [`${LOCALE}: en`] });
  context.expect(sorted.folder, [equal("rows sort on the value in the request's locale", results(sorted).map((item) => pick(item, "title")), ["Alpha", "Hello"])]);
  const descending = await shop.request("sort on the English title, descending", "GET", "/articles/list?sortKey=title&sortDirection=desc", { headers: [`${LOCALE}: en`] });
  context.expect(descending.folder, [equal("a sort on a modifier-held field follows sortDirection", results(descending).map((item) => pick(item, "title")), ["Hello", "Alpha"])]);
});
