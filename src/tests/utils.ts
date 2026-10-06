import path from "node:path";
import { expect } from "chai";
import { Schema } from "@antelopejs/interface-database";

import { URL_BASE } from "./constants";

const UNKNOWN_FUNCTION_NAME = "unknown";
const PREPARE_STACK_TRACE = "prepareStackTrace";
const TESTS_FOLDER_PREFIX = `${__dirname}${path.sep}`;

function readCallSites(
  _error: Error,
  callSites: NodeJS.CallSite[],
): NodeJS.CallSite[] {
  return callSites;
}

function isCallSiteList(stack: unknown): stack is NodeJS.CallSite[] {
  return Array.isArray(stack);
}

function restoreErrorProperty(
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (!descriptor) {
    Reflect.deleteProperty(Error, property);
    return;
  }
  Object.defineProperty(Error, property, descriptor);
}

function captureCallSites(): NodeJS.CallSite[] {
  const { stackTraceLimit } = Error;
  const prepareStackTrace = Object.getOwnPropertyDescriptor(
    Error,
    PREPARE_STACK_TRACE,
  );
  Error.stackTraceLimit = Infinity;
  Error.prepareStackTrace = readCallSites;
  try {
    const stack: unknown = new Error().stack;
    return isCallSiteList(stack) ? stack : [];
  } finally {
    restoreErrorProperty(PREPARE_STACK_TRACE, prepareStackTrace);
    Error.stackTraceLimit = stackTraceLimit;
  }
}

function isTestCallSite(callSite: NodeJS.CallSite): boolean {
  const fileName = callSite.getFileName();
  return fileName !== __filename && !!fileName?.startsWith(TESTS_FOLDER_PREFIX);
}

/**
 * Returns the name of the test function that called it.
 *
 * The caller is the first stack frame located in the tests folder, so frames
 * added between the test and this helper (module loader facades, async
 * context wrappers) do not change the result.
 */
export function getFunctionName(): string {
  const caller = captureCallSites().find(isTestCallSite);
  return caller?.getFunctionName() ?? UNKNOWN_FUNCTION_NAME;
}

export async function request(
  functionName: string,
  uri: string,
  method: string,
  payload?: unknown,
  queryParams?: Record<string, string>,
) {
  return await fetch(
    `${URL_BASE}/${functionName}/${uri}?${new URLSearchParams(queryParams).toString()}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    },
  );
}

export async function newRequest(
  functionName: string,
  payload: unknown,
  queryParams?: Record<string, string>,
) {
  return await request(functionName, "new", "POST", payload, queryParams);
}

export async function getRequest(
  functionName: string,
  queryParams?: Record<string, string>,
) {
  return await request(functionName, "get", "GET", undefined, queryParams);
}

export async function listRequest(
  functionName: string,
  queryParams?: Record<string, string>,
) {
  return await request(functionName, "list", "GET", undefined, queryParams);
}

export async function editRequest(
  functionName: string,
  payload: unknown,
  queryParams?: Record<string, string>,
) {
  return await request(functionName, "edit", "PUT", payload, queryParams);
}

export async function deleteRequest(
  functionName: string,
  queryParams?: Record<string, string>,
) {
  return await request(
    functionName,
    "delete",
    "DELETE",
    undefined,
    queryParams,
  );
}

export async function validateObject<T>(
  object: T,
  expectedObject: Partial<T>,
  fieldsToCheck: (keyof T)[],
) {
  for (const field of fieldsToCheck) {
    expect(object[field]).to.deep.equal(expectedObject[field]);
  }
}

export function getSchemaInstance(schemaName: string) {
  const schema = Schema.get(schemaName);
  if (!schema) throw new Error(`Schema "${schemaName}" not found`);
  return schema.instance();
}

export async function validateObjectList<T extends { _id: string }>(
  objectList: T[],
  expectedObjectList: Partial<T>[],
  fieldsToCheck: (keyof T)[],
) {
  for (const object of objectList) {
    const id = object._id;
    const expectedObject = expectedObjectList.find((item) => item._id === id);
    if (!expectedObject) {
      expect(false).to.equal(true, `Expected object not found for id: ${id}`);
    } else {
      await validateObject(object, expectedObject, fieldsToCheck);
    }
  }
}
