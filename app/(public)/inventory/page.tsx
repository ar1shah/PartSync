import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InventoryTileGrid } from "@/components/inventory/InventoryTileGrid";
import { loadInventoryParts } from "@/lib/inventory-backend/load-parts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Inventory",
  description: "SKAPS parts inventory (admin sign-in required).",
};

export const revalidate = 30;

export default async function InventoryPage() {
  // Auth remains on the existing PartSync Supabase project during the first
  // cutover phase. Inventory data comes from the new project server-side.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/inventory");
  }

  const parts = await loadInventoryParts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wider text-blue-700">Inventory</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          SKAPS spare parts
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Inventory is loaded from the SKAPS Spare Parts Inventory database. Click any tile to see
          locations, QR/RFID details, images, and technical specifications.
        </p>
      </header>

      <div className="mt-8">
        <InventoryTileGrid parts={parts} />
      </div>
    </div>
  );
}
