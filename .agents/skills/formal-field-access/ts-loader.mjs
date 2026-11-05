/**
 * Node module hooks that run this repository's TypeScript sources as they
 * are: a relative import with no extension resolves to its `.ts` file, and
 * each `.ts` file is transformed with Node's own TypeScript support, enums
 * and namespaces included. `check.mjs` passes this file to `--import`.
 */
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const HAS_SCRIPT_EXTENSION = /\.[cm]?[jt]s$/;

registerHooks({
  resolve(specifier, context, next) {
    const fromTypeScript = context.parentURL?.endsWith(".ts") ?? false;
    if (fromTypeScript && specifier.startsWith(".") && !HAS_SCRIPT_EXTENSION.test(specifier)) {
      const file = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL));
      if (existsSync(file)) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), {
      mode: "transform",
      sourceUrl: url,
    });
    return { format: "module", source, shortCircuit: true };
  },
});
