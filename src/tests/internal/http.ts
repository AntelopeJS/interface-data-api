/** @internal @packageDocumentation */
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { z } from "zod";
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

/**
 * Schema of what the `list` route answers around a row schema: one page of
 * rows and where it sits. Fields the row schema does not name pass through.
 *
 * @param row Schema of one listed row
 * @returns Schema of one page of rows
 */
export function listResponseSchema<Row extends z.ZodType>(row: Row) {
  return z.looseObject({
    results: z.array(row),
    total: z.number(),
    offset: z.number(),
    limit: z.number(),
  });
}

/** What the `new` route answers: the created row, with its key. */
export const createdRowSchema = z.looseObject({ _id: z.string() });

/**
 * Reads a response body and parses it with the schema the caller expects.
 *
 * @param schema Shape the body must have
 * @param response The response whose body is read
 * @returns The parsed body
 */
export async function readJson<Schema extends z.ZodType>(
  schema: Schema,
  response: Response,
): Promise<z.infer<Schema>> {
  return schema.parse(JSON.parse(await response.text()));
}
