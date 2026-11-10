"use client";
import { InventoryStatusBadge } from "./InventoryStatusBadge";

import React from "react";

import { Card, CardContent } from "@/app/components/ui/card";

import { SearchablePicker } from "@/app/components/ui/searchable-picker";
import { Input } from "@/app/components/ui/input";

import { Button } from "@/app/components/ui/button";
import { Search, LayoutGrid, List, Filter, AlertTriangle, XCircle, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";

import type { InventoryPageModel } from "./useInventoryPageModel";

type Props = Pick<
  InventoryPageModel,
  "inventorySearchRef"
  | "t"
  | "searchTerm"
  | "setSearchTerm"
  | "viewMode"
  | "setViewMode"
  | "activeFilterCount"
  | "setShowMobileFilters"
  | "showMobileFilters"
  | "selectedCategory"
  | "setSelectedCategory"
  | "setPage"
  | "categoryOptions"
  | "getCategoryLabel"
  | "selectedStatus"
  | "setSelectedStatus"
  | "statusOptions"
  | "selectedRoom"
  | "setSelectedRoom"
  | "rooms"
  | "selectedJobFilter"
  | "setSelectedJobFilter"
  | "jobsForFilter"
  | "selectedPmFilter"
  | "setSelectedPmFilter"
  | "pmsForFilter"
  | "lowStockOnly"
  | "setLowStockOnly"
  | "loading"
  | "error"
>;

export function InventoryFilterPanel({
  inventorySearchRef,
  t,
  searchTerm,
  setSearchTerm,
  viewMode,
  setViewMode,
  activeFilterCount,
  setShowMobileFilters,
  showMobileFilters,
  selectedCategory,
  setSelectedCategory,
  setPage,
  categoryOptions,
  getCategoryLabel,
  selectedStatus,
  setSelectedStatus,
  statusOptions,
  selectedRoom,
  setSelectedRoom,
  rooms,
  selectedJobFilter,
  setSelectedJobFilter,
  jobsForFilter,
  selectedPmFilter,
  setSelectedPmFilter,
  pmsForFilter,
  lowStockOnly,
  setLowStockOnly,
  loading,
  error,
}: Props) {
  return (<>
    {/* Search and Filters */}
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col gap-4">
          {/* First Row: Search and View Toggle */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                ref={inventorySearchRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                aria-label={t("inventory.search")}
                placeholder={t("inventory.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 min-w-0 rounded-lg pl-10 pr-12 text-base"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label={t("picker.clearSearch")}
                  className="absolute right-0 top-0 grid h-12 w-12 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setSearchTerm("");
                    inventorySearchRef.current?.focus();
                  }}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label={t("inventory.view")}>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-12 min-h-12 min-w-12 rounded-md px-3 sm:h-9 sm:min-h-9 sm:min-w-0"
                aria-label={t("inventory.gridView")}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-12 min-h-12 min-w-12 rounded-md px-3 sm:h-9 sm:min-h-9 sm:min-w-0"
                aria-label={t("inventory.listView")}
                aria-pressed={viewMode === "list"}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant={activeFilterCount > 0 ? "default" : "outline"}
            onClick={() => setShowMobileFilters((value) => !value)}
            className="min-h-12 w-full justify-between sm:hidden"
            aria-expanded={showMobileFilters}
          >
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {t("inventory.filters")}
            </span>
            <span className="text-xs font-bold">
              {activeFilterCount > 0
                ? t("inventory.activeFilters", { count: activeFilterCount })
                : showMobileFilters
                  ? t("inventory.hide")
                  : t("inventory.show")}
            </span>
          </Button>

          {/* Second Row: All Filters */}
          <div
            className={`${showMobileFilters ? "grid" : "hidden"} gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:flex sm:flex-wrap sm:items-center sm:border-0 sm:bg-transparent sm:p-0`}
          >
            <Filter className="hidden h-5 w-5 text-muted-foreground sm:block" aria-hidden="true" />

            {/* Category Filter */}
            <SearchablePicker
              id="inventory-category-filter"
              label={t("inventory.category")}
              placeholder={t("inventory.allCategories")}
              className="sm:w-[150px]"
              value={selectedCategory}
              onValueChange={(value) => {
                setSelectedCategory(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: t("inventory.allCategories") },
                ...categoryOptions.map((cat) => ({ value: cat.value, label: getCategoryLabel(cat.value, cat.label) })),
              ]}
            />

            {/* Status Filter */}
            <Select
              value={selectedStatus}
              onValueChange={(value) => {
                setSelectedStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-12 w-full rounded-lg sm:w-[150px]" aria-label={t("inventory.allStatuses")}>
                <SelectValue placeholder={t("inventory.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inventory.allStatuses")}</SelectItem>
                {statusOptions.map((stat) => (
                  <SelectItem key={stat.value} value={stat.value}>
                    <InventoryStatusBadge status={stat.value} t={t} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Room Filter */}
            <SearchablePicker
              id="inventory-room-filter"
              label={t("inventory.room")}
              placeholder={t("inventory.allRooms")}
              className="sm:w-[150px]"
              value={selectedRoom}
              onValueChange={(value) => {
                setSelectedRoom(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: t("inventory.allRooms") },
                ...rooms.map((room) => ({ value: String(room.room_id), label: room.roomname })),
              ]}
            />

            {/* Job Filter */}
            <SearchablePicker
              id="inventory-job-filter"
              label={t("inventory.filterJob")}
              placeholder={t("inventory.allJobs")}
              className="sm:w-[180px]"
              value={selectedJobFilter}
              onValueChange={(value) => {
                setSelectedJobFilter(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: t("inventory.allJobs") },
                ...jobsForFilter.map((job) => ({ value: job.job_id, label: job.job_id, description: job.description || t("inventory.noDescription") })),
              ]}
            />

            {/* PM Filter */}
            <SearchablePicker
              id="inventory-pm-filter"
              label={t("inventory.filterPm")}
              placeholder={t("inventory.allPms")}
              className="sm:w-[180px]"
              value={selectedPmFilter}
              onValueChange={(value) => {
                setSelectedPmFilter(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: t("inventory.allPms") },
                ...pmsForFilter.map((pm) => ({ value: pm.pm_id, label: pm.pm_id, description: pm.pmtitle || t("inventory.noTitle") })),
              ]}
            />

            {/* Low Stock Toggle */}
            <Button
              variant={lowStockOnly ? "warning" : "outline"}
              size="sm"
              onClick={() => {
                setLowStockOnly(!lowStockOnly);
                setPage(1);
              }}
              className="min-h-11 gap-2"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t("inventory.lowStockOnly")}
            </Button>

            {/* Clear Filters */}
            {(selectedCategory !== "all" ||
              selectedStatus !== "all" ||
              selectedRoom !== "all" ||
              lowStockOnly ||
              selectedJobFilter !== "all" ||
              selectedPmFilter !== "all" ||
              searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedStatus("all");
                  setSelectedRoom("all");
                  setLowStockOnly(false);
                  setSelectedJobFilter("all");
                  setSelectedPmFilter("all");
                  setSearchTerm("");
                  setPage(1);
                  setShowMobileFilters(false);
                }}
                className="min-h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              >
                <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("inventory.clearFilters")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>

    {loading ? (
      <div
        className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {t("common.loading")}
      </div>
    ) : null}

    {error ? (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        role="alert"
      >
        {error}
      </div>
    ) : null}

  </>);
}
