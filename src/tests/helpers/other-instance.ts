import Module from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";

class InternalModule extends Module {
  declare static _resolveFilename: (request: string, parent: Module) => string;
  declare static _nodeModulePaths: (directory: string) => string[];
  declare load: (filename: string) => void;
}

type ModuleRequire = (request: string) => unknown;

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
  const modules = new Map<string, InternalModule>();

  const load = (filename: string, parent: Module): Module["exports"] => {
    const cached = modules.get(filename);
    if (cached) {
      return cached.exports;
    }
    const loaded = new InternalModule(filename, parent);
    loaded.filename = filename;
    loaded.paths = InternalModule._nodeModulePaths(path.dirname(filename));
    loaded.require = (request: string) => requireFrom(loaded, request);
    modules.set(filename, loaded);
    loaded.load(filename);
    return loaded.exports;
  };

  const requireFrom = (parent: Module, request: string): Module["exports"] => {
    const filename = InternalModule._resolveFilename(request, parent);
    const isOwned = owned.some((root) => filename.startsWith(root));
    return isOwned
      ? load(filename, parent)
      : Module.prototype.require.call(parent, request);
  };

  return (request: string) => requireFrom(module, request);
}
