"use client";

import React from "react";

import { Package, AlertTriangle } from "lucide-react";

import { InventoryCsvImport } from "@/app/components/inventory/InventoryCsvImport";

import type { InventoryPageModel } from "./useInventoryPageModel";
import { InventoryAddDialog } from "./InventoryAddDialog";

type Props = Pick<
  InventoryPageModel,
  "t"
  | "totalCount"
  | "lowStockCount"
  | "searchTerm"
  | "selectedCategory"
  | "selectedStatus"
  | "selectedRoom"
  | "lowStockOnly"
  | "selectedJobFilter"
  | "selectedPmFilter"
  | "filteredInventory"
  | "selectedProperty"
  | "canManageStock"
  | "fetchInventory"
  | "showAddDialog"
  | "setShowAddDialog"
  | "setStockMutationError"
  | "stockMutationError"
  | "newItem"
  | "setNewItem"
  | "addPending"
  | "categoryOptions"
  | "getCategoryLabel"
  | "handleAddItem"
>;

export function InventoryPageHeader({
  t,
  totalCount,
  lowStockCount,
  searchTerm,
  selectedCategory,
  selectedStatus,
  selectedRoom,
  lowStockOnly,
  selectedJobFilter,
  selectedPmFilter,
  filteredInventory,
  selectedProperty,
  canManageStock,
  fetchInventory,
  showAddDialog,
  setShowAddDialog,
  setStockMutationError,
  stockMutationError,
  newItem,
  setNewItem,
  addPending,
  categoryOptions,
  getCategoryLabel,
  handleAddItem,
}: Props) {
  return (<>
    {/* Header */}
    <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{t("inventory.workspace")}</p>
        <div className="mb-1 flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="break-words text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {t("inventory.title")}
          </h1>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {totalCount} {t("inventory.itemsTotal")}
          {lowStockCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 font-semibold text-warning-emphasis">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              ({lowStockCount} {t("inventory.lowStockWarning")})
            </span>
          )}
          {(searchTerm ||
            selectedCategory !== "all" ||
            selectedStatus !== "all" ||
            selectedRoom !== "all" ||
            lowStockOnly ||
            selectedJobFilter !== "all" ||
            selectedPmFilter !== "all") &&
            ` (${t("inventory.filteredCount", { count: filteredInventory.length })})`}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:items-center">
        <InventoryCsvImport
          currentPropertyId={selectedProperty}
          canManageStock={canManageStock}
          onImported={() => void fetchInventory()}
        />
        <InventoryAddDialog
        canManageStock={canManageStock}
        showAddDialog={showAddDialog}
        setShowAddDialog={setShowAddDialog}
        setStockMutationError={setStockMutationError}
        t={t}
        stockMutationError={stockMutationError}
        newItem={newItem}
        setNewItem={setNewItem}
        addPending={addPending}
        categoryOptions={categoryOptions}
        getCategoryLabel={getCategoryLabel}
        handleAddItem={handleAddItem}
      />
      </div>
    </header>

  </>);
}
