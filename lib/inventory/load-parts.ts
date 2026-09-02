// Compatibility entry point used by existing pages during the inventory cutover.
// All inventory now comes from the dedicated SKAPS Spare Parts Inventory project.
export { loadInventoryParts as loadParts } from "@/lib/inventory-backend/load-parts";
