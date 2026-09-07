import type { RequestContext } from "@antelopejs/interface-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import type { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { expect } from "chai";

const meta = {
  filters: { documentType: {}, status: {} },
} as unknown as DataAPIMeta;

function context(
  query: string,
  options?: Parameters.ListParameters,
): RequestContext {
  return {
    url: new URL(`http://localhost/?${query}`),
    dataAPIEntry: { options },
  } as unknown as RequestContext;
}

function extract(ctx: RequestContext) {
  return Parameters.ExtractGeneric<Parameters.ListParameters>(ctx, meta, {
    filters: Parameters.ExtractFilters,
    limit: "int",
    offset: "int",
    sortKey: "string",
  });
}

describe("Mandatory filter options", () => {
  it("combines request filters with mandatory filters, mandatory keys winning", () => {
    const ctx = context("filter_status=ne:paid&filter_documentType=quote", {
      filters: { documentType: ["invoice", "eq"] },
    });
    const expected = {
      documentType: ["invoice", "eq"],
      status: ["paid", "ne"],
    };
    expect(extract(ctx).filters).to.deep.equal(expected);
    expect(Parameters.ExtractFilters(ctx, meta)).to.deep.equal(expected);
  });

  it("keeps request filters with absent, empty or undefined option filters", () => {
    for (const options of [
      undefined,
      {},
      { filters: {} },
      { filters: undefined },
    ]) {
      expect(
        extract(context("filter_status=paid", options)).filters,
      ).to.deep.equal({ status: ["paid", "eq"] });
    }
    expect(extract(context("")).filters).to.deep.equal({});
  });

  it("preserves ordinary option precedence including explicit undefined", () => {
    const result = extract(
      context("limit=9&offset=4&sortKey=status", {
        limit: 2,
        sortKey: undefined,
        pluckMode: "select",
      }),
    );
    expect(result).to.deep.equal({
      filters: {},
      limit: 2,
      offset: 4,
      sortKey: undefined,
      pluckMode: "select",
    });
  });

  it("does not mutate options or leak request filters across requests", () => {
    const options: Parameters.ListParameters = {
      filters: { documentType: ["invoice", "eq"] },
    };
    Object.freeze(options.filters?.documentType);
    Object.freeze(options.filters);
    Object.freeze(options);
    const first = extract(context("filter_status=paid", options));
    const second = extract(context("filter_status=draft", options));
    expect(first.filters?.status).to.deep.equal(["paid", "eq"]);
    expect(second.filters?.status).to.deep.equal(["draft", "eq"]);
    expect(first.filters).not.to.equal(second.filters);
    if (first.filters) first.filters.documentType[0] = "changed";
    expect(second.filters?.documentType).to.deep.equal(["invoice", "eq"]);
    expect(extract(context("", options)).filters).to.deep.equal(
      options.filters,
    );
    expect(options.filters).to.deep.equal({ documentType: ["invoice", "eq"] });
  });
});
