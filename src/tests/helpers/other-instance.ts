import Module from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";

interface ModuleInternals {
  _resolveFilename(request: string, parent: Module): string;
  _nodeModulePaths(directory: string): string[];
}

interface LoadableModule {
  load(filename: string): void;
}

type ModuleRequire = (request: string) => unknown;

const internals = Module as unknown as ModuleInternals;

/**
 * Evaluates built packages a second time, the way the core gives each
 * provider binding its own copy of an interface: every file under `folders`
 * is loaded again, with its own classes, symbols and registries, while
 * anything else (interface-core, third-party dependencies) stays the copy
 * already loaded.
 *
 * @param folders Build output folders to evaluate again
 * @returns A `require` resolving into the second copy
 */
export function CreateOtherInstance(folders: string[]): ModuleRequire {
  const owned = folders.map((folder) => realpathSync(folder) + path.sep);
  const modules = new Map<string, Module>();

  const load = (filename: string, parent: Module): unknown => {
    const cached = modules.get(filename);
    if (cached) {
      return cached.exports;
    }
    const loaded = new Module(filename, parent);
    loaded.filename = filename;
    loaded.paths = internals._nodeModulePaths(path.dirname(filename));
    loaded.require = ((request: string) =>
      requireFrom(loaded, request)) as Module["require"];
    modules.set(filename, loaded);
    (loaded as unknown as LoadableModule).load(filename);
    return loaded.exports;
  };

  const requireFrom = (parent: Module, request: string): unknown => {
    const filename = internals._resolveFilename(request, parent);
    const isOwned = owned.some((root) => filename.startsWith(root));
    return isOwned
      ? load(filename, parent)
      : Module.prototype.require.call(parent, request);
  };

  return (request: string) => requireFrom(module, request);
}
