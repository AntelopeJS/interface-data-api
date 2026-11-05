#!/usr/bin/env node
/**
 * Checks field exposure and write gating of @antelopejs/interface-data-api:
 * `field-access.ts` declares every controller within its bounds through the
 * real decorators and runs the real `ReadProperties` and `WriteProperties`
 * on each. Node needs module hooks to run the TypeScript sources, so this
 * file starts a second Node with them and exits as it exits: 0 when every
 * rule matches the record in SKILL.md, 1 when a rule changed, 2 when the
 * check could not run.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const run = spawnSync(
  process.execPath,
  [
    "--disable-warning=ExperimentalWarning",
    "--import",
    pathToFileURL(path.join(dir, "ts-loader.mjs")).href,
    path.join(dir, "field-access.ts"),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(run.status ?? 2);
