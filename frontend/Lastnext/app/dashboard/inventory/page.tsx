"use client";

import React from "react";

import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { PageContainer } from "@/app/components/layout/PageContainer";
import { DashboardKpiSkeleton, SkeletonList } from "@/app/components/ui/loading";

import { Button } from "@/app/components/ui/button";

import { InventoryMobileStats } from "@/app/components/inventory/InventoryMobileStats";

import { useInventoryPageModel } from "@/app/components/inventory/page/useInventoryPageModel";
import { InventoryPageHeader } from "@/app/components/inventory/page/InventoryPageHeader";
import { InventoryFilterPanel } from "@/app/components/inventory/page/InventoryFilterPanel";
import { InventoryItems } from "@/app/components/inventory/page/InventoryItems";
import { InventoryRestockDialog } from "@/app/components/inventory/page/InventoryRestockDialog";
import { InventoryUseDialog } from "@/app/components/inventory/page/InventoryUseDialog";
import { InventoryPagination } from "@/app/components/inventory/page/InventoryPagination";

export default function InventoryPage() {
  const {
    status,
    loading,
    hasLoadedInventory,
    t,
    error,
    fetchInventory,
    selectedProperty,
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
    canManageStock,
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
    inventory,
    setLowStockOnly,
    setPage,
    inventorySearchRef,
    setSearchTerm,
    viewMode,
    setViewMode,
    activeFilterCount,
    setShowMobileFilters,
    showMobileFilters,
    setSelectedCategory,
    setSelectedStatus,
    statusOptions,
    setSelectedRoom,
    rooms,
    setSelectedJobFilter,
    jobsForFilter,
    setSelectedPmFilter,
    pmsForFilter,
    setSelectedItem,
    setShowRestockDialog,
    canConsumeInventory,
    setShowUseDialog,
    showRestockDialog,
    selectedItem,
    restockQuantity,
    setRestockQuantity,
    handleRestock,
    stockMutationPending,
    showUseDialog,
    setUseQuantity,
    setSelectedJobId,
    setSelectedPmId,
    parsedUseQuantity,
    useQuantity,
    invalidUseQuantity,
    remainingQuantity,
    loadingJobsPMs,
    selectedJobId,
    userJobs,
    selectedPmId,
    userPMs,
    handleUse,
    totalPages,
    page,
    pageSize,
    setPageSize,
  } = useInventoryPageModel();
  if (status === "loading" || (loading && !hasLoadedInventory)) {
    return (
      <PageContainer aria-busy="true" aria-label={t("inventory.loading")}>
        <DashboardKpiSkeleton />
        <SkeletonList rows={6} />
      </PageContainer>
    );
  }

  if (error && !hasLoadedInventory) {
    return (
      <PageContainer>
        <FeedbackState
          variant="error"
          title={t("inventory.loadError")}
          description={error}
          action={
            <Button onClick={() => void fetchInventory()}>{t("action.tryAgain")}</Button>
          }
          showRefresh={false}
        />
      </PageContainer>
    );
  }

  if (!selectedProperty) {
    return (
      <PageContainer>
        <FeedbackState
          variant="empty"
          title={t("common.selectProperty")}
          description={t("inventory.selectPropertyHint")}
          showRefresh={false}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      className="max-w-7xl space-y-5 desktop:max-w-[94rem]"
      aria-busy={loading}
    >
      <InventoryPageHeader
        t={t}
        totalCount={totalCount}
        lowStockCount={lowStockCount}
        searchTerm={searchTerm}
        selectedCategory={selectedCategory}
        selectedStatus={selectedStatus}
        selectedRoom={selectedRoom}
        lowStockOnly={lowStockOnly}
        selectedJobFilter={selectedJobFilter}
        selectedPmFilter={selectedPmFilter}
        filteredInventory={filteredInventory}
        selectedProperty={selectedProperty}
        canManageStock={canManageStock}
        fetchInventory={fetchInventory}
        showAddDialog={showAddDialog}
        setShowAddDialog={setShowAddDialog}
        setStockMutationError={setStockMutationError}
        stockMutationError={stockMutationError}
        newItem={newItem}
        setNewItem={setNewItem}
        addPending={addPending}
        categoryOptions={categoryOptions}
        getCategoryLabel={getCategoryLabel}
        handleAddItem={handleAddItem}
      />
      {/* Mobile-first stats strip — tap Low Stock to filter without scrolling */}
      <InventoryMobileStats
        items={inventory}
        total={totalCount}
        lowStockOnly={lowStockOnly}
        onToggleLowStock={() => {
          setLowStockOnly((value) => !value);
          setPage(1);
        }}
      />

      <InventoryFilterPanel
        inventorySearchRef={inventorySearchRef}
        t={t}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        viewMode={viewMode}
        setViewMode={setViewMode}
        activeFilterCount={activeFilterCount}
        setShowMobileFilters={setShowMobileFilters}
        showMobileFilters={showMobileFilters}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        setPage={setPage}
        categoryOptions={categoryOptions}
        getCategoryLabel={getCategoryLabel}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        statusOptions={statusOptions}
        selectedRoom={selectedRoom}
        setSelectedRoom={setSelectedRoom}
        rooms={rooms}
        selectedJobFilter={selectedJobFilter}
        setSelectedJobFilter={setSelectedJobFilter}
        jobsForFilter={jobsForFilter}
        selectedPmFilter={selectedPmFilter}
        setSelectedPmFilter={setSelectedPmFilter}
        pmsForFilter={pmsForFilter}
        lowStockOnly={lowStockOnly}
        setLowStockOnly={setLowStockOnly}
        loading={loading}
        error={error}
      />
      <InventoryItems
        filteredInventory={filteredInventory}
        searchTerm={searchTerm}
        selectedCategory={selectedCategory}
        selectedStatus={selectedStatus}
        selectedRoom={selectedRoom}
        lowStockOnly={lowStockOnly}
        selectedJobFilter={selectedJobFilter}
        selectedPmFilter={selectedPmFilter}
        t={t}
        viewMode={viewMode}
        getCategoryLabel={getCategoryLabel}
        canManageStock={canManageStock}
        setSelectedItem={setSelectedItem}
        setShowRestockDialog={setShowRestockDialog}
        canConsumeInventory={canConsumeInventory}
        setShowUseDialog={setShowUseDialog}
      />
      <InventoryRestockDialog
        showRestockDialog={showRestockDialog}
        setShowRestockDialog={setShowRestockDialog}
        setStockMutationError={setStockMutationError}
        t={t}
        selectedItem={selectedItem}
        stockMutationError={stockMutationError}
        restockQuantity={restockQuantity}
        setRestockQuantity={setRestockQuantity}
        setSelectedItem={setSelectedItem}
        handleRestock={handleRestock}
        stockMutationPending={stockMutationPending}
      />
      <InventoryUseDialog
        showUseDialog={showUseDialog}
        setShowUseDialog={setShowUseDialog}
        setStockMutationError={setStockMutationError}
        setUseQuantity={setUseQuantity}
        setSelectedJobId={setSelectedJobId}
        setSelectedPmId={setSelectedPmId}
        setSelectedItem={setSelectedItem}
        t={t}
        selectedItem={selectedItem}
        stockMutationError={stockMutationError}
        parsedUseQuantity={parsedUseQuantity}
        useQuantity={useQuantity}
        invalidUseQuantity={invalidUseQuantity}
        remainingQuantity={remainingQuantity}
        loadingJobsPMs={loadingJobsPMs}
        selectedJobId={selectedJobId}
        stockMutationPending={stockMutationPending}
        userJobs={userJobs}
        selectedPmId={selectedPmId}
        userPMs={userPMs}
        handleUse={handleUse}
      />
      <InventoryPagination
        filteredInventory={filteredInventory}
        totalPages={totalPages}
        t={t}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        setPage={setPage}
        loading={loading}
        setPageSize={setPageSize}
      />

    </PageContainer>
  );

}
