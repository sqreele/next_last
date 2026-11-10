"use client";

import React from "react";

import { SearchablePicker } from "@/app/components/ui/searchable-picker";
import { Input } from "@/app/components/ui/input";

import { Button } from "@/app/components/ui/button";
import { Minus, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";

import { CATEGORY_ICONS } from "./inventory-page-config";
import type { InventoryPageModel } from "./useInventoryPageModel";

type Props = Pick<
  InventoryPageModel,
  "showUseDialog"
  | "setShowUseDialog"
  | "setStockMutationError"
  | "setUseQuantity"
  | "setSelectedJobId"
  | "setSelectedPmId"
  | "setSelectedItem"
  | "t"
  | "selectedItem"
  | "stockMutationError"
  | "parsedUseQuantity"
  | "useQuantity"
  | "invalidUseQuantity"
  | "remainingQuantity"
  | "loadingJobsPMs"
  | "selectedJobId"
  | "stockMutationPending"
  | "userJobs"
  | "selectedPmId"
  | "userPMs"
  | "handleUse"
>;

export function InventoryUseDialog({
  showUseDialog,
  setShowUseDialog,
  setStockMutationError,
  setUseQuantity,
  setSelectedJobId,
  setSelectedPmId,
  setSelectedItem,
  t,
  selectedItem,
  stockMutationError,
  parsedUseQuantity,
  useQuantity,
  invalidUseQuantity,
  remainingQuantity,
  loadingJobsPMs,
  selectedJobId,
  stockMutationPending,
  userJobs,
  selectedPmId,
  userPMs,
  handleUse,
}: Props) {
  return (<>
    {/* Use Dialog */}
    <Dialog
      open={showUseDialog}
      onOpenChange={(open) => {
        setShowUseDialog(open);
        if (open) setStockMutationError(null);
        if (!open) {
          setUseQuantity("");
          setSelectedJobId("");
          setSelectedPmId("");
          setSelectedItem(null);
        }
      }}
    >
      <DialogContent className="[&_input]:text-base [&_textarea]:text-base max-h-[92dvh] w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{t("inventory.useTitle")}</DialogTitle>
          <DialogDescription>
            {t("inventory.useDescription")}
          </DialogDescription>
        </DialogHeader>

        {selectedItem && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/60 p-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-card text-2xl shadow-xs">
              {CATEGORY_ICONS[selectedItem.category] || "📋"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-bold text-foreground">
                {selectedItem.name}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {selectedItem.item_id}
              </p>
            </div>
            <div className="flex-none text-right">
              <p className="text-lg font-bold tabular-nums text-foreground">
                {selectedItem.quantity}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("inventory.available", { unit: selectedItem.unit })}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 py-4">
          {stockMutationError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
              {stockMutationError}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="use-quantity" className="text-sm font-semibold">
              {t("inventory.quantityToUse")}
            </Label>
            <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-12 rounded-xl p-0"
                onClick={() =>
                  setUseQuantity(String(Math.max(0, parsedUseQuantity - 1)))
                }
                disabled={parsedUseQuantity <= 0}
                aria-label="Decrease quantity"
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </Button>
              <Input
                id="use-quantity"
                type="number"
                inputMode="numeric"
                min="1"
                max={selectedItem?.quantity}
                value={useQuantity}
                onChange={(e) => setUseQuantity(e.target.value)}
                placeholder="0"
                className="h-12 rounded-xl text-center text-lg font-bold tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 w-12 rounded-xl p-0"
                onClick={() =>
                  setUseQuantity(
                    String(
                      Math.min(
                        selectedItem?.quantity || 0,
                        parsedUseQuantity + 1,
                      ),
                    ),
                  )
                }
                disabled={
                  !selectedItem || parsedUseQuantity >= selectedItem.quantity
                }
                aria-label="Increase quantity"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            {selectedItem && parsedUseQuantity > 0 && (
              <div
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${
                  invalidUseQuantity
                    ? "border border-destructive/30 bg-destructive/10 text-destructive"
                    : "border border-success/30 bg-success/10 text-success"
                }`}
              >
                <span>{t("inventory.remainingStock")}</span>
                <span>
                  {remainingQuantity} {selectedItem.unit}
                </span>
              </div>
            )}
          </div>

          {/* Job Selection */}
          <div>
            <Label htmlFor="use-job">{t("inventory.linkJob")}</Label>
            {loadingJobsPMs ? (
              <div className="text-sm text-muted-foreground py-2">
                {t("inventory.loadingJobs")}
              </div>
            ) : (
              <SearchablePicker
                id="use-job"
                label={t("inventory.linkJob")}
                placeholder={t("inventory.selectJob")}
                value={selectedJobId || "__none__"}
                onValueChange={(value) => setSelectedJobId(value === "__none__" ? "" : value)}
                disabled={stockMutationPending}
                options={[
                  { value: "__none__", label: t("inventory.noJobLink") },
                  ...userJobs.map((job) => ({ value: job.job_id, label: job.job_id, description: job.description || t("inventory.noDescription") })),
                ]}
              />
            )}
            {selectedItem?.last_job_by_user && !selectedJobId && (
              <div className="mt-1 text-xs text-info">
                {t("inventory.lastUsed", { id: selectedItem.last_job_by_user.job_id })}
              </div>
            )}
          </div>

          {/* PM Selection */}
          <div>
            <Label htmlFor="use-pm">
              {t("inventory.linkPm")}
            </Label>
            {loadingJobsPMs ? (
              <div className="text-sm text-muted-foreground py-2">
                {t("inventory.loadingPms")}
              </div>
            ) : (
              <SearchablePicker
                id="use-pm"
                label={t("inventory.linkPm")}
                placeholder={t("inventory.selectPm")}
                value={selectedPmId || "__none__"}
                onValueChange={(value) => setSelectedPmId(value === "__none__" ? "" : value)}
                disabled={stockMutationPending}
                options={[
                  { value: "__none__", label: t("inventory.noPmLink") },
                  ...userPMs.map((pm) => ({ value: pm.pm_id, label: pm.pm_id, description: pm.pmtitle || t("inventory.noTitle") })),
                ]}
              />
            )}
            {selectedItem?.last_pm_by_user && !selectedPmId && (
              <div className="mt-1 text-xs text-primary">
                {t("inventory.lastUsed", { id: selectedItem.last_pm_by_user.pm_id })}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
            {t("inventory.usageNote")}
          </div>
        </div>
        <DialogFooter className="!grid grid-cols-2 gap-2 sm:!flex">
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl"
            onClick={() => {
              setShowUseDialog(false);
              setUseQuantity("");
              setSelectedJobId("");
              setSelectedPmId("");
              setSelectedItem(null);
            }}
          >
            {t("action.cancel")}
          </Button>
          <Button
            onClick={handleUse}
            className="h-12 w-full rounded-xl"
            disabled={stockMutationPending || invalidUseQuantity}
          >
            {stockMutationPending ? t("inventory.saving") : t("inventory.use")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </>);
}
