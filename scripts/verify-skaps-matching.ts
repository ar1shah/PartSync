/**
 * Parity check for SKAPS link matching after the Used/Requests loader was
 * scoped to the submissions' own SKAPS numbers.
 *
 * Asserts that the scoped loader plus SubmissionsTable's ambiguity handling
 * produce the same links as before: a normalized key that collapses two
 * distinct parts still resolves to NO link, and unambiguous keys still
 * resolve, including separator variants.
 *
 * Usage:
 *   pnpm verify:skaps
 */

import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type Case = {
  /** What a submission's free-text skaps_number might contain. */
  submitted: string;
  /** Expected resolution: the part's skaps_number, or null for no link. */
  expected: string | null;
  why: string;
};

/**
 * The two colliding normalized keys in the catalog, confirmed against the
 * database: CONTACTOR50F and REPAIRKIT051F each cover two distinct parts.
 */
const CASES: Case[] = [
  { submitted: "CONTACTOR_50_F", expected: null, why: "collides with CONTACTOR_50F" },
  { submitted: "CONTACTOR_50F", expected: null, why: "collides with CONTACTOR_50_F" },
  { submitted: "REPAIR_KIT_051_(F)", expected: null, why: "collides with REPAIR_KIT_051_F" },
  { submitted: "REPAIR_KIT_051_F", expected: null, why: "collides with REPAIR_KIT_051_(F)" },
  { submitted: "INSERT_164", expected: "INSERT_164", why: "unambiguous, exact" },
  { submitted: "insert 164", expected: "INSERT_164", why: "unambiguous, separator variant" },
  { submitted: "90_FLEX_01", expected: "90_FLEX_01", why: "unambiguous, exact" },
  { submitted: "NOT_A_REAL_PART_XYZ", expected: null, why: "no such part" },
  { submitted: "", expected: null, why: "empty input" },
];

async function main() {
  const { loadInventoryPartsBySkapsNumbers } = await import(
    "../lib/inventory-backend/load-parts"
  );
  const { normalizeSkapsNumber } = await import("../lib/forms/normalize");

  const started = Date.now();
  const parts = await loadInventoryPartsBySkapsNumbers(CASES.map((c) => c.submitted));
  const elapsed = Date.now() - started;

  // Exactly the map SubmissionsTable builds: a key seen twice is deleted and
  // never re-added, so ambiguous keys resolve to no link.
  const map = new Map<string, { skaps_number: string }>();
  const seen = new Set<string>();
  for (const part of parts) {
    if (!part.skaps_number) continue;
    const key = normalizeSkapsNumber(part.skaps_number);
    if (seen.has(key)) {
      map.delete(key);
      continue;
    }
    seen.add(key);
    map.set(key, part);
  }

  let failures = 0;
  for (const testCase of CASES) {
    const normalized = testCase.submitted ? normalizeSkapsNumber(testCase.submitted) : "";
    const actual = normalized ? (map.get(normalized)?.skaps_number ?? null) : null;
    const ok = actual === testCase.expected;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${JSON.stringify(testCase.submitted).padEnd(22)} ` +
        `expected ${String(testCase.expected).padEnd(12)} got ${String(actual).padEnd(12)} ` +
        `(${testCase.why})`,
    );
  }

  console.log(
    `\n${parts.length} parts fetched for ${CASES.length} submitted values in ${elapsed}ms`,
  );
  console.log(failures === 0 ? "all cases passed" : `${failures} case(s) FAILED`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
