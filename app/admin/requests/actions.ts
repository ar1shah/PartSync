"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

/** Short label for a request row, e.g. "BELT-12 (Drive belt)". */
async function requestLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<string> {
  const { data } = await supabase
    .from("submissions")
    .select("skaps_number, part_description")
    .eq("id", id)
    .maybeSingle();
  const skaps = data?.skaps_number;
  const desc = data?.part_description;
  if (skaps && desc) return `${skaps} (${desc})`;
  return skaps ?? desc ?? "request";
}

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

const RequestSubmissionInput = z.object({
  employee_name: optionalString(200),
  skaps_number: optionalString(80),
  part_description: optionalString(500),
  quantity: z.coerce.number().nonnegative({ message: "Quantity can't be negative" }).nullable().optional(),
  line: optionalString(80),
  machine_area: optionalString(80),
  urgency: optionalString(80),
  notes: optionalString(2000),
  status: z.enum(["open", "ordered", "closed"]),
});

export interface RequestFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

function revalidateRequestPaths() {
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
}

export async function updateRequestSubmission(
  id: string,
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const parsed = RequestSubmissionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      ),
    };
  }

  const supabase = await createClient();
  const label = await requestLabel(supabase, id);
  const { error } = await supabase
    .from("submissions")
    .update(parsed.data)
    .eq("id", id)
    .eq("form_type", "request");
  if (error) {
    return { error: error.message };
  }

  await recordAudit({
    action: "request.updated",
    entityType: "submission",
    entityId: id,
    entityLabel: label,
    summary: `Edited request for ${label}`,
    changes: parsed.data,
  });

  revalidateRequestPaths();
  return { ok: true };
}

export async function markRequestOrdered(id: string): Promise<void> {
  const supabase = await createClient();
  const label = await requestLabel(supabase, id);
  const { error } = await supabase
    .from("submissions")
    .update({ status: "ordered" })
    .eq("id", id)
    .eq("form_type", "request");
  if (error) {
    throw new Error(error.message);
  }
  await recordAudit({
    action: "request.marked_ordered",
    entityType: "submission",
    entityId: id,
    entityLabel: label,
    summary: `Marked request for ${label} as ordered`,
  });
  revalidateRequestPaths();
}

export async function markRequestComplete(id: string): Promise<void> {
  const supabase = await createClient();
  const label = await requestLabel(supabase, id);
  const { error } = await supabase
    .from("submissions")
    .update({ status: "closed" })
    .eq("id", id)
    .eq("form_type", "request");
  if (error) {
    throw new Error(error.message);
  }
  await recordAudit({
    action: "request.marked_complete",
    entityType: "submission",
    entityId: id,
    entityLabel: label,
    summary: `Marked request for ${label} as complete`,
  });
  revalidateRequestPaths();
}

export async function markRequestRequested(id: string): Promise<void> {
  const supabase = await createClient();
  const label = await requestLabel(supabase, id);
  const { error } = await supabase
    .from("submissions")
    .update({ status: "open" })
    .eq("id", id)
    .eq("form_type", "request");
  if (error) {
    throw new Error(error.message);
  }
  await recordAudit({
    action: "request.marked_requested",
    entityType: "submission",
    entityId: id,
    entityLabel: label,
    summary: `Marked request for ${label} as requested again`,
  });
  revalidateRequestPaths();
}

export async function deleteRequestSubmission(id: string): Promise<void> {
  const supabase = await createClient();
  const label = await requestLabel(supabase, id);
  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", id)
    .eq("form_type", "request");
  if (error) {
    throw new Error(error.message);
  }
  await recordAudit({
    action: "request.deleted",
    entityType: "submission",
    entityId: id,
    entityLabel: label,
    summary: `Deleted request for ${label}`,
  });
  revalidateRequestPaths();
}
