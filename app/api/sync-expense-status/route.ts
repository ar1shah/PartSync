/**
 * POST /api/sync-expense-status
 *
 * Receives row-color updates from the Google Apps Script color-sync job
 * (docs/apps-script/ColorSync.gs) and stores them on the matching
 * `submissions` row.
 *
 * Column G (Parts Used) maps to expense_status:
 *   { "rowId": "sheet-0-row-482", "expenseStatus": "expensed" }
 *
 * Column H (Parts Request) maps to request_status:
 *   { "rowId": "sheet-0-row-482", "requestStatus": "ordered" }
 *
 * The script may send both fields; we only write the field that matches the
 * row's form_type. `expenseStatus` / `requestStatus` may be null when the
 * corresponding cell is uncolored (request blank => "pending").
 *
 * Auth is the same shared-secret header as /api/ingest.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const EXPENSE_STATUSES = [
  "expensed",
  "not_expensed",
  "check_inventory",
  "datatex_zero",
  "testing",
] as const;
type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const REQUEST_STATUSES = [
  "pending",
  "under_review",
  "not_ordered",
  "ordered",
] as const;
type RequestStatus = (typeof REQUEST_STATUSES)[number];

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const providedSecret = request.headers.get("x-skaps-secret") ?? "";
  let expectedSecret: string;
  try {
    expectedSecret = env.ingestSecret;
  } catch (e) {
    console.error("INGEST_SECRET is not set", e);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!safeCompare(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "expected an object" }, { status: 400 });
  }

  const payload = body as {
    rowId?: unknown;
    expenseStatus?: unknown;
    requestStatus?: unknown;
  };

  if (typeof payload.rowId !== "string" || !payload.rowId) {
    return NextResponse.json({ error: "expected a non-empty rowId string" }, { status: 400 });
  }

  let expenseStatus: ExpenseStatus | null | undefined = undefined;
  if (payload.expenseStatus !== undefined) {
    if (payload.expenseStatus === null) {
      expenseStatus = null;
    } else if (EXPENSE_STATUSES.includes(payload.expenseStatus as ExpenseStatus)) {
      expenseStatus = payload.expenseStatus as ExpenseStatus;
    } else {
      return NextResponse.json(
        { error: `expenseStatus must be one of ${EXPENSE_STATUSES.join(", ")} or null` },
        { status: 400 },
      );
    }
  }

  let requestStatus: RequestStatus | undefined = undefined;
  if (payload.requestStatus !== undefined) {
    if (payload.requestStatus === null) {
      requestStatus = "pending";
    } else if (REQUEST_STATUSES.includes(payload.requestStatus as RequestStatus)) {
      requestStatus = payload.requestStatus as RequestStatus;
    } else {
      return NextResponse.json(
        { error: `requestStatus must be one of ${REQUEST_STATUSES.join(", ")} or null` },
        { status: 400 },
      );
    }
  }

  if (expenseStatus === undefined && requestStatus === undefined) {
    return NextResponse.json(
      { error: "expected expenseStatus and/or requestStatus" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data: existing, error: lookupError } = await supabase
    .from("submissions")
    .select("id, form_type")
    .eq("external_row_id", payload.rowId)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to look up submission for color sync", lookupError, payload);
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no matching submission" });
  }

  const updates: { expense_status?: ExpenseStatus | null; request_status?: RequestStatus } = {};
  if (existing.form_type === "used" && expenseStatus !== undefined) {
    updates.expense_status = expenseStatus;
  }
  if (existing.form_type === "request" && requestStatus !== undefined) {
    updates.request_status = requestStatus;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no applicable status field for form_type",
      form_type: existing.form_type,
    });
  }

  const { data, error } = await supabase
    .from("submissions")
    .update(updates)
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to update color-driven status", error, payload);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? existing.id, updates });
}

export async function GET() {
  return NextResponse.json({
    service: "skaps-inventory sync-expense-status",
    method: "POST",
    auth: "x-skaps-secret header",
    fields: ["expenseStatus (used)", "requestStatus (request)"],
  });
}
