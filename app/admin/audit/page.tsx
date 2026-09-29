import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AuditLogClient } from "./AuditLogClient";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const supabase = await createClient();

  const [{ data: entries, error }, { data: profiles }] = await Promise.all([
    supabase
      .from("audit_log")
      .select(
        "id, created_at, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, changes",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("profiles").select("id, avatar_url, display_name, first_name, last_name"),
  ]);

  if (error) {
    console.error("failed to load audit log", error);
  }

  // actor_id -> avatar url, so we can show the current profile picture next to
  // the (snapshotted) actor label.
  const avatarByActor: Record<string, string | null> = {};
  for (const p of profiles ?? []) {
    avatarByActor[p.id] = p.avatar_url ?? null;
  }

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <ScrollText className="h-5 w-5 text-blue-700" />
          Activity log
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A record of admin actions -- who changed what, and when.
        </p>
      </header>

      <div className="mt-6">
        <AuditLogClient entries={entries ?? []} avatarByActor={avatarByActor} />
      </div>
    </div>
  );
}
