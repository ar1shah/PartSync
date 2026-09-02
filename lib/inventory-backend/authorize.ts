import { createClient } from "@/lib/supabase/server";

/**
 * Inventory service-role operations must always be gated by the existing
 * PartSync authenticated session. The new inventory client bypasses RLS, so
 * server actions cannot rely on the new database to enforce end-user auth.
 */
export async function requirePartSyncUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to perform this inventory action.");
  }

  return user;
}
