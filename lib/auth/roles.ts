import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { can, toAppRole, type AppRole, type Permission } from "./permissions";

/**
 * Server-only role helpers. Roles live in `public.user_roles` on the AUTH
 * project (skaps-inventory). The inventory project has no users, so any
 * inventory write must be gated here before the service-role client is used.
 */

export const getRole = cache(async (userId: string): Promise<AppRole> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("failed to load user role", error);
  }
  return toAppRole(data?.role);
});

/** The signed-in user's role, or null when signed out. */
export async function getCurrentRole(): Promise<AppRole | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return getRole(user.id);
}

/**
 * For server actions: throws unless the signed-in user has `permission`.
 * Resolves the user fresh (not via React cache) so it is safe outside render.
 */
export async function requirePermission(
  permission: Permission,
): Promise<{ user: User; role: AppRole }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("You must be signed in to do that.");
  }

  const role = await getRole(user.id);
  if (!can(role, permission)) {
    throw new Error("Only admins can do that.");
  }
  return { user, role };
}

/** For pages: redirects to /login when signed out, 404s when not permitted. */
export async function requirePagePermission(permission: Permission): Promise<AppRole> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = await getRole(user.id);
  if (!can(role, permission)) notFound();
  return role;
}
