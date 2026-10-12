import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

export default antelopeFmtPreset({
  // Drop once tooling-configs ships the shared ignore (AntelopeJS/tooling-configs#5):
  // these are Markdown templates with a .yml extension, which oxfmt cannot parse.
  // Drop CHANGELOG.md once tooling-configs ships it (AntelopeJS/tooling-configs#13):
  // changelogen writes it unformatted during a release.
  ignorePatterns: [".github/ISSUE_TEMPLATE/**", "CHANGELOG.md"],
});
