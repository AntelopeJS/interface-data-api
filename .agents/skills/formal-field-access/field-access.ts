import { build } from "./build.ts";
import { type Case, casesOf, CONFIGURATIONS, type Configuration, type Mode, opCount, printCase } from "./cases.ts";
import { checkCase, type Rule, RULES } from "./rules.ts";

/** A recorded finding: how many cases break the rule, and the shortest of them as {@link printCase} writes it. */
interface Recorded {
  cases: number;
  shortest: string;
}

type Record_ = Partial<Record<Rule, Recorded>>;

/** The findings of each configuration under each mode's bounds. */
const FINDINGS: Record<Mode, Record<Configuration, Record_>> = {
  ci: {
    single: {
      ReadComplete: { cases: 24, shortest: "C { @Listable() @Computed(expr) get a() / set a(v) }" },
      ComputedReadOnly: { cases: 492, shortest: "C { @Access(AccessMode.WriteOnly) @Computed(expr) declare a }" },
    },
    pair: {
      ComputedReadOnly: { cases: 200, shortest: "C { @Access(AccessMode.WriteOnly) @Computed(expr) declare a; set b(v) }" },
    },
    derived: {
      ReadNoLeak: {
        cases: 244,
        shortest: "P { @Computed(expr) declare a } A extends P { declare a } B extends P { @Listable() declare a }",
      },
      ReadComplete: {
        cases: 202,
        shortest: "P { @Computed(expr) declare a } A extends P { @Access(AccessMode.WriteOnly) declare a } B extends P { declare a }",
      },
      WriteGated: {
        cases: 100,
        shortest: "P { @Listable() declare a } A extends P { @Access(AccessMode.WriteOnly) declare a } B extends P { declare a }",
      },
      WriteComplete: {
        cases: 184,
        shortest: "P { @Access(AccessMode.WriteOnly) declare a } A extends P { @Computed(expr) declare a } B extends P { declare a }",
      },
      ComputedReadOnly: {
        cases: 60,
        shortest: "P { @Computed(expr) declare a } A extends P { @Access(AccessMode.WriteOnly) declare a } B extends P { declare a }",
      },
      ListPluck: {
        cases: 16,
        shortest: 'P { @Listable() declare a } A extends P { @Joined({ table, localKey: "k", remoteField }) declare a } B extends P { @Listable() declare a }',
      },
    },
  },
  full: {
    single: {
      ReadComplete: { cases: 32, shortest: "C { @Listable() @Computed(expr) get a() }" },
      ComputedReadOnly: { cases: 4338, shortest: "C { @Access(AccessMode.WriteOnly) @Computed(expr) get a() }" },
    },
    pair: {
      ComputedReadOnly: {
        cases: 3440,
        shortest: "C { declare a; @Access(AccessMode.WriteOnly) @Computed(expr) set b(v) }",
      },
    },
    derived: {
      ReadNoLeak: {
        cases: 2840,
        shortest: "P { @Computed(expr) declare a } A extends P { declare a } B extends P { @Listable() declare a }",
      },
      ReadComplete: {
        cases: 2146,
        shortest: "P { @Computed(expr) declare a } A extends P { @Access(AccessMode.WriteOnly) declare a } B extends P { declare a }",
      },
      WriteGated: {
        cases: 1240,
        shortest: "P { @Listable() declare a } A extends P { @Access(AccessMode.WriteOnly) declare a } B extends P { declare a }",
      },
      WriteComplete: {
        cases: 1958,
        shortest: "P { @Access(AccessMode.WriteOnly) declare a } A extends P { @Computed(expr) declare a } B extends P { declare a }",
      },
      ComputedReadOnly: {
        cases: 1164,
        shortest: "P { declare a } A extends P { @Access(AccessMode.WriteOnly) @Computed(expr) declare a } B extends P { declare a }",
      },
      ListPluck: {
        cases: 288,
        shortest: 'P { @Listable() declare a } A extends P { @Joined({ table, localKey: "k", remoteField }) declare a } B extends P { @Listable() declare a }',
      },
    },
  },
};

const EXIT = { ok: 0, changed: 1, tool: 2 };

/** What one rule's failing cases look like in one configuration. */
interface Broken {
  cases: Set<string>;
  shortest: Case;
  detail: string;
}

function shorter(candidate: Case, current: Case): boolean {
  const byOps = opCount(candidate) - opCount(current);
  if (byOps !== 0) return byOps < 0;
  return printCase(candidate).length < printCase(current).length;
}

async function brokenRules(cases: Case[], show: boolean): Promise<Map<Rule, Broken>> {
  const broken = new Map<Rule, Broken>();
  for (const testCase of cases) {
    const { classes, log } = build(testCase);
    const violations = await checkCase(testCase, classes, log);
    if (violations.length === 0) continue;
    const printed = printCase(testCase);
    if (show) console.log(`  ${printed}\n${violations.map((violation) => `    ${violation.rule}: ${violation.detail}`).join("\n")}`);
    for (const violation of violations) {
      const entry = broken.get(violation.rule);
      if (!entry) {
        broken.set(violation.rule, { cases: new Set([printed]), shortest: testCase, detail: violation.detail });
      } else {
        entry.cases.add(printed);
        if (shorter(testCase, entry.shortest)) {
          entry.shortest = testCase;
          entry.detail = violation.detail;
        }
      }
    }
  }
  return broken;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** Prints one configuration's result against its record; true when a rule changed. */
function report(configuration: Configuration, broken: Map<Rule, Broken>, recorded: Record_, total: number): boolean {
  let changed = false;
  const holding: Rule[] = [];
  for (const rule of RULES) {
    const now = broken.get(rule);
    const record = Object.hasOwn(recorded, rule) ? recorded[rule] : undefined;
    if (!now && !record) {
      holding.push(rule);
      continue;
    }
    if (now && !record) {
      console.log(`BROKEN ${rule}: ${count(now.cases.size)} cases, shortest ${printCase(now.shortest)} (${configuration})\n  ${now.detail}`);
      changed = true;
    } else if (!now && record) {
      console.log(`HOLDS ${rule}: no case breaks it (recorded ${count(record.cases)}, ${configuration})`);
      changed = true;
    } else if (now && record) {
      const shortest = printCase(now.shortest);
      if (now.cases.size !== record.cases || shortest !== record.shortest) {
        console.log(`CHANGED ${rule}: ${count(now.cases.size)} cases (recorded ${count(record.cases)}), shortest ${shortest} (${configuration})\n  ${now.detail}`);
        changed = true;
      } else {
        console.log(`finding ${rule}: ${count(now.cases.size)} cases, shortest ${shortest} (${configuration})`);
      }
    }
  }
  if (holding.length > 0) console.log(`holds ${holding.join(", ")} (${count(total)} cases, ${configuration})`);
  return changed;
}

async function main(args: string[]): Promise<number> {
  if (args.some((arg) => arg !== "--full" && arg !== "--show")) {
    console.error("usage: node check.mjs [--full] [--show]");
    return EXIT.tool;
  }
  const mode: Mode = args.includes("--full") ? "full" : "ci";
  const show = args.includes("--show");
  let changed = false;
  for (const configuration of CONFIGURATIONS) {
    const cases = casesOf(configuration, mode);
    const broken = await brokenRules(cases, show);
    if (report(configuration, broken, FINDINGS[mode][configuration], cases.length)) changed = true;
  }
  return changed ? EXIT.changed : EXIT.ok;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error);
  process.exitCode = EXIT.tool;
}
