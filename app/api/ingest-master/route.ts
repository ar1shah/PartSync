/**
 * Legacy Athens Inventory master-list ingest endpoint.
 *
 * The new source of inventory truth is SKAPS Spare Parts Inventory. This
 * endpoint is intentionally disabled in the cutover build so the old Google
 * Sheet cannot overwrite or create competing inventory records.
 *
 * Google Forms submission ingest (/api/ingest) remains active because those
 * submissions still power the request/used workflow in the legacy app DB.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      disabled: true,
      reason:
        "Athens master-list ingest is disabled. Inventory is managed by SKAPS Spare Parts Inventory and the controlled Location Refresh workflow.",
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json({
    service: "legacy master-list ingest",
    status: "disabled",
    inventory_source: "SKAPS Spare Parts Inventory",
  });
}
