"use client";

import React from "react";

import { SearchablePicker } from "@/app/components/ui/searchable-picker";
import { Input } from "@/app/components/ui/input";

import { Button } from "@/app/components/ui/button";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";

import type { InventoryPageModel } from "./useInventoryPageModel";

type Props = Pick<
  InventoryPageModel,
  "canManageStock"
  | "showAddDialog"
  | "setShowAddDialog"
  | "setStockMutationError"
  | "t"
  | "stockMutationError"
  | "newItem"
  | "setNewItem"
  | "addPending"
  | "categoryOptions"
  | "getCategoryLabel"
  | "handleAddItem"
>;

export function InventoryAddDialog({
  canManageStock,
  showAddDialog,
  setShowAddDialog,
  setStockMutationError,
  t,
  stockMutationError,
  newItem,
  setNewItem,
  addPending,
  categoryOptions,
  getCategoryLabel,
  handleAddItem,
}: Props) {
  return (<>
{canManageStock && <Dialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open);
            setStockMutationError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t("inventory.addItem")}
            </Button>
          </DialogTrigger>
          <DialogContent className="[&_input]:text-base [&_textarea]:text-base max-h-[92dvh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-4 sm:max-w-2xl sm:p-6">
            <DialogHeader>
              <DialogTitle>{t("inventory.addTitle")}</DialogTitle>
              <DialogDescription>
                {t("inventory.addDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {stockMutationError ? (
                <p className="text-sm text-red-600" role="alert">
                  {stockMutationError}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">{t("inventory.itemName")} *</Label>
                  <Input
                    id="name"
                    placeholder={t("inventory.enterItemName")}
                    value={newItem.name}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="category">{t("inventory.category")} *</Label>
                  <SearchablePicker
                    id="category"
                    label={t("inventory.category")}
                    placeholder={t("inventory.selectCategory")}
                    value={newItem.category}
                    onValueChange={(category) => setNewItem((item) => ({ ...item, category }))}
                    disabled={addPending}
                    options={categoryOptions.map((cat) => ({ value: cat.value, label: getCategoryLabel(cat.value, cat.label) }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">{t("inventory.description")}</Label>
                <Textarea
                  id="description"
                  placeholder={t("inventory.enterDescription")}
                  value={newItem.description}
                  onChange={(event) =>
                    setNewItem((item) => ({
                      ...item,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="quantity">{t("inventory.initialQuantity")} *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    value={newItem.quantity}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        quantity: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="min_quantity">{t("inventory.minQuantity")}</Label>
                  <Input
                    id="min_quantity"
                    type="number"
                    min="0"
                    value={newItem.min_quantity}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        min_quantity: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="unit">{t("inventory.unit")}</Label>
                  <Input
                    id="unit"
                    value={newItem.unit}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        unit: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="location">{t("inventory.location")}</Label>
                  <Input
                    id="location"
                    placeholder={t("inventory.storageLocation")}
                    value={newItem.location}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        location: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="supplier">{t("inventory.supplier")}</Label>
                  <Input
                    id="supplier"
                    placeholder={t("inventory.supplierName")}
                    value={newItem.supplier}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        supplier: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                {t("action.cancel")}
              </Button>
              <Button
                onClick={() => void handleAddItem()}
                disabled={addPending || !newItem.name.trim()}
              >
                {addPending ? t("inventory.adding") : t("inventory.addItem")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>}
  </>);
}
