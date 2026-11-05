import { Controller } from "@antelopejs/interface-api";
import type { VerifyConfig } from "@antelopejs/tooling-configs/verify";

import type * as DataApi from "../../../src/index.ts";
import { PROBE_JOURNEYS } from "./journeys-probe.ts";
import { READ_JOURNEYS } from "./journeys-read.ts";
import { WRITE_JOURNEYS } from "./journeys-write.ts";

const FAILS_ON_AN_UNREGISTERED_SCHEMA = "Non-existent Database Schema";

/** The route functions of `DefaultRoutes`: each is named after its endpoint, and `All` holds the same functions. */
function routeFunctions(api: typeof DataApi) {
  const { Get, List, New, Edit, Delete, All } = api.DefaultRoutes;
  return {
    names: [Get.func.name, List.func.name, New.func.name, Edit.func.name, Delete.func.name],
    all: [All.get.func === Get.func, All.list.func === List.func, All.new.func === New.func, All.edit.func === Edit.func, All.delete.func === Delete.func],
  };
}

const config: VerifyConfig<typeof DataApi> = {
  doors: {
    data: {
      globs: ["src/index.ts", "src/components.ts", "src/internal/tables.ts", "src/internal/properties.ts"],
      funnels: [],
      containments: ["crud/crud-lifecycle"],
      why: "the new, edit and delete routes write and remove rows in the consumer's database; a delete that removes a row nobody named cannot be undone",
    },
    format: {
      globs: ["src/components.ts", "src/internal/validation.ts"],
      funnels: [],
      containments: ["validation/mandatory-and-validators"],
      why: "the 400 bodies (code and fields) are what clients parse",
    },
    contract: {
      globs: ["src/index.ts", "src/metadata.ts", "src/components.ts", "package.json"],
      funnels: [],
      containments: [],
      why: "the decorators, DataController and DefaultRoutes are what every module serving a table imports",
    },
    outbound: null,
    exposure: {
      globs: ["src/internal/read-properties.ts", "src/metadata.ts"],
      funnels: [],
      containments: [],
      why: "the access modes decide which fields a response holds; a write-only field that leaks exposes a secret",
    },
    publish: {
      globs: ["package.json", ".release-it.json", "changelogen.config.json", ".github/workflows/release.yml"],
      funnels: [],
      containments: [],
      why: "the package name and release workflow claim @antelopejs/interface-data-api on npm",
    },
  },
  formal: [
    {
      name: "formal-field-access",
      covers: [
        "src/metadata.ts",
        "src/components.ts",
        "src/index.ts",
        "src/internal/read-properties.ts",
        "src/internal/properties.ts",
        "src/internal/meta-records.ts",
        "src/internal/prototypes.ts",
      ],
      files: [".agents/skills/formal-field-access/**"],
      command: ["node", ".agents/skills/formal-field-access/check.mjs", "--full"],
      baseCommand: ["node", ".agents/skills/formal-field-access/check.mjs"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
  ],
  services: {
    mongo: {
      image: "mongo:7",
      port: 27017,
      ready: ["mongosh", "--quiet", "--eval", "db.runCommand({ ping: 1 }).ok"],
      reset: ["mongosh", "--quiet", "--eval", 'db.getSiblingDB("verify").dropDatabase(); db.getSiblingDB("verify_auth").dropDatabase()'],
    },
  },
  interface: {
    calls: {
      ".:DataController": {
        call: (api) => {
          try {
            api.DataController(class Bogus {}, {}, Controller("/bogus"));
            return Promise.resolve("declared");
          } catch (error) {
            return Promise.resolve(error instanceof Error ? error.message : "thrown");
          }
        },
        expect: FAILS_ON_AN_UNREGISTERED_SCHEMA,
      },
      ".:GetDataControllerMeta": {
        call: (api) => Promise.resolve(api.GetDataControllerMeta({}).setMode.name),
        expect: "setMode",
      },
      ".:RegisterDataController": { call: (api) => Promise.resolve(api.RegisterDataController().length), expect: 1 },
      ".:DefaultRoutes.WithOptions": {
        call: (api) => {
          const { Get, WithOptions } = api.DefaultRoutes;
          const renamed = WithOptions(Get, { noForeign: "true" }, "raw");
          const merged = WithOptions(WithOptions(Get, { noForeign: "true" }), { index: "email" });
          return Promise.resolve({ endpoint: renamed.endpoint ?? null, options: renamed.options ?? null, wrapsGet: renamed.callback === Get, merged: merged.options ?? null });
        },
        expect: { endpoint: "raw", options: { noForeign: "true" }, wrapsGet: true, merged: { noForeign: "true", index: "email" } },
      },
      ".:DefaultRoutes.WithGetGuard": {
        call: (api) => {
          const guarded = api.DefaultRoutes.WithGetGuard(() => undefined);
          return Promise.resolve({ method: guarded.method, args: guarded.args === api.DefaultRoutes.Get.args, ownFunc: guarded.func !== api.DefaultRoutes.Get.func });
        },
        expect: { method: "get", args: true, ownFunc: true },
      },
      ...Object.fromEntries(
        ["Get", "List", "New", "Edit", "Delete"].map((route) => [
          `.:DefaultRoutes.${route}.func`,
          { call: (api: typeof DataApi) => Promise.resolve(routeFunctions(api).names), expect: ["get", "list", "new", "edit", "delete"] },
        ]),
      ),
      ...Object.fromEntries(
        ["get", "list", "new", "edit", "delete"].map((route) => [
          `.:DefaultRoutes.All.${route}.func`,
          { call: (api: typeof DataApi) => Promise.resolve(routeFunctions(api).all), expect: [true, true, true, true, true] },
        ]),
      ),
    },
  },
  journeys: { ...WRITE_JOURNEYS, ...READ_JOURNEYS, ...PROBE_JOURNEYS },
};

export default config;
