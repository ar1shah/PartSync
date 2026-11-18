"use client";

import { InventoryTileGrid } from "@/components/inventory/InventoryTileGrid";
import type { ListTuple } from "@/lib/inventory-backend/list-tuple";

interface Props {
  inventoryParts: ListTuple[];
}

export function AdminInventoryClient({ inventoryParts }: Props) {
  return <InventoryTileGrid parts={inventoryParts} />;
}
