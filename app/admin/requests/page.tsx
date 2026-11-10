import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import { loadInventoryParts } from "@/lib/inventory-backend/load-parts";
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
  const [submissions, inventoryParts] = await Promise.all([
    loadSubmissions(),
    loadInventoryParts(),
  ]);

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Parts requests
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          View-only log of parts requests. Status comes from Google Sheet highlight
          colors (column H). SKAPS numbers link to inventory when recognized.
        </p>
      </header>

      <div className="mt-6">
        <SubmissionsTable
          submissions={submissions}
          formType="request"
          groupByPeriod
          inventoryParts={inventoryParts}
        />
      </div>
    </div>
  );
}
