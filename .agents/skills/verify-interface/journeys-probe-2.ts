import { equal } from "@antelopejs/tooling-configs/verify";

import { holds, ids, keysOf, pick, results, seed, shopJourney, status, stored } from "./harness.ts";
import { BOOKS, DOCUMENTS, GROUPS, ORDERS, PROBES, USERS } from "./seeds.ts";

export const noMandatoryStrings = shopJourney("the noMandatory option skips the mandatory check for any non-empty string, false included, on edit and on new", async (shop) => {
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

export const noPluckStrings = shopJourney("the noPluck option skips the pluck-mode check only when it is true", async (shop) => {
  const { context } = shop;
  await seed(shop, PROBES);
  const on = await shop.request("noPluck true", "GET", "/probes/plain");
  context.expect(on.folder, [status(on, 200)]);
  const off = await shop.request("noPluck false", "GET", "/probes/plainFalse");
  context.expect(off.folder, [status(off, 400), equal("the mode is checked", off.body, "No fields found for pluckMode 'nothing'")]);
});

export const derivedOwnModel = shopJourney("a derived controller that declares its own model reference reads its own model", async (shop) => {
  const { context } = shop;
  await seed(shop, BOOKS);
  const own = await shop.request("derived controller with its own model", "GET", "/own-model/get?id=au1");
  context.expect(own.folder, [status(own, 200, "the derived controller reads its own model"), equal("the author's name", pick(own.json, "name"), "Zola")]);
  const inherited = await shop.request("derived controller without one", "GET", "/staff/get?id=au1");
  context.expect(inherited.folder, [status(inherited, 404, "the inheriting controller reads the users model, where the author is not")]);
});

export const foreignTargetMeta = shopJourney("a foreign key given the target controller's metadata resolves the target's joined fields", async (shop) => {
  const { context } = shop;
  await seed(shop, `${BOOKS}\nd.verify__shelves.insertMany([{ _id: "s1", bookId: "b1" }]);`);
  const shelf = await shop.request("shelf with its book", "GET", "/shelves/get?id=s1");
  context.expect(shelf.folder, [status(shelf, 200), equal("the book's joined author name is resolved", pick(shelf.json, "bookId"), { title: "Nana", authorName: "Zola" })]);
});

export const noModelAnswers500 = shopJourney("a controller whose model reference holds no model answers 500", async (shop) => {
  const { context } = shop;
  await seed(shop, BOOKS);
  const answer = await shop.request("get on a controller with no model", "GET", "/no-model/get?id=au1");
  context.expect(answer.folder, [status(answer, 500, "a controller that holds no model answers 500")]);
});

export const optionBeatsQuery = shopJourney("a route option beats a query parameter of the same name, and nested options keep the inner ones and the endpoint", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const sorted = await shop.request("route sort against query sort", "GET", "/option-routes/sorted?sortKey=_id&sortDirection=asc");
  context.expect(sorted.folder, [equal("the route options win over the same-named query parameters", results(sorted).map((row) => pick(row, "name")), ["Erin", "Dave", "Carol", "Bob", "Alice"])]);
  const nested = await shop.request("nested options on a list", "GET", "/option-routes/nested?limit=50");
  context.expect(nested.folder, [equal("the inner maxPage survives the outer options", pick(nested.json, "limit"), 2), equal("the outer pluckMode applies", keysOf(results(nested)[0] ?? null), ["_id"])]);
  const edited = await shop.request("nested options keep the inner endpoint", "PUT", "/option-routes/patch2?id=u1", { body: '{"status":null}' });
  context.expect(edited.folder, [status(edited, 200), equal("the outer noMandatory applies", pick(edited.json, "status"), null)]);
  const byKey = await shop.request("the key name is not served", "PUT", "/option-routes/nestedEdit?id=u1", { body: '{"status":null}' });
  context.expect(byKey.folder, [status(byKey, 404)]);
});

export const foreignDeclarationThrows = shopJourney("a foreign key declaration throws for a schema mismatch and for a string table with no class", async (shop) => {
  const { context } = shop;
  const declared = await shop.request("declare the foreign keys", "GET", "/option-routes/foreignDeclarations");
  const messages = Array.isArray(declared.json) ? declared.json.map((message) => JSON.stringify(message)) : [];
  context.expect(declared.folder, [
    status(declared, 200),
    equal("a class registered in one schema with a schema parameter naming another throws", (messages[0] ?? "").includes("Schema mismatch"), true),
    equal("a string table name with no registered class in that schema throws", (messages[1] ?? "").includes("declared"), false),
  ]);
});

export const routeFiltersListOnly = shopJourney("a route's forced filters constrain the list and not get", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const listed = await shop.request("list with the forced filter", "GET", "/users/activeOnly");
  context.expect(listed.folder, [equal("the forced filter keeps active rows", ids(listed), ["u1", "u3", "u4", "u5"])]);
  const inactive = await shop.request("get an inactive row", "GET", "/users/get?id=u2");
  context.expect(inactive.folder, [status(inactive, 200, "route filters do not restrict get"), ...holds(inactive, { name: "Bob" })]);
});

export const emptyForms = shopJourney("edit refuses a mandatory field cleared with null, an empty string or an empty array, and accepts it absent", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const missing = { code: "missing_mandatory_fields", fields: ["email"] };
  const absent = await shop.request("email absent", "PUT", "/users/edit?id=u1", { body: '{"name":"Alice2"}' });
  context.expect(absent.folder, [status(absent, 200, "an absent mandatory field keeps its value")]);
  for (const [name, body] of [["null", '{"email":null}'], ["an empty string", '{"email":""}'], ["an empty array", '{"email":[]}']] as const) {
    const cleared = await shop.request(`email cleared with ${name}`, "PUT", "/users/edit?id=u1", { body });
    context.expect(cleared.folder, [status(cleared, 400), equal(`${name} counts as empty`, cleared.json, missing)]);
  }
  const object = await shop.request("email set to an empty object", "PUT", "/users/edit?id=u1", { body: '{"email":{}}' });
  context.expect(object.folder, [status(object, 400), equal("an empty object is not a clearing value, so the validator refuses it", object.json, { code: "invalid_field_types", fields: ["email"] })]);
  const row = await stored(shop, "read u1", "verify__users", '{ _id: "u1" }');
  context.expect(row.folder, [equal("no refused edit changed the email", pick(row.rows[0] ?? null, "email"), "alice@example.com")]);
});

export const mandatoryBeforeValidators = shopJourney("the mandatory check answers before any validator, on new and on edit", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const created = await shop.request("new with a missing mandatory field and an invalid value", "POST", "/users/new", { body: '{"name":"Zed","age":500}' });
  context.expect(created.folder, [status(created, 400), equal("new answers the mandatory code", created.json, { code: "missing_mandatory_fields", fields: ["email", "password"] })]);
  const edited = await shop.request("edit clearing a mandatory field with an invalid value", "PUT", "/users/edit?id=u1", { body: '{"email":null,"nickname":"taken"}' });
  context.expect(edited.folder, [status(edited, 400), equal("edit answers the mandatory code", edited.json, { code: "missing_mandatory_fields", fields: ["email"] })]);
});

export const holeyBody = shopJourney("a parsed body that holds an undefined array element answers 400", async (shop) => {
  const { context } = shop;
  await seed(shop, DOCUMENTS);
  const holey = await shop.request("new through a route that sets [undefined]", "POST", "/holey-docs/holey", { body: '{"title":"x"}' });
  context.expect(holey.folder, [status(holey, 400, "an undefined array element answers 400")]);
  const rows = await stored(shop, "count the documents", "verify__documents");
  context.expect(rows.folder, [equal("nothing was written", rows.rows.length, 2)]);
});

export const joinedAccess = shopJourney("an @Access written above @Joined replaces its read-only mode", async (shop) => {
  const { context } = shop;
  await seed(shop, BOOKS);
  const got = await shop.request("get a book", "GET", "/joined-access/get?id=b1");
  context.expect(got.folder, [status(got, 200), ...holds(got, { title: "Nana" }), equal("the later write-only @Access hides the joined field", keysOf(got.json).includes("authorName"), false)]);
});

export const computedAccess = shopJourney("an @Access written above @Computed replaces its read-only mode", async (shop) => {
  const { context } = shop;
  await seed(shop, GROUPS);
  const got = await shop.request("get a group", "GET", "/computed-access/get?id=g1");
  context.expect(got.folder, [status(got, 200), ...holds(got, { name: "Alpha" }), equal("the later write-only @Access hides the computed field on get", keysOf(got.json).includes("devices_count"), false)]);
  const listed = await shop.request("list the groups", "GET", "/computed-access/list");
  context.expect(listed.folder, [equal("and on list", results(listed).some((row) => keysOf(row).includes("devices_count")), false)]);
});

export const foreignUnplucked = shopJourney("a foreign key without pluck answers the whole target row, whatever the target controller's @Access says", async (shop) => {
  const { context } = shop;
  await seed(shop, ORDERS);
  const one = await shop.request("order o1", "GET", "/orders/get?id=o1");
  const target = pick(one.json, "byEmail");
  context.expect(one.folder, [status(one, 200), equal("the target's name", pick(target, "name"), "Bob"), equal("the target's stored password is not hidden by the users controller's @Access", pick(target, "password"), "p2")]);
});
