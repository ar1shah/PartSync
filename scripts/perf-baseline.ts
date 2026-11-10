/**
 * Loader-level perf baseline for the inventory load path.
 *
 * Calls the real loaders against the real databases with PERF_LOGS on, so the
 * before/after numbers for the perf/inventory-load work are reproducible
 * without needing a signed-in browser session. Page-level numbers still need a
 * real request; run the app with PERF_LOGS=1 and read the server log for those.
 *
 * Usage:
 *   pnpm perf:baseline
 *   pnpm perf:baseline --runs 3
 */

import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
process.env.PERF_LOGS = "1";

const runsArg = process.argv.indexOf("--runs");
const runs = runsArg === -1 ? 1 : Math.max(1, Number(process.argv[runsArg + 1]) || 1);

async function main() {
  // Imported after the env is in place -- the inventory client reads its env
  // lazily, but the perf module reads PERF_LOGS at module scope.
  const { loadInventoryParts } = await import("../lib/inventory-backend/load-parts");
  const { createInventoryServiceClient } = await import("../lib/inventory-backend/server");
  const { timed } = await import("../lib/perf");

  for (let run = 1; run <= runs; run += 1) {
    console.log(`\n--- run ${run} of ${runs} ---`);

    const inventory = createInventoryServiceClient();
    await timed("baseline.partsCount", () =>
      inventory
        .from("parts_app_view")
        .select("part_id", { count: "exact", head: true })
        .eq("active", true),
    );

    const parts = await loadInventoryParts();
    console.log(`[perf] baseline.parts ${parts.length} parts`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
