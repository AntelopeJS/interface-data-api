import { expect } from "chai";
import type { RequestContext } from "@antelopejs/interface-api";
import { Parameters } from "../../components";
import { DataAPIMeta } from "../../metadata";

import { createRequestContext } from "../internal/http";

const meta = new DataAPIMeta(Object).setFilter("title", () => true);

function context(query: string): RequestContext {
  return Object.assign(createRequestContext(`http://localhost/?${query}`), {
    dataAPIEntry: { options: undefined },
  });
}

describe("Parameters.ExtractFilters - comparisons", () => {
  for (const comparison of ["eq", "ne", "gt", "ge", "lt", "le"]) {
    it(`reads the ${comparison} comparison`, () => {
      expect(
        Parameters.ExtractFilters(
          context(`filter_title=${comparison}:a:b`),
          meta,
        ),
      ).to.eql({ title: ["a:b", comparison] });
    });
  }

  it("reads a value without comparison as eq", () => {
    expect(Parameters.ExtractFilters(context("filter_title=abc"), meta)).to.eql(
      { title: ["abc", "eq"] },
    );
  });

  it("keeps a colon of the value after an explicit eq", () => {
    expect(
      Parameters.ExtractFilters(
        context("filter_title=eq:http://example.com"),
        meta,
      ),
    ).to.eql({ title: ["http://example.com", "eq"] });
  });

  it("hands a comparison the default filter lacks to a custom filter", () => {
    for (const comparison of ["is", "like", "include", "http"]) {
      expect(
        Parameters.ExtractFilters(
          context(`filter_title=${comparison}:abc`),
          meta,
        ),
        comparison,
      ).to.eql({ title: ["abc", comparison] });
    }
  });

  it("hands an unnamed value that contains a colon to a custom filter", () => {
    expect(
      Parameters.ExtractFilters(
        context("filter_title=http://example.com"),
        meta,
      ),
    ).to.eql({ title: ["//example.com", "http"] });
  });
});
