/** @internal @packageDocumentation */

import type { ControllerClass } from "@antelopejs/interface-api";
import type { ParameterDecorator } from "@antelopejs/interface-core/decorators";

/** The controller a data route runs on: an instance of a class built by `DataController`. */
export type DataControllerInstance = InstanceType<ControllerClass>;

/**
 * One route of a data controller. `args` decides what `func` receives, so its
 * parameters stay open: the first is what `args[0]` injects, the request
 * context on the stock routes.
 *
 * @typeParam O The options `func` receives in its second parameter
 * @typeParam R What `func` answers, resolved
 */
export type DataControllerCallback<O = any, R = unknown> = {
  args: (ParameterDecorator | ParameterDecorator[])[];
  method: string;
  func: (ctx: any, opts: O, ...args: any[]) => R | Promise<R>;
};

export type DataControllerCallbackWithOptions<O = any, R = unknown> = {
  endpoint?: string;
  options?: Partial<O>;
  callback: DataControllerCallback<O, R>;
};

export type ExtractCallback<T> = T extends DataControllerCallbackWithOptions
  ? T["callback"]["func"]
  : T extends DataControllerCallback
    ? T["func"]
    : never;

export type DataControllerDef = {
  [name: string]: DataControllerCallback | DataControllerCallbackWithOptions;
};

export type ExtractDefCallbacks<T extends {}> = {
  [K in keyof T]: ExtractCallback<T[K]>;
};
