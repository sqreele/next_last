import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("inventory management and consumption controls use server capabilities", async () => {
  const page = await source("../app/dashboard/inventory/page.tsx");
  const importer = await source("../app/components/inventory/InventoryCsvImport.tsx");

  assert.match(page, /inventory\/capabilities/);
  assert.match(page, /can_manage_inventory_stock/);
  assert.match(page, /can_consume_inventory/);
  assert.match(page, /canManageStock && <Dialog/);
  assert.match(page, /canManageStock && <Button[\s\S]*?inventory\.restock/);
  assert.match(page, /canConsumeInventory && <Button[\s\S]*?inventory\.use/);
  assert.match(page, /if \(!canManageStock \|\| !selectedItem/);
  assert.match(page, /if \(!canConsumeInventory \|\| !selectedItem/);
  assert.match(importer, /canManageStock: boolean/);
  assert.match(importer, /if \(!canManageStock\) return null/);
});

test("use inventory asks for a positive use quantity rather than a resulting balance", async () => {
  const page = await source("../app/dashboard/inventory/page.tsx");
  assert.match(page, /id="use-quantity"/);
  assert.match(page, /min="1"/);
  assert.match(page, /max=\{selectedItem\?\.quantity\}/);
  assert.match(page, /inventory\.remainingStock/);
});
