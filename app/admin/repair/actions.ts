"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

async function repairLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<string> {
  const { data } = await supabase
    .from("parts_in_repair")
    .select("part_name, skaps_number")
    .eq("id", id)
    .maybeSingle();
  if (data?.skaps_number && data?.part_name) return `${data.skaps_number} (${data.part_name})`;
  return data?.part_name ?? data?.skaps_number ?? "repair item";
}

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

const optionalDate = z
  .string()
  .trim()
  .transform((s) => (s.length === 0 ? null : new Date(s).toISOString()))
  .nullable()
  .optional();

const RepairItemInput = z.object({
  part_name: z.string().trim().min(1, "Part name is required").max(200),
  skaps_number: optionalString(80),
  quantity: z.coerce.number().positive({ message: "Quantity must be greater than zero" }),
  sent_at: z
    .string()
    .trim()
    .transform((s) => (s.length === 0 ? new Date().toISOString() : new Date(s).toISOString())),
  repair_vendor: optionalString(200),
  expected_return_at: optionalDate,
  line: optionalString(80),
  machine_area: optionalString(80),
  repair_reason: optionalString(500),
  po_reference: optionalString(80),
  notes: optionalString(2000),
});

export interface RepairFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

function revalidateRepairPaths() {
  revalidatePath("/admin/repair");
  revalidatePath("/admin");
}

export async function createRepairItem(
  _prev: RepairFormState,
  formData: FormData,
): Promise<RepairFormState> {
  const parsed = RepairItemInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      ),
    };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("parts_in_repair")
    .insert(parsed.data)
    .select("id")
    .maybeSingle();
  if (error) {
    return { error: error.message };
  }

  const label = parsed.data.skaps_number
    ? `${parsed.data.skaps_number} (${parsed.data.part_name})`
    : parsed.data.part_name;
  await recordAudit({
    action: "repair.created",
    entityType: "part_in_repair",
    entityId: inserted?.id ?? null,
    entityLabel: label,
    summary: `Sent ${label} out for repair`,
  });

  revalidateRepairPaths();
  return { ok: true };
}

export async function updateRepairItem(
  id: string,
  _prev: RepairFormState,
  formData: FormData,
): Promise<RepairFormState> {
  const parsed = RepairItemInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      ),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_in_repair")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }

  const label = parsed.data.skaps_number
    ? `${parsed.data.skaps_number} (${parsed.data.part_name})`
    : parsed.data.part_name;
  await recordAudit({
    action: "repair.updated",
    entityType: "part_in_repair",
    entityId: id,
    entityLabel: label,
    summary: `Updated repair item ${label}`,
    changes: parsed.data,
  });

  revalidateRepairPaths();
  return { ok: true };
}

export async function markAsReturned(id: string): Promise<void> {
  const supabase = await createClient();
  const label = await repairLabel(supabase, id);
  const { error } = await supabase
    .from("parts_in_repair")
    .update({ status: "returned", returned_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  await recordAudit({
    action: "repair.marked_returned",
    entityType: "part_in_repair",
    entityId: id,
    entityLabel: label,
    summary: `Marked ${label} as returned from repair`,
  });
  revalidateRepairPaths();
}

export async function deleteRepairItem(id: string): Promise<void> {
  const supabase = await createClient();
  const label = await repairLabel(supabase, id);
  const { error } = await supabase.from("parts_in_repair").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  await recordAudit({
    action: "repair.deleted",
    entityType: "part_in_repair",
    entityId: id,
    entityLabel: label,
    summary: `Deleted repair item ${label}`,
  });
  revalidateRepairPaths();
}
