"use client";
import { InventoryStatusBadge } from "./InventoryStatusBadge";

import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { MapPin, ShoppingCart } from "lucide-react";

import { CATEGORY_ICONS } from "./inventory-page-config";
import type { InventoryPageModel } from "./useInventoryPageModel";

type Props = Pick<
  InventoryPageModel,
  "filteredInventory"
  | "searchTerm"
  | "selectedCategory"
  | "selectedStatus"
  | "selectedRoom"
  | "lowStockOnly"
  | "selectedJobFilter"
  | "selectedPmFilter"
  | "t"
  | "viewMode"
  | "getCategoryLabel"
  | "canManageStock"
  | "setSelectedItem"
  | "setShowRestockDialog"
  | "canConsumeInventory"
  | "setShowUseDialog"
>;

export function InventoryItems({
  filteredInventory,
  searchTerm,
  selectedCategory,
  selectedStatus,
  selectedRoom,
  lowStockOnly,
  selectedJobFilter,
  selectedPmFilter,
  t,
  viewMode,
  getCategoryLabel,
  canManageStock,
  setSelectedItem,
  setShowRestockDialog,
  canConsumeInventory,
  setShowUseDialog,
}: Props) {
  return (<>
    {/* Inventory Grid/List */}
    {filteredInventory.length === 0 ? (
      <FeedbackState
        variant={
          searchTerm ||
          selectedCategory !== "all" ||
          selectedStatus !== "all" ||
          selectedRoom !== "all" ||
          lowStockOnly ||
          selectedJobFilter !== "all" ||
          selectedPmFilter !== "all"
            ? "no-results"
            : "empty"
        }
        title={t("inventory.noItems")}
        description={
          searchTerm ||
          selectedCategory !== "all" ||
          selectedStatus !== "all" ||
          selectedRoom !== "all" ||
          lowStockOnly ||
          selectedJobFilter !== "all" ||
          selectedPmFilter !== "all"
            ? t("inventory.noItemsFiltered")
            : t("inventory.noItemsHint")
        }
      />
    ) : viewMode === "grid" ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredInventory.map((item) => (
          <Card key={item.id} variant="interactive" className="flex h-full flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {item.image_url ? (
                    <div className="shrink-0">
                      <img
                        loading="lazy"
                        decoding="async"
                        src={item.image_url}
                        alt={item.name}
                        className="h-16 w-16 rounded-xl border border-border object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          if (target.nextElementSibling) {
                            (
                              target.nextElementSibling as HTMLElement
                            ).style.display = "flex";
                          }
                        }}
                      />
                      <div className="hidden h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/50 text-2xl">
                        {CATEGORY_ICONS[item.category] || "📋"}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-2xl">
                      {CATEGORY_ICONS[item.category] || "📋"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold leading-5 text-foreground">
                      {item.name}
                    </h3>
                    <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">
                      {item.item_id}
                    </p>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("inventory.currentQuantity")}</p>
                <p className="mt-1 break-words text-2xl font-bold tabular-nums text-foreground">
                  {item.quantity} <span className="text-sm font-semibold text-muted-foreground">{item.unit}</span>
                </p>
                {item.min_quantity > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{t("inventory.minimum")}: {item.min_quantity} {item.unit}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <InventoryStatusBadge status={item.status} t={t} />
                <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left text-xs">
                  {getCategoryLabel(item.category, item.category_display)}
                </Badge>
              </div>

              {(item.property_name || item.location) && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="break-words">
                    {[item.property_name, item.location].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}

              {item.room_name && (
                <div className="break-words text-xs text-muted-foreground">
                  {t("inventory.room")}: {item.room_name}
                </div>
              )}

              {item.last_job_by_user && (
                <div className="break-words rounded-lg border border-info/20 bg-info/10 p-2 text-xs text-info">
                  <span className="font-semibold">{t("inventory.lastJob")}:</span>{" "}
                  {item.last_job_by_user.job_id} -{" "}
                  {item.last_job_by_user.description}
                </div>
              )}

              {item.last_pm_by_user && (
                <div className="break-words rounded-lg border border-primary/20 bg-primary/10 p-2 text-xs text-primary">
                  <span className="font-semibold">{t("inventory.lastPm")}:</span>{" "}
                  {item.last_pm_by_user.pm_id} - {item.last_pm_by_user.title}
                </div>
              )}

              <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3">
                {canManageStock && <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedItem(item);
                    setShowRestockDialog(true);
                  }}
                >
                  <ShoppingCart className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("inventory.restock")}
                </Button>}
                {canConsumeInventory && <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedItem(item);
                    setShowUseDialog(true);
                  }}
                  disabled={item.quantity === 0}
                >
                  {t("inventory.use")}
                </Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    ) : (
      <Card>
        <CardContent className="p-0">
          <div className="grid gap-3 p-3 xl:hidden">
            {filteredInventory.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex gap-3">
                  <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50 text-2xl">
                    {item.image_url ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      CATEGORY_ICONS[item.category] || "📋"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-bold leading-5 text-foreground">
                          {item.name}
                        </h3>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {item.item_id}
                        </p>
                      </div>
                      <span className="shrink-0"><InventoryStatusBadge status={item.status} t={t} /></span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left text-xs">
                        {getCategoryLabel(item.category, item.category_display)}
                      </Badge>
                      {item.location ? (
                        <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left text-xs">
                          {item.location}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
                  <div className="flex items-end justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">{t("inventory.quantity")}</span>
                    <strong className="break-words text-right text-xl tabular-nums text-foreground">
                      {item.quantity} <span className="text-xs font-semibold text-muted-foreground">{item.unit}</span>
                    </strong>
                  </div>
                  {(item.last_job_by_user || item.last_pm_by_user) && (
                    <div className="break-words rounded-xl border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                      {item.last_job_by_user ? (
                        <p>
                          <span className="font-semibold text-info">
                            Job:
                          </span>{" "}
                          {item.last_job_by_user.job_id}
                        </p>
                      ) : null}
                      {item.last_pm_by_user ? (
                        <p>
                          <span className="font-semibold text-primary">
                            PM:
                          </span>{" "}
                          {item.last_pm_by_user.pm_id}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {canManageStock && <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedItem(item);
                        setShowRestockDialog(true);
                      }}
                    >
                      {t("inventory.restock")}
                    </Button>}
                    {canConsumeInventory && <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedItem(item);
                        setShowUseDialog(true);
                      }}
                      disabled={item.quantity === 0}
                    >
                      {t("inventory.use")}
                    </Button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.item")}
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.category")}
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.quantity")}
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.status")}
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.location")}
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.lastJobPm")}
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("inventory.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredInventory.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <>
                            <img
                              loading="lazy"
                              decoding="async"
                              src={item.image_url}
                              alt={item.name}
                              className="h-12 w-12 rounded-xl border border-border object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                if (target.nextElementSibling) {
                                  (
                                    target.nextElementSibling as HTMLElement
                                  ).style.display = "block";
                                }
                              }}
                            />
                            <div className="text-2xl hidden">
                              {CATEGORY_ICONS[item.category] || "📋"}
                            </div>
                          </>
                        ) : (
                          <div className="text-2xl">
                            {CATEGORY_ICONS[item.category] || "📋"}
                          </div>
                        )}
                        <div className="min-w-0 max-w-64">
                          <div className="break-words text-sm font-semibold text-foreground">
                            {item.name}
                          </div>
                          <div className="break-all font-mono text-xs text-muted-foreground">
                            {item.item_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="secondary" className="max-w-44 whitespace-normal break-words text-left text-xs">
                        {getCategoryLabel(item.category, item.category_display)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="text-sm tabular-nums">
                        <span className="text-lg font-bold text-foreground">
                          {item.quantity}
                        </span>
                        <span className="text-muted-foreground ml-1">
                          {item.unit}
                        </span>
                        {item.min_quantity > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {t("inventory.minimum")}: {item.min_quantity}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <InventoryStatusBadge status={item.status} t={t} />
                    </td>
                    <td className="px-5 py-4">
                      {item.location ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="max-w-44 break-words">{item.location}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {item.last_job_by_user && (
                        <div className="mb-1 text-info">
                          <span className="font-semibold">Job:</span>{" "}
                          {item.last_job_by_user.job_id}
                          <div
                            className="max-w-52 break-words text-muted-foreground"
                            title={item.last_job_by_user.full_description}
                          >
                            {item.last_job_by_user.description}
                          </div>
                        </div>
                      )}
                      {item.last_pm_by_user && (
                        <div className="text-primary">
                          <span className="font-semibold">PM:</span>{" "}
                          {item.last_pm_by_user.pm_id}
                          <div
                            className="max-w-52 break-words text-muted-foreground"
                            title={item.last_pm_by_user.full_title}
                          >
                            {item.last_pm_by_user.title}
                          </div>
                        </div>
                      )}
                      {!item.last_job_by_user && !item.last_pm_by_user && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="flex gap-2">
                        {canManageStock && <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item);
                            setShowRestockDialog(true);
                          }}
                        >
                          {t("inventory.restock")}
                        </Button>}
                        {canConsumeInventory && <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item);
                            setShowUseDialog(true);
                          }}
                          disabled={item.quantity === 0}
                        >
                          {t("inventory.use")}
                        </Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )}

  </>);
}
