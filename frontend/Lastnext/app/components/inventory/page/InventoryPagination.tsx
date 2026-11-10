"use client";

import React from "react";

import { Card, CardContent } from "@/app/components/ui/card";

import { Button } from "@/app/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { InventoryPageModel } from "./useInventoryPageModel";

type Props = Pick<
  InventoryPageModel,
  "filteredInventory"
  | "totalPages"
  | "t"
  | "page"
  | "pageSize"
  | "totalCount"
  | "setPage"
  | "loading"
  | "setPageSize"
>;

export function InventoryPagination({
  filteredInventory,
  totalPages,
  t,
  page,
  pageSize,
  totalCount,
  setPage,
  loading,
  setPageSize,
}: Props) {
  return (<>
    {/* Pagination */}
    {filteredInventory.length > 0 && totalPages > 1 && (
      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="text-center text-sm text-muted-foreground sm:text-left">
              {t("inventory.showing", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, totalCount), total: totalCount })}
            </div>

            <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={loading || page <= 1}
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                <span className="hidden sm:inline">{t("action.previous")}</span>
              </Button>

              <span className="text-center text-sm font-bold text-foreground sm:hidden">
                {page} / {totalPages}
              </span>

              <div className="hidden items-center gap-1 sm:flex">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(pageNum)}
                      disabled={loading}
                      className="min-w-[2.5rem]"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={loading || page >= totalPages}
              >
                <span className="hidden sm:inline">{t("action.next")}</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex w-full items-center justify-center gap-2 sm:w-auto">
              <label htmlFor="inventory-page-size" className="text-sm text-muted-foreground">
                {t("inventory.perPage")}
              </label>
              <select
                id="inventory-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                disabled={loading}
                className="min-h-12 rounded-lg border border-border bg-background px-3 py-1 text-base text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    )}
  </>);
}
