import { equal, exitIs } from "@antelopejs/tooling-configs/verify";
import type { Journey } from "@antelopejs/tooling-configs/verify";

import { holds, keysOf, pick, results, seed, shopJourney, status, stored, text } from "./harness.ts";
import { USERS } from "./seeds.ts";

const NEW_USER = {
  name: "Zed",
  email: "zed@example.com",
  password: "pw1234",
  role: "admin",
  age: 33,
  createdAt: "x",
  biography: "b",
  status: "active",
  nickname: "zz",
  secretNote: "leak",
  notes: "n",
};

const MISSING = "missing_mandatory_fields";
const INVALID = "invalid_field_types";

/** The ids left in the users collection, sorted. */
const USER_IDS = '{ _id: 1 }';

const smokeRoundtrip = shopJourney("a user created, read, edited and deleted through the routes", async (shop) => {
  const { context } = shop;
  const created = await shop.request("create", "POST", "/users/new", { body: JSON.stringify({ name: "Ann", email: "ann@example.com", password: "pw1234" }) });
  const id = text(pick(created.json, "_id"));
  context.expect(created.folder, [status(created, 200), equal("the created row has an id", id.length > 0, true)]);
  const read = await shop.request("read", "GET", `/users/get?id=${id}`);
  context.expect(read.folder, [status(read, 200), ...holds(read, { name: "Ann", email: "ann@example.com" })]);
  const edited = await shop.request("edit", "PUT", `/users/edit?id=${id}`, { body: JSON.stringify({ name: "Anna" }) });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { name: "Anna", email: "ann@example.com" })]);
  const deleted = await shop.request("delete", "DELETE", `/users/delete?id=${id}`);
  context.expect(deleted.folder, [status(deleted, 200), equal("one record deleted", deleted.json, 1)]);
  const gone = await shop.request("read again", "GET", `/users/get?id=${id}`);
  context.expect(gone.folder, [status(gone, 404)]);
});

const crudLifecycle = shopJourney("new, get, edit and delete change exactly the rows they name, and MongoDB shows it", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const created = await shop.request("create Zed", "POST", "/users/new", { body: JSON.stringify(NEW_USER) });
  const id = text(pick(created.json, "_id"));
  context.expect(created.folder, [
    status(created, 200),
    ...holds(created, { name: "Zed", email: "zed@example.com", status: "active" }),
    equal("the answer leaves out the write-only password", keysOf(created.json).includes("password"), false),
  ]);
  const row = await stored(shop, "read Zed back", "verify__users", `{ _id: "${id}" }`);
  context.expect(row.folder, [
    equal("the row holds the written password", pick(row.rows[0] ?? null, "password"), "pw1234"),
    equal("the row holds the age allowed on new", pick(row.rows[0] ?? null, "age"), 33),
    equal("the row holds the email", pick(row.rows[0] ?? null, "email"), "zed@example.com"),
  ]);
  const read = await shop.request("get u1", "GET", "/users/get?id=u1");
  context.expect(read.folder, [status(read, 200), ...holds(read, { _id: "u1", name: "Alice", email: "alice@example.com", biography: "bio1" })]);
  const edited = await shop.request("edit u1", "PUT", "/users/edit?id=u1", { body: JSON.stringify({ name: "Updated" }) });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { _id: "u1", name: "Updated", email: "alice@example.com", status: "active" })]);
  const after = await stored(shop, "read u1 back", "verify__users", '{ _id: "u1" }');
  context.expect(after.folder, [
    equal("the edit changed the name", pick(after.rows[0] ?? null, "name"), "Updated"),
    equal("the edit kept the email it was not sent", pick(after.rows[0] ?? null, "email"), "alice@example.com"),
    equal("the edit kept the password it was not sent", pick(after.rows[0] ?? null, "password"), "p1"),
  ]);
  const deleted = await shop.request("delete u4, u5 and a missing id", "DELETE", "/users/delete?id=u4&id=u5&id=ghost");
  context.expect(deleted.folder, [status(deleted, 200), equal("the body counts the records deleted", deleted.json, 2)]);
  const left = await shop.mongo("list the ids left", `JSON.stringify(db.getSiblingDB("verify").verify__users.find({}, ${USER_IDS}).sort({ _id: 1 }).toArray().map((row) => row._id))`);
  context.expect(left.folder, [equal("only the named rows are gone", left.stdout.trim(), JSON.stringify(["u1", "u2", "u3", id].sort((a, b) => a.localeCompare(b))))]);
});

const crudErrors = shopJourney("a missing id, an unknown record and a bad body answer the documented errors", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const cases: [string, string, string, number, string, string?][] = [
    ["get without id", "GET", "/users/get", 400, "Missing id."],
    ["get unknown", "GET", "/users/get?id=nope", 404, "Not Found"],
    ["edit without id", "PUT", "/users/edit", 400, "Missing id.", '{"name":"x"}'],
    ["edit unknown", "PUT", "/users/edit?id=nope", 404, "Not Found", '{"name":"x"}'],
    ["edit with a body that is not JSON", "PUT", "/users/edit?id=u1", 400, "Invalid JSON body.", "nope"],
    ["delete without id", "DELETE", "/users/delete", 400, "Missing id."],
    ["new with a body that is not JSON", "POST", "/users/new", 400, "Invalid JSON body.", "not json"],
    ["new with a JSON array", "POST", "/users/new", 400, "The request body must be a JSON object.", "[1,2]"],
  ];
  for (const [name, method, path, code, text, body] of cases) {
    const answer = await shop.request(name, method, path, { body });
    context.expect(answer.folder, [status(answer, code), equal(`${name} answers its message`, answer.body, text)]);
  }
  const unknownDelete = await shop.request("delete an unknown id", "DELETE", "/users/delete?id=ghost");
  context.expect(unknownDelete.folder, [status(unknownDelete, 200)]);
  const invalid = await shop.request("quickEdit with an invalid email", "PUT", "/users/quickEdit?id=u1", { body: '{"email":"not-an-email"}' });
  context.expect(invalid.folder, [status(invalid, 400), equal("a route that skips the mandatory check still runs the validators", invalid.json, { code: INVALID, fields: ["email"] })]);
  const rows = await stored(shop, "count the rows", "verify__users");
  context.expect(rows.folder, [equal("no failed request wrote anything", rows.rows.length, 5)]);
});

const crudSubset = shopJourney("a controller serves only the routes it declares, under the endpoint name it is given", async (shop) => {
  const { context } = shop;
  await seed(shop, `${USERS}\nd.verify__authors.insertMany([{ _id: "au1", name: "Zola" }]);`);
  const served = await shop.request("get an author", "GET", "/authors/get?id=au1");
  context.expect(served.folder, [status(served, 200), ...holds(served, { name: "Zola" })]);
  const created = await shop.request("create an author", "POST", "/authors/new", { body: JSON.stringify({ name: "Austen" }) });
  context.expect(created.folder, [status(created, 200)]);
  for (const [name, method, path] of [["edit is not declared", "PUT", "/authors/edit?id=au1"], ["delete is not declared", "DELETE", "/authors/delete?id=au1"], ["the renamed route has no key name", "PUT", "/authors/quick?id=au1"]]) {
    const answer = await shop.request(name, method, path, { body: '{"name":"x"}' });
    context.expect(answer.folder, [status(answer, 404)]);
  }
  const renamed = await shop.request("edit through the renamed endpoint", "PUT", "/authors/patch?id=au1", { body: JSON.stringify({ name: "Renamed" }) });
  context.expect(renamed.folder, [status(renamed, 200), ...holds(renamed, { name: "Renamed" })]);
  const author = await stored(shop, "read the author back", "verify__authors", '{ _id: "au1" }');
  context.expect(author.folder, [equal("the renamed endpoint wrote the name", pick(author.rows[0] ?? null, "name"), "Renamed")]);
  const inherited = await shop.request("get through the derived controller", "GET", "/staff/get?id=u1");
  context.expect(inherited.folder, [status(inherited, 200), ...holds(inherited, { name: "Alice" })]);
});

const optionOverrides = shopJourney("route options override the query string and switch checks off", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const capped = await shop.request("capped list with a larger limit", "GET", "/users/capped?limit=50");
  context.expect(capped.folder, [equal("maxPage caps the limit", pick(capped.json, "limit"), 3), equal("three rows", results(capped).length, 3), equal("the total counts every row", pick(capped.json, "total"), 5)]);
  const cappedDefault = await shop.request("capped list without limit", "GET", "/users/capped");
  context.expect(cappedDefault.folder, [equal("maxPage is the page size without a limit", pick(cappedDefault.json, "limit"), 3), equal("three rows", results(cappedDefault).length, 3)]);
  const refused = await shop.request("edit clears a mandatory field", "PUT", "/users/edit?id=u2", { body: '{"status":null}' });
  context.expect(refused.folder, [status(refused, 400), equal("the mandatory check answers its code", pick(refused.json, "code"), MISSING)]);
  const skipped = await shop.request("quickEdit clears a mandatory field", "PUT", "/users/quickEdit?id=u2", { body: '{"status":null}' });
  context.expect(skipped.folder, [status(skipped, 200), equal("noMandatory skips the check", pick(skipped.json, "status"), null)]);
  const row = await stored(shop, "read u2 back", "verify__users", '{ _id: "u2" }');
  context.expect(row.folder, [equal("the cleared status is stored", pick(row.rows[0] ?? null, "status"), null)]);
  const falseString = await shop.request("a route option set to the string false", "PUT", "/users/falseSkip?id=u3", { body: '{"status":null}' });
  context.expect(falseString.folder, [status(falseString, 200), equal("any non-empty string turns noMandatory on, false included", pick(falseString.json, "status"), null)]);
  const byIndex = await shop.request("get through the email index", "GET", "/users/byEmail?id=bob@gmail.com");
  context.expect(byIndex.folder, [status(byIndex, 200), ...holds(byIndex, { _id: "u2", name: "Bob" })]);
  const unplucked = await shop.request("list with noPluck", "GET", "/users/unplucked");
  context.expect(unplucked.folder, [status(unplucked, 200), equal("noPluck still reads the readable fields", keysOf(results(unplucked)[0] ?? null).includes("biography"), true), equal("noPluck keeps the write-only password out", keysOf(results(unplucked)[0] ?? null).includes("password"), false)]);
  const missingMode = await shop.request("list in a mode no field declares", "GET", "/users/missingMode");
  context.expect(missingMode.folder, [status(missingMode, 400), equal("the answer names the mode", missingMode.body, "No fields found for pluckMode 'nothing'")]);
});

const accessModes = shopJourney("access modes decide what a response holds and what a write stores, per action", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const read = await shop.request("get u1", "GET", "/users/get?id=u1");
  const readKeys = keysOf(read.json);
  context.expect(read.folder, [
    equal("a write-only field is never read", readKeys.includes("password"), false),
    equal("a field without @Access is never read", readKeys.includes("secretNote"), false),
    equal("a read-only field is read", pick(read.json, "createdAt"), "2020"),
    equal("a read-write field is read", pick(read.json, "name"), "Alice"),
  ]);
  const list = await shop.request("list", "GET", "/users/list");
  context.expect(list.folder, [equal("a list never holds the write-only field", results(list).some((row) => keysOf(row).includes("password")), false)]);
  const created = await shop.request("create with read-only, write-only and unguarded fields", "POST", "/users/new", { body: JSON.stringify({ name: "Zed", email: "zed@example.com", password: "pw1234", role: "admin", age: 33, createdAt: "x", biography: "b", secretNote: "leak" }) });
  const id = text(pick(created.json, "_id"));
  const row = await stored(shop, "read the new row back", "verify__users", `{ _id: "${id}" }`);
  const written = row.rows[0] ?? null;
  context.expect(row.folder, [
    equal("a write-only field is stored", pick(written, "password"), "pw1234"),
    equal("an override lets role and age be written on new", [pick(written, "role"), pick(written, "age")], ["admin", 33]),
    equal("a read-only field is not written", pick(written, "createdAt"), null),
    equal("a field without @Access is not written", pick(written, "secretNote"), null),
  ]);
  const edited = await shop.request("edit read-only and overridden fields", "PUT", "/users/edit?id=u1", { body: JSON.stringify({ name: "Alice2", role: "hacked", age: 99, createdAt: "zzz" }) });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { name: "Alice2", role: "admin", age: 30, createdAt: "2020" })]);
  const after = await stored(shop, "read u1 back", "verify__users", '{ _id: "u1" }');
  const kept = after.rows[0] ?? null;
  context.expect(after.folder, [
    equal("edit wrote the read-write name", pick(kept, "name"), "Alice2"),
    equal("edit ignored the role overridden to read-only", pick(kept, "role"), "admin"),
    equal("edit ignored the read-only age", pick(kept, "age"), 30),
    equal("edit ignored the read-only createdAt", pick(kept, "createdAt"), "2020"),
  ]);
});

const mandatoryAndValidators = shopJourney("mandatory fields and validators answer 400 bodies with a code and every field that failed", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const missing = await shop.request("new without mandatory fields", "POST", "/users/new", { body: '{"name":"Zed"}' });
  context.expect(missing.folder, [status(missing, 400), equal("the body names the code and every missing field", missing.json, { code: MISSING, fields: ["email", "password"] })]);
  const empty = await shop.request("new with an empty object", "POST", "/users/new", { body: "{}" });
  context.expect(empty.folder, [status(empty, 400), equal("the mandatory check runs before the validators", pick(empty.json, "code"), MISSING)]);
  const invalid = await shop.request("new with invalid values", "POST", "/users/new", { body: JSON.stringify({ name: "Zed", email: "not-an-email", password: "pw1234", age: 500, nickname: "taken" }) });
  context.expect(invalid.folder, [status(invalid, 400), equal("the body names the code and every invalid field", invalid.json, { code: INVALID, fields: ["email", "age", "nickname"] })]);
  const nothing = await stored(shop, "count the users", "verify__users");
  context.expect(nothing.folder, [equal("a refused write stores nothing", nothing.rows.length, 5)]);
  const absent = await shop.request("edit sends only the name", "PUT", "/users/edit?id=u1", { body: '{"name":"Alice2"}' });
  context.expect(absent.folder, [status(absent, 200), equal("an absent mandatory field keeps its value", pick(absent.json, "email"), "alice@example.com")]);
  for (const [name, body] of [["an empty string", '{"email":""}'], ["null", '{"email":null}']] as const) {
    const cleared = await shop.request(`edit clears a mandatory field with ${name}`, "PUT", "/users/edit?id=u1", { body });
    context.expect(cleared.folder, [status(cleared, 400), equal("the body names the field", cleared.json, { code: MISSING, fields: ["email"] })]);
  }
  const taken = await shop.request("edit with a value the async validator refuses", "PUT", "/users/edit?id=u1", { body: '{"nickname":"taken"}' });
  context.expect(taken.folder, [status(taken, 400), equal("the async validator answers its code", taken.json, { code: INVALID, fields: ["nickname"] })]);
  const valid = await shop.request("edit with a valid email", "PUT", "/users/edit?id=u1", { body: '{"email":"alice@corp.io"}' });
  context.expect(valid.folder, [status(valid, 200), ...holds(valid, { email: "alice@corp.io" })]);
  const optional = await shop.request("new without the optional field", "POST", "/users/new", { body: JSON.stringify({ name: "Zed", email: "zed@example.com", password: "pw1234" }) });
  context.expect(optional.folder, [status(optional, 200)]);
});

const parsedValues = shopJourney("a validator that returns a parse result makes the route write the parsed value", async (shop) => {
  const { context } = shop;
  await seed(shop, USERS);
  const created = await shop.request("new with a date string", "POST", "/users/new", { body: JSON.stringify({ name: "Zed", email: "zed@example.com", password: "pw1234", startsAt: "2026-01-15" }) });
  const id = text(pick(created.json, "_id"));
  context.expect(created.folder, [status(created, 200), ...holds(created, { startsAt: "2026-01-15T00:00:00.000Z" })]);
  const asDate = await shop.mongo("count date-typed values", `db.getSiblingDB("verify").verify__users.countDocuments({ _id: "${id}", startsAt: { $type: "date" } })`);
  context.expect(asDate.folder, [equal("new stored a Date, not the string", asDate.stdout.trim(), "1")]);
  const edited = await shop.request("edit with another date string", "PUT", "/users/edit?id=u1", { body: JSON.stringify({ startsAt: "2027-02-03" }) });
  context.expect(edited.folder, [status(edited, 200), ...holds(edited, { startsAt: "2027-02-03T00:00:00.000Z" })]);
  const editedDate = await shop.mongo("count date-typed values on u1", 'db.getSiblingDB("verify").verify__users.countDocuments({ _id: "u1", startsAt: { $type: "date" } })');
  context.expect(editedDate.folder, [equal("edit stored a Date, not the string", editedDate.stdout.trim(), "1")]);
  const refused = await shop.request("new with a value the schema refuses", "POST", "/users/new", { body: JSON.stringify({ name: "Zed", email: "zed2@example.com", password: "pw1234", startsAt: "not a date" }) });
  context.expect(refused.folder, [status(refused, 400), equal("the parse failure answers its code", refused.json, { code: INVALID, fields: ["startsAt"] })]);
});

const unstorableBody = shopJourney("a parsed body that holds a value no database stores answers 400", async (shop) => {
  const { context } = shop;
  await seed(shop, `d.verify__documents.insertMany([{ _id: "x1", title: "Bill", documentType: "invoice" }]);`);
  const refused = await shop.request("new through a route that sets a bigint", "POST", "/documents/unstorable", { body: '{"title":"x"}' });
  context.expect(refused.folder, [status(refused, 400)]);
  const rows = await stored(shop, "count the documents", "verify__documents");
  context.expect(rows.folder, [equal("nothing was written", rows.rows.length, 1)]);
});

const errorCodes: Journey = {
  title: "the packed components export the codes the 400 bodies carry",
  entryPoint: "the packed `components` entry required from a consumer",
  async run(context) {
    const loaded = await context.command("read the exported codes", "node", [
      "-e",
      'const { Validation } = require(process.argv[1]); console.log(JSON.stringify([Validation.MISSING_MANDATORY_FIELDS, Validation.INVALID_FIELD_TYPES]));',
      `${context.repo}/dist/components.js`,
    ]);
    context.expect(loaded.folder, [exitIs(loaded, 0), equal("the exported codes are the ones the bodies carry", loaded.stdout.trim(), JSON.stringify([MISSING, INVALID]))]);
  },
};

export const WRITE_JOURNEYS = {
  "smoke-roundtrip": smokeRoundtrip,
  "crud-lifecycle": crudLifecycle,
  "crud-errors": crudErrors,
  "crud-subset": crudSubset,
  "option-overrides": optionOverrides,
  "access-modes": accessModes,
  "mandatory-and-validators": mandatoryAndValidators,
  "parsed-values": parsedValues,
  "unstorable-body": unstorableBody,
  "error-codes": errorCodes,
};
