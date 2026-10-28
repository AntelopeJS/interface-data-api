/** @internal @packageDocumentation */
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";

/**
 * Builds the context a route handler receives for a request that never
 * reached a socket.
 *
 * @param url Address of the request
 * @returns A complete request context
 */
export function createRequestContext(
  url = "http://localhost/",
): RequestContext {
  const rawRequest = new IncomingMessage(new Socket());
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL(url),
    routeParameters: {},
    response: new HTTPResult(),
  };
}

/** What the `list` route answers: one page of rows and where it sits. */
export interface ListResponse<Row> {
  results: Row[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Reads a response body as the JSON shape the caller expects.
 *
 * @param response The response whose body is read
 * @returns The parsed body
 */
export async function readJson<T>(response: Response): Promise<T> {
  return JSON.parse(await response.text());
}
