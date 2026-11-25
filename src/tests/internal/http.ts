/** @internal @packageDocumentation */
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { z } from "zod";
import { isObject } from "../../internal/guards";
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

/** Anything that turns a raw body into a typed value, such as a zod schema. */
export interface BodyParser<Value> {
  parse(data: ReturnType<typeof JSON.parse>): Value;
}

/** One page of rows and where it sits. */
export interface ListPage<Row> {
  results: Row[];
  total: number;
  offset: number;
  limit: number;
}

const listPageSchema = z.looseObject({
  results: z.array(z.unknown()),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
});

/**
 * Parser of what the `list` route answers around a row parser: one page of
 * rows and where it sits.
 *
 * @param row Parser of one listed row
 * @returns Parser of one page of rows
 */
export function listResponseSchema<Row>(
  row: BodyParser<Row>,
): BodyParser<ListPage<Row>> {
  return {
    parse(data) {
      const page = listPageSchema.parse(data);
      return {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        results: page.results.map((item) => row.parse(item)),
      };
    },
  };
}

/** What the `new` route answers: the created row, with its key. */
export const createdRowSchema: BodyParser<{ _id: string }> = z.looseObject({
  _id: z.string(),
});

/**
 * Reads a response body and parses it with the parser the caller expects.
 *
 * @param schema Shape the body must have
 * @param response The response whose body is read
 * @returns The parsed body
 */
export async function readJson<Value>(
  schema: BodyParser<Value>,
  response: Response,
): Promise<Value> {
  return schema.parse(JSON.parse(await response.text()));
}

/** A thrown route refusal, from any copy of the api interface. */
export interface Refusal {
  getStatus(): number;
}

/**
 * Whether a caught value is a route refusal.
 *
 * @param error The caught value
 * @returns True when it carries a numeric status
 */
export function isRefusal(error: unknown): error is Refusal {
  if (!isObject(error) || !("getStatus" in error)) return false;
  const { getStatus } = error;
  return (
    typeof getStatus === "function" && typeof getStatus.call(error) === "number"
  );
}

/**
 * The status of a thrown route refusal.
 *
 * @param error The caught value
 * @returns The refusal's HTTP status, or undefined for any other value
 */
export function httpStatusOf(error: unknown): number | undefined {
  return isRefusal(error) ? error.getStatus() : undefined;
}
