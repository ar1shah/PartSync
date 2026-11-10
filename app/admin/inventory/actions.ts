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

const ExcelImportRowSchema = z.object({
  skaps_number: z.string().trim().min(1).max(120),
  product_name: z.string().trim().max(300).nullable().optional(),
  product_description: z.string().trim().max(4000).nullable().optional(),
  location_on_machine: z.string().trim().max(300).nullable().optional(),
  line_number: z.string().trim().max(200).nullable().optional(),
  quantity: z.number().finite().min(0),
  zone: z.string().trim().max(120).nullable().optional(),
  location_code: z.string().trim().max(120).nullable().optional(),
  storage_location: z.string().trim().max(500).nullable().optional(),
  warehouse_description: z.string().trim().max(300).nullable().optional(),
  main_category: z.string().trim().max(120).nullable().optional(),
  subcategory: z.string().trim().max(120).nullable().optional(),
});

const ExcelImportInput = z.object({
  fileName: z.string().trim().max(260).optional(),
  dryRun: z.boolean().optional(),
  rows: z.array(ExcelImportRowSchema).min(1).max(20000),
});

export interface InventoryImportCounts {
  updated: number;
  unchanged: number;
  new_locations: number;
  new_parts: number;
  skipped: number;
  import_batch_id: number | null;
  errors: Array<{ row: number; skaps_number: string | null; error: string }>;
}

export type InventoryImportResult =
  | { ok: true; dryRun: boolean; counts: InventoryImportCounts }
  | { ok: false; error: string };

const CHUNK_SIZE = 500;

function emptyCounts(): InventoryImportCounts {
  return {
    updated: 0,
    unchanged: 0,
    new_locations: 0,
    new_parts: 0,
    skipped: 0,
    import_batch_id: null,
    errors: [],
  };
}

function mergeCounts(
  total: InventoryImportCounts,
  chunk: Partial<InventoryImportCounts> & {
    errors?: InventoryImportCounts["errors"];
    import_batch_id?: number | null;
  },
  offset: number,
): void {
  total.updated += Number(chunk.updated ?? 0);
  total.unchanged += Number(chunk.unchanged ?? 0);
  total.new_locations += Number(chunk.new_locations ?? 0);
  total.new_parts += Number(chunk.new_parts ?? 0);
  total.skipped += Number(chunk.skipped ?? 0);
  if (chunk.import_batch_id != null) total.import_batch_id = chunk.import_batch_id;
  for (const err of chunk.errors ?? []) {
    total.errors.push({
      row: Number(err.row) + offset,
      skaps_number: err.skaps_number ?? null,
      error: err.error,
    });
  }
}

/**
 * Preview or apply a FULL-style Excel quantity import against the SKAPS
 * inventory database. Existing locations not present in the file are left alone.
 */
export async function importInventoryExcel(input: {
  fileName?: string;
  dryRun?: boolean;
  rows: unknown[];
}): Promise<InventoryImportResult> {
  const parsed = ExcelImportInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(", ") || "Invalid import payload",
    };
  }

  try {
    await requirePartSyncUser();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unauthorized" };
  }

  const inventory = createInventoryServiceClient();
  const dryRun = parsed.data.dryRun === true;
  const fileName = parsed.data.fileName ?? "excel-import.xlsx";
  const totals = emptyCounts();
  let batchId: number | null = null;

  for (let start = 0; start < parsed.data.rows.length; start += CHUNK_SIZE) {
    const chunk = parsed.data.rows.slice(start, start + CHUNK_SIZE);
    const rpcResult = await inventory.rpc("apply_inventory_quantity_import", {
      p_rows: chunk,
      p_file_name: fileName,
      p_dry_run: dryRun,
      p_import_batch_id: batchId,
    });

    if (rpcResult.error) {
      console.error("inventory excel import chunk failed", rpcResult.error);
      return { ok: false, error: rpcResult.error.message };
    }

    const chunkResult: Partial<InventoryImportCounts> & {
      import_batch_id?: number | null;
      errors?: InventoryImportCounts["errors"];
    } =
      rpcResult.data && typeof rpcResult.data === "object"
        ? (rpcResult.data as Partial<InventoryImportCounts> & {
            import_batch_id?: number | null;
            errors?: InventoryImportCounts["errors"];
          })
        : {};
    mergeCounts(totals, chunkResult, start);
    if (chunkResult.import_batch_id != null) batchId = chunkResult.import_batch_id;
  }

  if (!dryRun) {
    await recordAudit({
      action: "inventory.excel_imported",
      entityType: "part",
      entityLabel: fileName,
      summary: `Imported ${parsed.data.rows.length} inventory location rows from ${fileName}`,
      changes: {
        file_name: fileName,
        row_count: parsed.data.rows.length,
        ...totals,
        errors: totals.errors.slice(0, 50),
      },
    });
    revalidatePath("/admin/inventory");
    revalidatePath("/inventory");
  }

  return { ok: true, dryRun, counts: totals };
}
