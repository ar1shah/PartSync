import { createClient } from "@supabase/supabase-js";
import { inventoryEnv } from "./env";

/**
 * Server-only client for the new SKAPS Spare Parts Inventory project.
 *
 * The project intentionally has RLS enabled with no browser policies, so all
 * current app access goes through trusted Next.js server code. Never import
 * this client from a `use client` module and never expose the service key.
 */
export function createInventoryServiceClient() {
  return createClient(
    inventoryEnv.supabaseUrl,
    inventoryEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
