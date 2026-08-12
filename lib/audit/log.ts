import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type AuditEntityType = "submission" | "part" | "part_in_repair" | "profile";

export interface AuditEntry {
  action: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  summary: string;
  changes?: Record<string, unknown> | null;
}

/**
 * Writes one row to the audit log, attributed to the current user. The actor's
 * display name is snapshotted into `actor_label` so the entry stays readable
 * even if the account is later deleted. Any failure is logged and swallowed --
 * auditing must never break the underlying action.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, display_name")
      .eq("id", user.id)
      .maybeSingle();

    const actorLabel =
      profile?.display_name?.trim() ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      user.email ||
      "Unknown";

    const { error } = await supabase.from("audit_log").insert({
      actor_id: user.id,
      actor_label: actorLabel,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      summary: entry.summary,
      changes: (entry.changes as Json | undefined) ?? null,
    });
    if (error) console.error("failed to write audit entry", error);
  } catch (e) {
    console.error("audit logging error", e);
  }
}

/** Shallow diff of changed fields between two records, for the `changes` column. */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before?.[key];
    const to = after[key];
    if (from !== to) changes[key] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}
