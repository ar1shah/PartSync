"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createInventoryServiceClient } from "@/lib/inventory-backend/server";
import { requirePartSyncUser } from "@/lib/inventory-backend/authorize";
import { recordAudit } from "@/lib/audit/log";

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

const NewPartInput = z.object({
  skaps_number: z.string().trim().min(1, "SKAPS number is required").max(80),
  name: z.string().trim().min(1, "Product name is required").max(200),
  description: optionalString(2000),
  category: optionalString(120),
  sub_category: optionalString(120),
  location_on_machine: optionalString(300),
  line_no: optionalString(120),
  zone: optionalString(120),
  location: optionalString(200),
  storage_location: optionalString(500),
  lwhsdesc: optionalString(300),
  size: optionalString(100),
  size_unit: optionalString(40),
});

export interface PartFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

export async function createPart(
  _prev: PartFormState,
  formData: FormData,
): Promise<PartFormState> {
  const parsed = NewPartInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      ),
    };
  }

  const input = parsed.data;
  try {
    await requirePartSyncUser();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" };
  }
  const inventory = createInventoryServiceClient();

  const { data, error } = await inventory.rpc("create_skaps_part", {
    p_skaps_number: input.skaps_number,
    p_product_name: input.name,
    p_product_description: input.description,
    p_main_category: input.category,
    p_subcategory: input.sub_category,
    p_location_on_machine: input.location_on_machine,
    p_line_number: input.line_no,
    p_quantity: 0,
    p_zone: input.zone,
    p_location_code: input.location,
    p_storage_location: input.storage_location,
    p_warehouse_description: input.lwhsdesc,
    p_source_system: "SKAPS_APP",
    p_source_reference: "PARTSYNC_ADMIN",
  });

  if (error) {
    const duplicate = error.message.toLowerCase().includes("already exists");
    return duplicate
      ? { fieldErrors: { skaps_number: "A part with this SKAPS number already exists." } }
      : { error: error.message };
  }

  if (input.size) {
    const numericSize = Number(input.size);
    const { error: specError } = await inventory.rpc("upsert_part_specification", {
      p_skaps_number: input.skaps_number,
      p_specification_key: "size",
      p_specification_name: "Size",
      p_value_numeric: Number.isFinite(numericSize) ? numericSize : undefined,
      p_value_text: Number.isFinite(numericSize) ? undefined : input.size,
      p_unit: input.size_unit,
      p_source_system: "SKAPS_APP",
      p_source_reference: "PARTSYNC_ADMIN",
    });
    if (specError) {
      console.error("Part created but initial size specification failed", specError);
    }
  }

  const created = Array.isArray(data) ? data[0] : null;
  await recordAudit({
    action: "part.created.new_inventory_backend",
    entityType: "part",
    entityId: null,
    entityLabel: `${input.skaps_number} (${input.name})`,
    summary: `Created ${input.skaps_number} in SKAPS Spare Parts Inventory`,
    changes: {
      new_inventory_part_id: created?.part_id ?? null,
      initial_quantity: 0,
      quantity_mode: "TRIAL_ZERO_LOCK",
    },
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Existing Datatex master records are intentionally not editable from the old
 * generic PartSync form. This prevents the app from bypassing the controlled
 * refresh/specification workflows in the new inventory backend.
 */
export async function updatePart(
  _id: string,
  _prev: PartFormState,
  _formData: FormData,
): Promise<PartFormState> {
  return {
    error:
      "Existing master parts are protected. Use the Location Refresh workflow for Zone/Location/LWhsDesc changes, or the specification workflow for technical attributes.",
  };
}

export async function deletePart(_id: string): Promise<never> {
  throw new Error(
    "Imported SKAPS master parts cannot be deleted from PartSync. Deactivate or retire them through the controlled inventory workflow instead.",
  );
}
