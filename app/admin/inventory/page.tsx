import Link from "next/link";
import { Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadInventoryPartTuples } from "@/lib/inventory-backend/load-parts";
import { logPayloadSize } from "@/lib/perf";
import { getCurrentRole } from "@/lib/auth/roles";
import { can } from "@/lib/auth/permissions";
import { AdminInventoryClient } from "./AdminInventoryClient";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const [inventoryParts, role] = await Promise.all([loadInventoryPartTuples(), getCurrentRole()]);
  logPayloadSize("admin.inventory.parts", inventoryParts);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Inventory management
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Inventory is now sourced from the SKAPS Spare Parts Inventory database. Existing
            Datatex-controlled master records are protected from direct edits; use the controlled
            location refresh workflow for Zone, Location, and LWhsDesc updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/inventory/scan">
              <ScanLine className="h-4 w-4" />
              Scan QR / RFID
            </Link>
          </Button>
          {can(role, "inventory.create") && (
            <Button asChild>
              <Link href="/admin/inventory/new">
                <Plus className="h-4 w-4" />
                Add part
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8">
        <AdminInventoryClient
          inventoryParts={inventoryParts}
          canImport={can(role, "inventory.import")}
        />
      </div>
    </div>
  );
}
