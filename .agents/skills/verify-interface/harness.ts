import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";

import { equal, exitIs, interrupted } from "@antelopejs/tooling-configs/verify";
import type { App, Check, CommandResult, Journey, JourneyContext } from "@antelopejs/tooling-configs/verify";

/** The `@antelopejs/mongodb` release the package's own tests run against. */
const MONGODB_VERSION = "1.7.0";
const READY_POLLS = 60;
const READY_MS = 500;
const INTERFACES = [
  "@antelopejs/interface-api",
  "@antelopejs/interface-api-util",
  "@antelopejs/interface-core",
  "@antelopejs/interface-database",
  "@antelopejs/interface-database-decorators",
];
const SHOP_SOURCE_PARTS = ["shop-1.ts.txt", "shop-2.ts.txt"].map((name) => join(import.meta.dirname, "fixture", name));

/** A JSON value, as the harness checks take it. */
export type Json = Exclude<Parameters<typeof equal>[1], undefined>;

/** What an HTTP request to the running API answered. */
export interface Answer {
  folder: string;
  status: number;
  body: string;
  json: Json | undefined;
}

/** The running shop: its base URL and the helpers journeys drive it with. */
export interface Shop {
  context: JourneyContext;
  app: App;
  base: string;
  request(name: string, method: string, path: string, options?: { body?: string; headers?: string[] }): Promise<Answer>;
  mongo(name: string, script: string): Promise<CommandResult>;
}

const LISTEN_ADDRESS = z.object({ port: z.number() });

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = LISTEN_ADDRESS.safeParse(server.address());
      const port = address.success ? address.data.port : 0;
      server.close(() => resolve(port));
    });
  });
}

const JSON_VALUE = z.json();
const JSON_OBJECT = z.record(z.string(), z.json());

function parseJson(text: string): Json | undefined {
  try {
    return JSON_VALUE.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** The script that links the packed interface and the repository's interface copies into the shop module. */
const LINK_SCRIPT = `
const fs = require("node:fs");
const path = require("node:path");
const [, , shop, packed, repo, ...names] = process.argv;
const link = (name, target) => {
  const at = path.join(shop, "node_modules", name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, "dir");
};
link("@antelopejs/interface-data-api", packed);
for (const name of [...names, "zod"]) link(name, fs.realpathSync(path.join(repo, "node_modules", name)));
`;

const TSC_FLAGS = [
  "--strict", "--experimentalDecorators", "--emitDecoratorMetadata", "--esModuleInterop",
  "--target", "es2022", "--module", "commonjs", "--moduleResolution", "node", "--types", "node",
];

/** Writes the shop module into `project` linked to the run's packed interface, and returns its folder and that interface. */
async function writeShop(context: JourneyContext, project: string): Promise<{ shop: string; packed: string; source: string }> {
  const shop = join(project, "shop");
  const packed = realpathSync(join(project, "driver", "node_modules", "@antelopejs", "interface-data-api"));
  const source = SHOP_SOURCE_PARTS.map((part) => readFileSync(part, "utf8")).join("");
  context.edit("write the shop module manifest", join(shop, "package.json"), `${JSON.stringify({
    name: "verify-shop",
    version: "1.0.0",
    main: "shop.js",
    dependencies: Object.fromEntries(INTERFACES.map((name) => [name, "*"])),
  }, null, 2)}\n`);
  context.edit("write the shop module source", join(shop, "shop.ts"), source);
  context.edit("write the link script", join(context.work, "link.cjs"), LINK_SCRIPT);
  const linked = await context.command("link the packed interface", "node", [join(context.work, "link.cjs"), shop, packed, context.repo, ...INTERFACES]);
  context.expect(linked.folder, [exitIs(linked, 0)], { critical: true });
  return { shop, packed, source };
}

/** Type-checks and emits `shop.ts` against the packed declarations, and returns the compile when it passed. */
async function compileShop(context: JourneyContext, shop: string): Promise<CommandResult | undefined> {
  const compiled = await context.command("compile the shop against the packed declarations", "node", [
    join(context.repo, "node_modules", "typescript", "bin", "tsc"),
    ...TSC_FLAGS, "--typeRoots", join(context.repo, "node_modules", "@types"),
    "--outDir", shop, join(shop, "shop.ts"),
  ], { timeoutMs: 180_000 });
  const passed = context.expect(compiled.folder, [{ name: "the shop compiles against the packed declarations", pass: compiled.exitCode === 0, detail: compiled.stdout.slice(0, 600) }], { critical: true });
  return passed ? compiled : undefined;
}

function publish(file: string, content: string): void {
  const staged = `${file}.${randomUUID()}`;
  writeFileSync(staged, content);
  renameSync(staged, file);
}

/**
 * Compiles the shop once per packed interface: every input of the compile is the same in each journey of a run, so
 * later journeys copy the emitted `shop.js` from beside the packed interface, which `clean` removes with the run, and
 * record the compile that produced it in their own evidence.
 */
async function compiledShop(context: JourneyContext, project: string): Promise<void> {
  const { shop, packed, source } = await writeShop(context, project);
  const digest = createHash("sha256").update(JSON.stringify([source, TSC_FLAGS])).digest("hex").slice(0, 16);
  const cached = join(dirname(packed), `verify-shop-${digest}.js`);
  const record = `${cached}.compile.txt`;
  if (existsSync(cached) && existsSync(record)) {
    context.edit("record the compile of the reused shop", join(context.work, "shop-compile.txt"), readFileSync(record, "utf8"));
    context.edit(`reuse the shop compiled earlier in this run as verify-shop-${digest}.js`, join(shop, "shop.js"), readFileSync(cached, "utf8"));
    return;
  }
  const compiled = await compileShop(context, shop);
  if (compiled === undefined) return;
  publish(record, `${compiled.command}\nexit ${compiled.exitCode}\n${compiled.stdout}${compiled.stderr}`);
  publish(cached, readFileSync(join(shop, "shop.js"), "utf8"));
}

function rewriteConfig(context: JourneyContext, project: string, apiPort: number): void {
  const mongo = context.service("mongo");
  const overrides = { "@antelopejs/interface-api": "api", "@antelopejs/interface-database": "mongodb" };
  const config = {
    name: "verify-interface-data-api",
    cacheFolder: join(context.repo, ".antelope", "cache"),
    modules: {
      "verify-stub": { source: { type: "local", path: "./stub" }, importOverrides: overrides },
      "verify-driver": { source: { type: "local", path: "./driver" }, importOverrides: overrides },
      mongodb: {
        source: { type: "package", package: "@antelopejs/mongodb", version: MONGODB_VERSION },
        config: { url: `mongodb://${mongo.host}:${mongo.port}`, database: "verify" },
      },
      api: {
        source: { type: "local", path: realpathSync(join(context.repo, "node_modules", "@antelopejs", "api")) },
        config: { publicBaseUrl: `http://127.0.0.1:${apiPort}`, servers: [{ protocol: "http", host: "127.0.0.1", port: apiPort }] },
      },
      "verify-shop": { source: { type: "local", path: "./shop" }, importOverrides: overrides },
    },
  };
  context.edit("wire the shop, the API and MongoDB into the project", join(project, "antelope.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
}

/** Runs one request with curl, so the evidence holds the command, and returns its status and body. */
async function curl(context: JourneyContext, base: string, name: string, call: { method: string; path: string; body?: string; headers?: string[] }): Promise<Answer> {
  const { method, path, ...options } = call;
  const args = ["-sS", "-X", method, "-H", "content-type: application/json", "-w", "\\n%{http_code}"];
  for (const header of options.headers ?? []) args.push("-H", header);
  if (options.body !== undefined) args.push("--data-binary", options.body);
  const ran = await context.command(name, "curl", [...args, `${base}${path}`], { timeoutMs: 30_000 });
  const cut = ran.stdout.lastIndexOf("\n");
  const body = ran.stdout.slice(0, cut);
  return { folder: ran.folder, status: Number(ran.stdout.slice(cut + 1)), body, json: parseJson(body) };
}

/** Compiles the consumer module against the packed declarations and stops. */
export async function compileOnly(context: JourneyContext): Promise<void> {
  const { shop } = await writeShop(context, context.fixture());
  await compileShop(context, shop);
}

/** Compiles the shop, starts `ajs project dev` with the API and MongoDB, waits until the routes answer, runs `use`, then stops the project by SIGINT. */
export async function withShop(context: JourneyContext, use: (shop: Shop) => Promise<void>): Promise<void> {
  const project = context.fixture();
  await compiledShop(context, project);
  const apiPort = await freePort();
  rewriteConfig(context, project, apiPort);
  const app = await context.dev("ajs project dev", project);
  const base = `http://127.0.0.1:${apiPort}`;
  const shop: Shop = {
    context,
    app,
    base,
    request: (name, method, path, options) => curl(context, base, name, { method, path, ...options }),
    mongo: (name, script) => context.native(name, "mongo", ["mongosh", "--quiet", "--eval", script]),
  };
  try {
    let probe = await curl(context, base, "wait for the routes", { method: "GET", path: "/users/list" });
    for (let poll = 0; poll < READY_POLLS && probe.status !== 200; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, READY_MS));
      probe = await curl(context, base, "wait for the routes", { method: "GET", path: "/users/list" });
    }
    context.expect(probe.folder, [{ name: "the data controllers answer once the project is up", pass: probe.status === 200, detail: base }], { critical: true });
    await use(shop);
  } finally {
    const stopped = await context.stop("SIGINT", app);
    context.expect(stopped.folder, [interrupted(stopped)]);
  }
}

/** A check that `answer` has the HTTP `status`. */
export function status(answer: Answer, expected: number, label = `answers ${expected}`): Check {
  return { name: label, pass: answer.status === expected, detail: `status ${answer.status}: ${answer.body.slice(0, 300)}` };
}


/** The value at `key` of a JSON object, or null when the key is absent. */
export function pick(value: Json | undefined, key: string): Json {
  const object = JSON_OBJECT.safeParse(value);
  return object.success ? (object.data[key] ?? null) : null;
}

/** The keys of a JSON object, sorted. */
export function keysOf(value: Json | undefined): string[] {
  const object = JSON_OBJECT.safeParse(value);
  return object.success ? Object.keys(object.data).sort((a, b) => a.localeCompare(b)) : [];
}

/** The rows of a list answer. */
export function results(answer: Answer): Json[] {
  const found = pick(answer.json, "results");
  return Array.isArray(found) ? found : [];
}

/** A JSON string value as text, or the JSON of any other value. */
export function text(value: Json | undefined): string {
  const parsed = z.string().safeParse(value);
  return parsed.success ? parsed.data : JSON.stringify(value ?? null);
}

/** The `_id` of each row of a list answer, sorted. */
export function ids(answer: Answer): string[] {
  return results(answer).map((row) => text(pick(row, "_id"))).sort((a, b) => a.localeCompare(b));
}

/** One check per key: the answer's JSON object holds `expected[key]` at `key`. */
export function holds(answer: Answer, expected: { [key: string]: Json }): Check[] {
  return Object.entries(expected).map(([key, value]) => equal(`${key} in the answer`, pick(answer.json, key), value));
}

/** Reads rows of a collection back through mongosh, the second view of every write: `filter` and `projection` are mongosh source. */
export async function stored(shop: Shop, name: string, collection: string, filter = "{}", projection = "{}"): Promise<{ folder: string; rows: Json[] }> {
  const read = await shop.mongo(name, `JSON.stringify(db.getSiblingDB("verify").${collection}.find(${filter}, ${projection}).sort({ _id: 1 }).toArray())`);
  const rows = parseJson(read.stdout.trim());
  return { folder: read.folder, rows: Array.isArray(rows) ? rows : [] };
}

/** Inserts documents with mongosh before a request: `script` is mongosh source. */
export async function seed(shop: Shop, script: string): Promise<void> {
  const run = await shop.mongo("seed MongoDB", `const d = db.getSiblingDB("verify"); ${script}`);
  shop.context.expect(run.folder, [exitIs(run, 0)], { critical: true });
}

/** A journey that drives the shop module over HTTP and reads the writes back in MongoDB. */
export function shopJourney(title: string, run: (shop: Shop) => Promise<void>): Journey {
  return {
    title,
    entryPoint: "HTTP requests to the shop module's data controllers in `ajs project dev`, read back in MongoDB",
    run: (context) => withShop(context, run),
  };
}
