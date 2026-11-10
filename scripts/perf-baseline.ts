/**
 * Loader-level perf measurement for the inventory load path.
 *
 * Measures the WORST case: a full cache miss, where all four shards are
 * fetched from the database. In the app these are wrapped in unstable_cache,
 * which cannot run outside a Next request context, so the shard RPCs are
 * called directly here.
 *
 * Usage:
 *   pnpm perf:baseline
 *   pnpm perf:baseline --runs 3
 */

import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
process.env.PERF_LOGS = "1";

const SHARD_SIZE = 2500;
const SHARD_COUNT = 4;

const runsArg = process.argv.indexOf("--runs");
const runs = runsArg === -1 ? 1 : Math.max(1, Number(process.argv[runsArg + 1]) || 1);

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} kB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const { createInventoryServiceClient } = await import("../lib/inventory-backend/server");
  const { timed } = await import("../lib/perf");

  for (let run = 1; run <= runs; run += 1) {
    console.log(`\n--- run ${run} of ${runs} ---`);
    const client = createInventoryServiceClient();

    await timed("partsCount (parts_list_mv)", () =>
      client.from("parts_list_mv").select("part_id", { count: "exact", head: true }),
    );

    const started = performance.now();
    const shards = await Promise.all(
      Array.from({ length: SHARD_COUNT }, (_, index) =>
        timed(`shard ${index}`, () =>
          client.rpc("inventory_parts_list", {
            p_offset: index * SHARD_SIZE,
            p_limit: index === SHARD_COUNT - 1 ? null : SHARD_SIZE,
          }),
        ),
      ),
    );
    const elapsed = performance.now() - started;

    const tuples = shards.flatMap((shard) => (shard.data ?? []) as unknown[]);
    const bytes = Buffer.byteLength(JSON.stringify(tuples), "utf8");
    const shardBytes = shards.map((shard) =>
      formatBytes(Buffer.byteLength(JSON.stringify(shard.data ?? []), "utf8")),
    );

    console.log(
      `[perf] full cache miss ${elapsed.toFixed(1)}ms  ${tuples.length} parts  ` +
        `${formatBytes(bytes)} total  shards: ${shardBytes.join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
