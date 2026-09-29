import { RequestsListClient } from "./RequestsListClient";
import { SUBMISSION_LIST_COLUMNS } from "@/lib/supabase/columns";
import { createClient } from "@/lib/supabase/server";
import type { Submission } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function loadSubmissions(): Promise<Submission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_LIST_COLUMNS)
    .eq("form_type", "request")
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("failed to load request submissions", error);
    return [];
  }
  // `raw` is intentionally omitted — UI never reads it.
  return (data ?? []) as unknown as Submission[];
}

export default async function RequestsLogPage() {
  const submissions = await loadSubmissions();

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Parts requests
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Track and manage parts requests -- mark them complete, add notes, or edit details.
        </p>
      </header>

      <div className="mt-6">
        <RequestsListClient submissions={submissions} />
      </div>
    </div>
  );
}
