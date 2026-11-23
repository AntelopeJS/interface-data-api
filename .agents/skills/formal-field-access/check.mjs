#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Checks field exposure and write gating of @antelopejs/interface-data-api:
 * `field-access.ts` declares every controller within its bounds through the
 * real decorators and runs the real `ReadProperties` and `WriteProperties`
 * on each. Node needs module hooks to run the TypeScript sources, so this
 * starts a second Node with them and answers its exit status: 0 when every
 * rule matches the record in SKILL.md, 1 when a rule changed, 2 when the
 * check could not run.
 *
 * @param {string[]} args Flags for `field-access.ts`.
 * @returns {number} The exit status.
 */
function RunFieldAccessCheck(args) {
  const run = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--import",
      pathToFileURL(path.join(dir, "ts-loader.mjs")).href,
      path.join(dir, "field-access.ts"),
      ...args,
    ],
    { stdio: "inherit" },
  );
  return run.status ?? 2;
}

process.exit(RunFieldAccessCheck(process.argv.slice(2)));
