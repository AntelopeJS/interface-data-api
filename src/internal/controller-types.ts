/** @internal @packageDocumentation */

import type { ControllerClass } from "@antelopejs/interface-api";
import type { ParameterDecorator } from "@antelopejs/interface-core/decorators";

/** The controller a data route runs on: an instance of a class built by `DataController`. */
export type DataControllerInstance = InstanceType<ControllerClass>;

/**
 * One route of a data controller. Entry `i` of `args` injects parameter `i`
 * of `func`, so `A` lists what `func` receives, one element per entry; the
 * stock routes take the request context first and their parameters second.
 * Without `A`, the route is one whose parameters are not known, as a
 * {@link DataControllerDef} holds it: its `func` takes `O` second and anything
 * else, unchecked.
 *
 * @typeParam O The options the route receives in its second parameter
 * @typeParam R What `func` answers, resolved
 * @typeParam A The parameters of `func`, one per entry of `args`
 */
export type DataControllerCallback<
  O = any,
  R = unknown,
  A extends unknown[] = [ctx: any, opts: O, ...args: any[]],
> = {
  args: (ParameterDecorator | ParameterDecorator[])[];
  method: string;
  func: (...args: A) => R | Promise<R>;
};

export type DataControllerCallbackWithOptions<
  O = any,
  R = unknown,
  A extends unknown[] = [ctx: any, opts: O, ...args: any[]],
> = {
  endpoint?: string;
  options?: Partial<O>;
  callback: DataControllerCallback<O, R, A>;
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
