import path from "node:path";
import { expect } from "chai";
import ts from "typescript";

const packageRoot = path.resolve(__dirname, "..", "..", "..");
const consumerFile = path.join(packageRoot, "consumer-check", "consumer.ts");

const CONSUMER_SOURCE = `
import { Controller } from "@antelopejs/interface-api";
import { Table } from "@antelopejs/interface-database-decorators";
import { LocalizationModifier } from "@antelopejs/interface-database-decorators/modifiers/localization";
import { DataController, DefaultRoutes, RegisterDataController } from "@antelopejs/interface-data-api";
import { Query, Validation } from "@antelopejs/interface-data-api/components";
import { Access, AccessMode, ModifierKey, type StoredRow } from "@antelopejs/interface-data-api/metadata";

class Article extends Table {
  declare title: string;
}

@RegisterDataController()
export class ArticleAPI extends DataController(Article, DefaultRoutes.All, Controller("/articles")) {
  @ModifierKey(LocalizationModifier)
  declare locale: string;

  @Access(AccessMode.ReadWrite)
  declare title: string;
}

export const read: typeof Query.ReadProperties = Query.ReadProperties;
export const clear: typeof Validation.ClearInternal = Validation.ClearInternal;
export const row: StoredRow = { title: "a" };
export const get: typeof DefaultRoutes.Get extends { func: (...args: never[]) => Promise<StoredRow> | StoredRow } ? true : false = true;
`;

/** The diagnostics of a module that imports this package's built declarations, library declarations checked too. */
function consumerDiagnostics() {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    types: ["node"],
    baseUrl: packageRoot,
    paths: {
      "@antelopejs/interface-data-api": ["dist/index.d.ts"],
      "@antelopejs/interface-data-api/*": ["dist/*.d.ts"],
    },
  };
  const host = ts.createCompilerHost(options);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const isConsumer = (file: string) => path.resolve(file) === consumerFile;
  host.fileExists = (file) => isConsumer(file) || fileExists(file);
  host.readFile = (file) =>
    isConsumer(file) ? CONSUMER_SOURCE : readFile(file);
  host.getSourceFile = (file, languageVersion, onError, shouldCreate) =>
    isConsumer(file)
      ? ts.createSourceFile(file, CONSUMER_SOURCE, languageVersion)
      : getSourceFile(file, languageVersion, onError, shouldCreate);
  const program = ts.createProgram([consumerFile], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `TS${diagnostic.code} ${diagnostic.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
}

describe("Published declarations", () => {
  it("type-check in a consumer module with library checks on", () => {
    expect(consumerDiagnostics()).to.eql([]);
  }).timeout(120_000);
});
