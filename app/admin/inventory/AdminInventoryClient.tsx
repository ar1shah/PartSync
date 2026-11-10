"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InventoryTileGrid } from "@/components/inventory/InventoryTileGrid";
import { ImportExcelModal } from "@/components/inventory/ImportExcelModal";
import type { InventoryPart } from "@/lib/inventory-backend/types";

interface Props {
  inventoryParts: InventoryPart[];
}

export function AdminInventoryClient({ inventoryParts }: Props) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button type="button" variant="outline" onClick={() => setShowImport(true)}>
          <FileSpreadsheet className="h-4 w-4" />
          Import Excel
        </Button>
      </div>
      <InventoryTileGrid parts={inventoryParts} />
      {showImport && (
        <ImportExcelModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
