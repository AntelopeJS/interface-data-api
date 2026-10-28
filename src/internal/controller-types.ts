/** @internal @packageDocumentation */

import type { ParameterDecorator } from "@antelopejs/interface-core/decorators";

export type DataControllerCallback<O = any> = {
  args: (ParameterDecorator | ParameterDecorator[])[];
  method: string;
  func: (ctx: any, opts: O, ...args: any[]) => any;
};

export type DataControllerCallbackWithOptions<O = any> = {
  endpoint?: string;
  options?: Partial<O>;
  callback: DataControllerCallback<O>;
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
