// Server-only environment values for the new SKAPS inventory backend.
//
// IMPORTANT: the existing NEXT_PUBLIC_SUPABASE_* variables continue to point
// at the legacy PartSync project because that project still owns Auth,
// submissions, notifications, repairs, preferences, and audit history.

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Configure it locally or in Vercel before enabling the new inventory backend.`,
    );
  }
  return value;
}

export const inventoryEnv = {
  get supabaseUrl() {
    return required(
      "SKAPS_INVENTORY_SUPABASE_URL",
      process.env.SKAPS_INVENTORY_SUPABASE_URL,
    );
  },
  get supabaseServiceRoleKey() {
    return required(
      "SKAPS_INVENTORY_SUPABASE_SERVICE_ROLE_KEY",
      process.env.SKAPS_INVENTORY_SUPABASE_SERVICE_ROLE_KEY,
    );
  },
};
