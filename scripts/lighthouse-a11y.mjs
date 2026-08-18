#!/usr/bin/env node
// Lighthouse accessibility audit across ThriveMap's public surfaces.
// Usage: BASE_URL=http://localhost:3111 node scripts/lighthouse-a11y.mjs
// Prints a table of a11y scores (mobile + desktop) plus any failing audits.
// Not wired into CI on purpose — needs a running server + Chrome.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const OUT = process.env.OUT_DIR ?? ".lighthouse";
const PAGES = [
  ["home", "/"],
  ["search", "/clinics?loc=Quezon+City&lat=14.676&lng=121.0437"],
  ["search-list", "/clinics?loc=Quezon+City&lat=14.676&lng=121.0437&view=list"],
  ["clinic", "/clinics/stepping-stones-therapy-suites"],
  ["service", "/services/speech-therapy"],
  ["about", "/about"],
];
const FORMS = ["mobile", "desktop"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const rows = [];
for (const [name, path] of PAGES) {
  for (const form of FORMS) {
    const file = join(OUT, `${name}-${form}.json`);
    const args = [
      `${BASE}${path}`,
      "--only-categories=accessibility",
      "--output=json",
      `--output-path=${file}`,
      "--quiet",
      "--chrome-flags=--headless=new",
    ];
    if (form === "desktop") args.push("--preset=desktop");
    // Default form factor is mobile.
    const bin = process.env.LIGHTHOUSE_BIN;
    if (bin) execFileSync(bin, args, { stdio: "inherit" });
    else
      execFileSync("npx", ["--yes", "lighthouse@12", ...args], {
        stdio: "inherit",
      });
    const lhr = JSON.parse(readFileSync(file, "utf8"));
    const score = Math.round(lhr.categories.accessibility.score * 100);
    const failing = Object.values(lhr.audits)
      .filter(
        (a) =>
          a.score !== null &&
          a.score < 1 &&
          a.scoreDisplayMode !== "informative",
      )
      .map((a) => `${a.id} (${a.details?.items?.length ?? "?"})`);
    rows.push({ page: name, form, score, failing: failing.join(", ") || "—" });
  }
}
console.table(rows);
const min = Math.min(...rows.map((r) => r.score));
console.log(`\nMinimum accessibility score: ${min}`);
process.exit(min >= 95 ? 0 : 1);
