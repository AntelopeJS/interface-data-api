import Module from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";

import { isFunction, isObject } from "../../internal/guards";

class InternalModule extends Module {
  declare static _resolveFilename: (request: string, parent: Module) => string;
  declare static _nodeModulePaths: (directory: string) => string[];
  declare load: (filename: string) => void;
}

type ModuleRequire = (request: string) => object;

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

  const load = (filename: string, parent: Module): InternalModule => {
    const cached = modules.get(filename);
    if (cached) {
      return cached;
    }
    const loaded = new InternalModule(filename, parent);
    loaded.filename = filename;
    loaded.paths = InternalModule._nodeModulePaths(path.dirname(filename));
    loaded.require = (request: string) => requireFrom(loaded, request);
    modules.set(filename, loaded);
    loaded.load(filename);
    return loaded;
  };

  const requireFrom = (parent: Module, request: string): object => {
    const filename = InternalModule._resolveFilename(request, parent);
    const isOwned = owned.some((root) => filename.startsWith(root));
    const exported: unknown = isOwned
      ? load(filename, parent).exports
      : Module.prototype.require.call(parent, request);
    if (!isObject(exported) && !isFunction(exported)) {
      throw new Error(`${request} exports neither an object nor a function`);
    }
    return exported;
  };

  return (request: string) => requireFrom(module, request);
}

function exportsAllOf<Exports extends object>(
  loaded: unknown,
  reference: Exports,
): loaded is Exports {
  return (
    isObject(loaded) && Object.keys(reference).every((name) => name in loaded)
  );
}

/**
 * Evaluates a built module again and checks that the copy exports every name
 * the module already loaded exports.
 *
 * @param load The `require` of {@link CreateOtherInstance}
 * @param file Built file to evaluate again
 * @param reference The module already loaded from the same file
 * @returns The second copy of the module
 */
export function LoadAgain<Exports extends object>(
  load: ModuleRequire,
  file: string,
  reference: Exports,
): Exports {
  const loaded = load(file);
  if (!exportsAllOf(loaded, reference)) {
    throw new Error(`${file} does not export the names of its first copy`);
  }
  return loaded;
}
