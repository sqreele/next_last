"use client";

import React from "react";

import { Input } from "@/app/components/ui/input";

import { Button } from "@/app/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";

import type { InventoryPageModel } from "./useInventoryPageModel";

type Props = Pick<
  InventoryPageModel,
  "showRestockDialog"
  | "setShowRestockDialog"
  | "setStockMutationError"
  | "t"
  | "selectedItem"
  | "stockMutationError"
  | "restockQuantity"
  | "setRestockQuantity"
  | "setSelectedItem"
  | "handleRestock"
  | "stockMutationPending"
>;

export function InventoryRestockDialog({
  showRestockDialog,
  setShowRestockDialog,
  setStockMutationError,
  t,
  selectedItem,
  stockMutationError,
  restockQuantity,
  setRestockQuantity,
  setSelectedItem,
  handleRestock,
  stockMutationPending,
}: Props) {
  return (<>
    {/* Restock Dialog */}
    <Dialog
      open={showRestockDialog}
      onOpenChange={(open) => {
        setShowRestockDialog(open);
        if (open) setStockMutationError(null);
      }}
    >
      <DialogContent className="[&_input]:text-base [&_textarea]:text-base max-h-[92dvh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-4 sm:max-w-lg sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-bold">{t("inventory.restockTitle")}</DialogTitle>
          <DialogDescription>
            {t("inventory.addQuantityTo", { name: selectedItem?.name || "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {stockMutationError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
              {stockMutationError}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="restock-quantity" className="font-semibold">{t("inventory.quantityToAdd")}</Label>
            <Input
              id="restock-quantity"
              type="number"
              min="1"
              value={restockQuantity}
              onChange={(e) => setRestockQuantity(e.target.value)}
              placeholder={t("inventory.enterQuantity")}
              className="h-12 rounded-xl text-lg font-bold tabular-nums"
            />
          </div>
          {selectedItem && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <span className="font-medium">{t("inventory.current")}:</span> {selectedItem.quantity} {selectedItem.unit}
              {restockQuantity && (
                <span className="ml-2 font-semibold tabular-nums text-foreground">
                  → {selectedItem.quantity + parseInt(restockQuantity) || 0}{" "}
                  {selectedItem.unit}
                </span>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="!grid grid-cols-2 gap-2 sm:!flex">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setShowRestockDialog(false);
              setRestockQuantity("");
              setSelectedItem(null);
            }}
          >
            {t("action.cancel")}
          </Button>
          <Button
            onClick={handleRestock}
            className="w-full"
            disabled={
              stockMutationPending ||
              !restockQuantity ||
              parseInt(restockQuantity) <= 0
            }
          >
            {stockMutationPending ? t("inventory.restocking") : t("inventory.restock")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </>);
}
