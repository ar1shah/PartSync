"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { requirePartSyncPermission } from "@/lib/inventory-backend/authorize";
import { refreshInventoryPartsCache } from "@/lib/inventory-backend/refresh";
import { createInventoryServiceClient } from "@/lib/inventory-backend/server";
import type {
  ImportCounts,
  ImportDiffRow,
  ImportUntouchedSummary,
} from "@/lib/inventory/import-types";

type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const text = (max: number) => z.string().trim().max(max).nullable().optional();

const RowSchema = z.object({
  row_number: z.number().int().positive(),
  skaps_number: z.string().trim().min(1).max(120),
  product_name: text(300),
  product_description: text(4000),
  location_on_machine: text(300),
  line_number: text(200),
  quantity: z.number().finite().min(0),
  zone: text(120),
  location_code: text(120),
  storage_location: text(500),
  warehouse_description: text(300),
  main_category: text(120),
  subcategory: text(120),
});

const ChunkSchema = z.array(RowSchema).min(1).max(2000);

const KeysSchema = z
  .array(z.tuple([z.string(), z.string().nullable(), z.string().nullable(), z.string().nullable()]))
  .max(50000);

const CountsSchema = z.object({
  new_parts: z.number().int().min(0),
  new_locations: z.number().int().min(0),
  qty_changes: z.number().int().min(0),
  detail_changes: z.number().int().min(0),
  unchanged: z.number().int().min(0),
  errors: z.number().int().min(0),
});

async function authorize(): Promise<string | null> {
  try {
    await requirePartSyncPermission("inventory.import");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Unauthorized";
  }
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid import payload";
}

async function processChunk(
  rows: unknown,
  apply: false,
): Promise<ActionResult<{ counts: ImportCounts; rows: ImportDiffRow[] }>>;
async function processChunk(
  rows: unknown,
  apply: true,
  batchId: number,
  fileName: string,
): Promise<ActionResult<{ counts: ImportCounts; rows: ImportDiffRow[] }>>;
async function processChunk(
  rows: unknown,
  apply: boolean,
  batchId?: number,
  fileName?: string,
): Promise<ActionResult<{ counts: ImportCounts; rows: ImportDiffRow[] }>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };

  const parsed = ChunkSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { data, error } = await createInventoryServiceClient().rpc("process_inventory_import", {
    p_rows: parsed.data,
    p_apply: apply,
    p_import_batch_id: batchId ?? null,
    p_file_name: fileName ?? null,
  });
  if (error) {
    console.error("process_inventory_import failed", error);
    return { ok: false, error: error.message };
  }

  const result = data as { counts: ImportCounts; rows: ImportDiffRow[] };
  return { ok: true, counts: result.counts, rows: result.rows };
}

/** Read-only: what one chunk of sheet rows would change. */
export async function previewImportChunk(rows: unknown) {
  return processChunk(rows, false);
}

/** Read-only: active parts and bins the sheet leaves alone. */
export async function summarizeUntouched(
  keys: unknown,
): Promise<ActionResult<{ summary: ImportUntouchedSummary }>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };

  const parsed = KeysSchema.safeParse(keys);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const { data, error } = await createInventoryServiceClient().rpc("inventory_import_untouched", {
    p_keys: parsed.data,
  });
  if (error) {
    console.error("inventory_import_untouched failed", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, summary: data as ImportUntouchedSummary };
}

export async function startImport(input: {
  fileName: string;
  sheetName: string;
  totalRows: number;
}): Promise<ActionResult<{ batchId: number }>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };

  const { data, error } = await createInventoryServiceClient()
    .from("import_batches")
    .insert({
      file_name: input.fileName.slice(0, 260) || "excel-import.xlsx",
      sheet_name: input.sheetName.slice(0, 120),
      total_rows: Math.max(0, Math.trunc(input.totalRows)),
      status: "STARTED",
      notes: "Excel import from PartSync (reviewed preview)",
    })
    .select("import_batch_id")
    .single();

  if (error || !data) {
    console.error("failed to start import batch", error);
    return { ok: false, error: error?.message ?? "Could not start the import" };
  }
  return { ok: true, batchId: Number(data.import_batch_id) };
}

/** Writes one chunk. Re-evaluates every row against the live data. */
export async function applyImportChunk(input: {
  batchId: number;
  fileName: string;
  rows: unknown;
}) {
  return processChunk(input.rows, true, input.batchId, input.fileName);
}

export async function finishImport(input: {
  batchId: number;
  fileName: string;
  sheetName: string;
  counts: unknown;
  failedChunks: number;
}): Promise<ActionResult<object>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };

  const counts = CountsSchema.safeParse(input.counts);
  if (!counts.success) return { ok: false, error: firstIssue(counts.error) };
  const c = counts.data;
  const hadProblems = c.errors > 0 || input.failedChunks > 0;

  const { error } = await createInventoryServiceClient()
    .from("import_batches")
    .update({
      status: hadProblems ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      inserted_parts: c.new_parts,
      inventory_rows: c.new_parts + c.new_locations + c.qty_changes,
      flagged_rows: c.errors,
      notes: `Excel import from PartSync (reviewed preview): new_parts=${c.new_parts} new_locations=${c.new_locations} qty_changes=${c.qty_changes} detail_changes=${c.detail_changes} unchanged=${c.unchanged} errors=${c.errors} failed_chunks=${input.failedChunks}`,
    })
    .eq("import_batch_id", input.batchId);
  if (error) console.error("failed to finish import batch", error);

  await recordAudit({
    action: "inventory.excel_imported",
    entityType: "part",
    entityLabel: input.fileName,
    summary: `Imported ${input.fileName} (${input.sheetName}): ${c.new_parts} new parts, ${c.qty_changes} qty changes, ${c.detail_changes} detail changes`,
    changes: { import_batch_id: input.batchId, sheet: input.sheetName, ...c, failed_chunks: input.failedChunks },
  });

  await refreshInventoryPartsCache();
  revalidatePath("/admin/inventory");
  revalidatePath("/inventory");
  return { ok: true };
}
