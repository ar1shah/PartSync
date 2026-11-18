import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/roles";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function InventoryImportPage() {
  await requirePagePermission("inventory.import");

  return (
    <div>
      <Link
        href="/admin/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to inventory
      </Link>
      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Import Excel</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Upload the Athens Inventory workbook and review every change before it is applied.
          Quantities and part details come from the sheet. Nothing is removed, blank cells never
          erase existing values, and part photos are never touched.
        </p>
      </header>
      <div className="mt-6">
        <ImportClient />
      </div>
    </div>
  );
}
