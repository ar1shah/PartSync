"use client";

import { InventoryTileGrid } from "@/components/inventory/InventoryTileGrid";
import type { InventoryPart } from "@/lib/inventory-backend/types";

interface Props {
  inventoryParts: InventoryPart[];
}

export function AdminInventoryClient({ inventoryParts }: Props) {
  return <InventoryTileGrid parts={inventoryParts} />;
}
