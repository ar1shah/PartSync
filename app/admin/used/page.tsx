import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import { loadInventoryParts } from "@/lib/inventory-backend/load-parts";
import { createClient } from "@/lib/supabase/server";
import type { Submission } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function loadSubmissions(): Promise<Submission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("form_type", "used")
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("failed to load used submissions", error);
    return [];
  }
  return data ?? [];
}

export default async function UsedLogPage() {
  const [submissions, inventoryParts] = await Promise.all([
    loadSubmissions(),
    loadInventoryParts(),
  ]);

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Parts used log</h1>
        <p className="mt-1 text-sm text-slate-500">
          This week&apos;s submissions are shown below. SKAPS links resolve against the new inventory
          database; older entries are grouped by month.
        </p>
      </header>

      <div className="mt-6">
        <SubmissionsTable
          submissions={submissions}
          formType="used"
          groupByPeriod
          inventoryParts={inventoryParts}
        />
      </div>
    </div>
  );
}
