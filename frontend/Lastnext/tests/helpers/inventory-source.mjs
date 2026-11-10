import { readFileSync } from "node:fs";

// Source contract tests follow the coordinator and its extracted implementations.
export function readInventorySource() {
  const files = [
    "../../app/dashboard/inventory/page.tsx",
    "../../app/components/inventory/page/useInventoryPageModel.ts",
    ...["InventoryPageHeader", "InventoryAddDialog", "InventoryFilterPanel",
      "InventoryItems", "InventoryStatusBadge", "InventoryRestockDialog", "InventoryUseDialog", "InventoryPagination"]
      .map((name) => `../../app/components/inventory/page/${name}.tsx`),
  ];
  return files.map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
}
