import { expect } from "chai";
import { HTTPResult } from "@antelopejs/interface-api";
import { Parameters, Query } from "../../components";
import { DataAPIMeta } from "../../metadata";

import { createRequestContext } from "../internal/http";

const meta = new DataAPIMeta(Object);

function requestOf(query: string) {
  return createRequestContext(`http://localhost/?${query}`);
}

describe("Parameters.ExtractGeneric", () => {
  it("skips an extractor of undefined like an absent key", () => {
    const params = Parameters.ExtractGeneric<{ a?: number }>(
      requestOf("a=1"),
      meta,
      { a: undefined },
    );
    expect(params).to.deep.equal({});
  });

  it("converts each field with its extractor, leaving out what the request omits", () => {
    const params = Parameters.ExtractGeneric<{
      count?: number;
      ratio?: number;
      active?: boolean;
      name?: string;
      tags?: string[];
      absent?: number;
    }>(requestOf("count=3.9&ratio=0.5&active=0&name=x&tags=a&tags=b"), meta, {
      count: Parameters.FromSearch.int,
      ratio: Parameters.FromSearch.number,
      active: Parameters.FromSearch.bool,
      name: Parameters.FromSearch.string,
      tags: Parameters.FromSearch.strings,
      absent: Parameters.FromSearch.int,
    });
    expect(params).to.deep.equal({
      count: 3,
      ratio: 0.5,
      active: false,
      name: "x",
      tags: ["a", "b"],
    });
  });

  it("answers an empty list for a multi-value field the request omits", () => {
    const params = Parameters.ExtractGeneric<{ ids?: number[] }>(
      requestOf(""),
      meta,
      { ids: Parameters.FromSearch.ints },
    );
    expect(params).to.deep.equal({ ids: [] });
  });

  it("keeps a field the route's options set over the request's value", () => {
    const ctx = Object.assign(requestOf("limit=5"), {
      dataAPIEntry: {
        options: { limit: 9 },
        callback: { args: [], method: "get", func: () => undefined },
      },
    });
    const params = Parameters.ExtractGeneric<{ limit?: number }>(ctx, meta, {
      limit: Parameters.FromSearch.int,
    });
    expect(params.limit).to.equal(9);
  });
});

describe("Query.GetModel", () => {
  it("answers 500 for a controller whose model field holds no model", () => {
    const keyed = new DataAPIMeta(Object).setModelKey("model");
    let status: number | undefined;
    try {
      Query.GetModel({}, keyed);
    } catch (error) {
      status = error instanceof HTTPResult ? error.getStatus() : undefined;
    }
    expect(status).to.equal(500);
  });
});
