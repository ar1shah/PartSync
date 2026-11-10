/**
 * Role -> capability map. Safe to import from client components (no server
 * code here). The server-side checks live in lib/auth/roles.ts and the
 * database enforces the same rules through RLS (see
 * supabase/migrations/0021_user_roles.sql) -- keep all three in step.
 */

export type AppRole = "admin" | "staff";

const PERMISSIONS = {
  /** Activity log page + "Recent activity" dashboard widget. */
  "audit.view": ["admin"],
  /** Invite new staff accounts from Settings. Admins can never be invited. */
  "staff.invite": ["admin"],
  /** Create a new SKAPS master part. */
  "inventory.create": ["admin"],
  /** Bulk Excel quantity import. */
  "inventory.import": ["admin"],
  /** Permanently delete a parts-in-repair entry. */
  "repair.delete": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}

export function toAppRole(value: unknown): AppRole {
  // Anything unexpected (missing row, typo) falls back to the LEAST privileged role.
  return value === "admin" ? "admin" : "staff";
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  staff: "Staff",
};
