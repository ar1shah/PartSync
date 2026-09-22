import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import { normalizeSkapsNumber } from "@/lib/forms/normalize";
import { loadPartsForSkaps } from "@/lib/inventory/load-parts";
import { SUBMISSION_LIST_COLUMNS } from "@/lib/supabase/columns";
import { createClient } from "@/lib/supabase/server";
import type { Submission } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function loadSubmissions(): Promise<Submission[]> {
  const supabase = await createClient();
  // Cap at 500 for now so the page stays snappy. A future iteration could
  // paginate or add server-side filtering.
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_LIST_COLUMNS)
    .eq("form_type", "used")
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("failed to load used submissions", error);
    return [];
  }
  // `raw` is intentionally omitted from the select — UI never reads it.
  return (data ?? []) as unknown as Submission[];
}

export default async function UsedLogPage() {
  const submissions = await loadSubmissions();

  const normalizedKeys = submissions
    .map((s) => (s.skaps_number ? normalizeSkapsNumber(s.skaps_number) : ""))
    .filter(Boolean);

  const { parts, inventoryParts } = await loadPartsForSkaps(normalizedKeys);

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Parts used log</h1>
        <p className="mt-1 text-sm text-slate-500">
          This week&apos;s submissions are shown below. Older entries are grouped by month.
        </p>
      </header>

      <div className="mt-6">
        <SubmissionsTable
          submissions={submissions}
          formType="used"
          groupByPeriod
          parts={parts}
          inventoryParts={inventoryParts}
        />
      </div>
    </div>
  );
}
