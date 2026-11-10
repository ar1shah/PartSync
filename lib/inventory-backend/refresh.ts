import { revalidateTag } from "next/cache";
import { timed } from "@/lib/perf";
import { INVENTORY_PARTS_TAG } from "./load-parts";
import { createInventoryServiceClient } from "./server";

/**
 * Call after any write that changes parts, locations, QR/RFID, images or
 * specs, so the catalog list reflects it immediately rather than waiting out
 * the 5-minute cache backstop.
 *
 * Order matters: rebuild parts_list_mv first, *then* drop the cached list.
 * Revalidating first would let the next render repopulate the cache from a
 * stale materialized view.
 *
 * The refresh measures ~595ms and takes an ACCESS EXCLUSIVE lock on the MV
 * for that time. That is deliberate — writes here are rare admin actions,
 * reads are served from cache, and `CONCURRENTLY` is not an option because it
 * cannot run inside a transaction block and PostgREST wraps every rpc() call
 * in one.
 */
export async function refreshInventoryPartsCache(): Promise<void> {
  const client = createInventoryServiceClient();

  const { error } = await timed("refreshInventoryPartsCache", () =>
    client.rpc("refresh_parts_list_mv"),
  );

  if (error) {
    // Don't fail the write the user just made. The 5-minute backstop will
    // pick the change up even if this refresh failed.
    console.error("failed to refresh parts_list_mv", error);
  }

  revalidateTag(INVENTORY_PARTS_TAG);
}
