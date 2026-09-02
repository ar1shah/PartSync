import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ScanClient } from "./ScanClient";

export const dynamic = "force-dynamic";

export default function InventoryScanPage() {
  return (
    <div>
      <Link href="/admin/inventory" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to inventory
      </Link>
      <header className="mt-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">QR / RFID lookup</h1>
        <p className="mt-1 text-sm text-slate-500">
          Resolve Datatex QR labels and future RFID tags against SKAPS Spare Parts Inventory.
        </p>
      </header>
      <div className="mt-6">
        <ScanClient />
      </div>
    </div>
  );
}
