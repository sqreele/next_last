'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePreventiveMaintenanceActions } from '@/app/lib/hooks/usePreventiveMaintenanceActions';
import { useFilterStore } from '@/app/lib/stores';
import { useMainStore } from '@/app/lib/stores/mainStore';
import { usePreventiveMaintenanceStore } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { PreventiveMaintenance, determinePMStatus } from '@/app/lib/preventiveMaintenanceModels';

// Import types
import { MachineOption, Stats } from '@/app/lib/hooks/filterTypes';

// Import components
import MobileHeader from '@/app/components/preventive/list/MobileHeader';
import DesktopHeader from '@/app/components/preventive/list/DesktopHeader';
import StatsCards from '@/app/components/preventive/list/StatsCards';
import FilterPanel from '@/app/components/preventive/list/FilterPanel';
import MaintenanceList from '@/app/components/preventive/list/MaintenanceList';
import Pagination from '@/app/components/preventive/list/Pagination';
import DeleteModal from '@/app/components/preventive/list/DeleteModal';
import BulkActions from '@/app/components/preventive/list/BulkActions';
import LoadingState from '@/app/components/preventive/list/LoadingState';
import EmptyState from '@/app/components/preventive/list/EmptyState';
import ErrorDisplay from '@/app/components/preventive/list/ErrorDisplay';
import Link from 'next/link';
import { Filter, Plus, Building } from 'lucide-react';

// Import utility functions
import {
  formatDate,
  // getFrequencyText removed - frequency no longer displayed
  getStatusInfo,
  getMachineNames
} from '@/app/lib/utils/maintenanceUtils';

// Define the sort field type
type SortField = 'date' | 'status' | 'machine';

function PreventiveMaintenanceListPageContent() {
  const selectedProperty = useMainStore(state => state.selectedPropertyId);
  const { 
    status, 
    frequency, 
    search, 
    start_date, 
    end_date, 
    machine_id, 
    page, 
    page_size,
    setStatus,
    setFrequency,
    setSearch,
    setStartDate,
    setEndDate,
    setMachineId,
    setPage,
    setPageSize,
    resetFilters 
  } = useFilterStore();
  
  const {
    maintenanceItems,
    machines,
    statistics,
    isLoading,
    error,
    fetchMaintenanceItems,
    fetchMachines,
    fetchStatistics,
    deleteMaintenance,
    clearError,
    totalCount,
    filterParams: pmFilterParams
  } = usePreventiveMaintenanceActions();

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dashboard quick actions use shareable status query parameters. Hydrate
  // that value into the existing filter store instead of creating a second
  // URL-specific filter authority.
  useEffect(() => {
    const requestedStatus = new URLSearchParams(window.location.search).get('status');
    if (
      requestedStatus &&
      ['pending', 'overdue', 'completed'].includes(requestedStatus) &&
      useFilterStore.getState().status !== requestedStatus
    ) {
      setStatus(requestedStatus);
    }
  }, [setStatus]);

  useEffect(() => {
    setSelectedItems([]);
    setDeleteConfirm(null);
    setMachineId('');
    setPage(1);

    if (!selectedProperty) return;

    const currentPageSize = useFilterStore.getState().page_size || 10;
    fetchMaintenanceItems({ page: 1, page_size: currentPageSize, machine_id: '' });
    fetchMachines(selectedProperty);
    fetchStatistics();
  }, [selectedProperty, fetchMaintenanceItems, fetchMachines, fetchStatistics, setMachineId, setPage]);

  // Enhanced machine options with better display
  const machineOptions = useMemo((): MachineOption[] => {
    if (!machines || !Array.isArray(machines)) return [];
    
    const options = machines.map(machine => ({
      id: machine.machine_id,
      label: `${machine.name} (${machine.machine_id})`,
      name: machine.name,
      machine_id: machine.machine_id,
      count: maintenanceItems.filter(item => 
        item.machines?.some((m: any) => m.machine_id === machine.machine_id)
      ).length
    }));
    
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [machines, maintenanceItems]);

  // The stats endpoint is authoritative across every page of the selected
  // property's result set. Never derive KPI totals from the visible page.
  const stats = statistics?.counts as Stats | undefined;
  const canOperate = statistics?.can_operate === true;

  // Get setFilterParams from PM store
  const { setFilterParams } = usePreventiveMaintenanceStore();

  // The filter store is the source of truth for pagination. The PM store keeps
  // the parameters used for the latest request, but must never write an older
  // page back into the UI while a new page request is being prepared.
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      // Ensure page and page_size are always numbers
      const currentPage = Number(page) || 1;
      const currentPageSize = Number(page_size) || 10;
      
      const newParams: Record<string, any> = {
        // Always include page and page_size as numbers
        page: currentPage,
        page_size: currentPageSize,
      };
      
      // Only include non-empty filter values
      if (status && status !== 'all') newParams.status = status;
      if (frequency && frequency !== 'all') newParams.frequency = frequency;
      if (search) newParams.search = search;
      if (start_date) newParams.start_date = start_date;
      if (end_date) newParams.end_date = end_date;
      if (machine_id) newParams.machine_id = machine_id;

      // Check all active and cleared params before updating and fetching.
      // The previous checks only compared truthy UI filter values, so clearing a
      // filter (for example search or machine) could leave the stale backend
      // filter in place and make pagination counts/page links appear wrong.
      const normalizedCurrentPMParams: Record<string, any> = {
        page: Number(pmFilterParams.page) || 1,
        page_size: Number(pmFilterParams.page_size) || 10,
      };

      ['status', 'frequency', 'search', 'start_date', 'end_date', 'machine_id'].forEach((key) => {
        const value = pmFilterParams[key as keyof typeof pmFilterParams];
        if (value !== null && value !== undefined && value !== '') {
          normalizedCurrentPMParams[key] = value;
        }
      });

      const paramsChanged = JSON.stringify(normalizedCurrentPMParams) !== JSON.stringify(newParams);

      if (paramsChanged) {
        const clearedParams = {
          status: '',
          frequency: '',
          search: '',
          start_date: '',
          end_date: '',
          machine_id: '',
          ...newParams,
        };

        // Update the PM store filter params, explicitly clearing filters that
        // are no longer active so stale filters do not affect pagination.
        setFilterParams(clearedParams);
        
        // Trigger fetch with the updated params
        fetchMaintenanceItems(clearedParams);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [status, frequency, search, start_date, end_date, machine_id, page, page_size, fetchMaintenanceItems, setFilterParams, pmFilterParams]);

  // Sorted and filtered data
  const sortedItems = useMemo(() => {
    const sorted = [...maintenanceItems].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
          break;
        case 'status':
          const statusA = determinePMStatus(a).toLowerCase();
          const statusB = determinePMStatus(b).toLowerCase();
          comparison = statusA.localeCompare(statusB);
          break;
        // case 'frequency': removed - frequency column no longer displayed
        case 'machine':
          const machineA = getMachineNames(a.machines);
          const machineB = getMachineNames(b.machines);
          comparison = machineA.localeCompare(machineB);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [maintenanceItems, sortBy, sortOrder]);

  // Utility function to get machine name by ID
  const getMachineNameById = useCallback((machineId: string) => {
    const machine = machines.find(m => m.machine_id === machineId);
    return machine ? machine.name : machineId;
  }, [machines]);

  // Enhanced filter handlers - create a wrapper function
  const handleFilterChangeWrapper = useCallback((key: string, value: string | number) => {
    
    // Map string keys to setter functions
    switch (key) {
      case 'status':
        setStatus(value as string);
        break;
      case 'frequency':
        setFrequency(value as string);
        break;
      case 'search':
        setSearch(value as string);
        break;
      case 'startDate':
        setStartDate(value as string);
        break;
      case 'endDate':
        setEndDate(value as string);
        break;
      case 'page':
        setPage(value as number);
        break;
      case 'pageSize':
        setPageSize(value as number);
        break;
      case 'machine':
        setMachineId(value as string);
        break;
    }
  }, [setStatus, setFrequency, setSearch, setStartDate, setEndDate, setPage, setPageSize, setMachineId]);

  const clearAllFilters = useCallback(() => {
    resetFilters();
    setSelectedItems([]);
  }, [resetFilters]);

  // Enhanced sort handler with correct typing
  const handleSort = useCallback((field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy]);

  // Create a wrapper that accepts string and converts to SortField
   const handleSortWrapper = useCallback((field: string) => {
    // Validate that the field is a valid SortField
    const validSortFields: SortField[] = ['date', 'status', 'machine'];
    if (validSortFields.includes(field as SortField)) {
      handleSort(field as SortField);
    }
  }, [handleSort]);

  // Fixed sort change handler for FilterPanel
  const handleSortChangeAction = useCallback((field: SortField, order: 'asc' | 'desc') => {
    setSortBy(field);
    setSortOrder(order);
  }, []);

  // Selection handlers
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedItems(sortedItems.map(item => item.pm_id));
    } else {
      setSelectedItems([]);
    }
  }, [sortedItems]);

  const handleSelectItem = useCallback((pmId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems(prev => [...prev, pmId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== pmId));
    }
  }, []);

  // Delete handlers
  const handleDelete = useCallback(async (pmId: string) => {
    try {
      const success = await deleteMaintenance(pmId);
      if (success) {
        setDeleteConfirm(null);
        setSelectedItems(prev => prev.filter(id => id !== pmId));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [deleteMaintenance]);

  const handleBulkDelete = useCallback(async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} items?`)) {
      return;
    }

    for (const pmId of selectedItems) {
      await deleteMaintenance(pmId);
    }
    setSelectedItems([]);
  }, [selectedItems, deleteMaintenance]);

  // Refresh handler - preserves current page and filters
  const handleRefresh = useCallback(async () => {
    // Refresh with current pagination and filter params
    await fetchMaintenanceItems({
      page: page || 1,
      page_size: page_size || 10,
      status: status === 'all' ? '' : status || '',
      frequency: frequency === 'all' ? '' : frequency || '',
      search: search || '',
      start_date: start_date || '',
      end_date: end_date || '',
      machine_id: machine_id || '',
    });
  }, [fetchMaintenanceItems, page, page_size, status, frequency, search, start_date, end_date, machine_id]);

  // Pagination - calculate from totalCount and page_size
  const totalPages = useMemo(() => {
    if (!totalCount || totalCount === 0) return 1;
    const currentPageSize = page_size || 10;
    const calculated = Math.ceil(totalCount / currentPageSize);
    return calculated;
  }, [totalCount, page_size]);

  // Validate and fix current page if it exceeds totalPages
  useEffect(() => {
    if (totalPages > 0 && totalCount > 0) {
      const currentPageNum = Number(page) || 1;
      if (currentPageNum > totalPages) {
        console.warn('📄 Current page exceeds totalPages, resetting to page 1:', {
          currentPage: currentPageNum,
          totalPages,
          totalCount,
          page_size
        });
        setPage(totalPages);
      }
    }
  }, [totalPages, totalCount, page, page_size, setPage]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return [
      status,
      frequency,
      search,
      start_date,
      end_date,
      machine_id,
    ].filter(value => value !== '' && value !== null && value !== undefined).length;
  }, [status, frequency, search, start_date, end_date, machine_id]);

  // Create currentFilters object for components that expect it
  const currentFilters = useMemo(() => ({
    status: status || '',
    frequency: frequency || '',
    search: search || '',
    startDate: start_date || '',
    endDate: end_date || '',
    machine: machine_id || '',
    page: page || 1,
    pageSize: page_size || 10
  }), [status, frequency, search, start_date, end_date, machine_id, page, page_size]);

  if (!selectedProperty) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-2xl items-center justify-center px-4 py-12">
        <div className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
          <Building className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Select a property</h1>
          <p className="mt-2 text-muted-foreground">
            Choose an active property from the dashboard header to view and manage its preventive maintenance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 md:pb-8 lg:px-8">
      {/* Mobile Header */}
      <MobileHeader
        totalCount={totalCount}
        overdueCount={stats?.overdue}
        currentFilters={currentFilters}
        isLoading={isLoading}
        showFilters={showFilters}
        activeFiltersCount={activeFiltersCount}
        canOperate={canOperate}
        onRefresh={handleRefresh}
        onToggleFilters={() => setShowFilters(!showFilters)}
      />

      {/* Desktop Header */}
      <DesktopHeader
        currentFilters={currentFilters}
        isLoading={isLoading}
        showFilters={showFilters}
        activeFiltersCount={activeFiltersCount}
        canOperate={canOperate}
        getMachineNameById={getMachineNameById}
        onRefresh={handleRefresh}
        onToggleFilters={() => setShowFilters(!showFilters)}
      />

      {/* Stats Cards */}
      {stats && (
        <div className="w-full">
          <StatsCards stats={stats} />
        </div>
      )}

      <div className="w-full space-y-5">
        {/* Error Display */}
        {error && (
          <ErrorDisplay error={error} onClear={clearError} />
        )}

        {/* Filter Panel */}
        {showFilters && (
          <FilterPanel
            currentFilters={currentFilters}
            machineOptions={machineOptions}
            totalCount={totalCount}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onFilterChangeAction={handleFilterChangeWrapper}
            onClearFiltersAction={clearAllFilters}
            onSortChangeAction={handleSortChangeAction}
          />
        )}

        {/* Bulk Actions */}
        {canOperate && selectedItems.length > 0 && (
          <BulkActions
            selectedCount={selectedItems.length}
            onBulkDelete={handleBulkDelete}
            onClear={() => setSelectedItems([])}
          />
        )}

        {/* Main Content */}
        {isLoading && maintenanceItems.length === 0 ? (
          <LoadingState />
        ) : sortedItems.length === 0 ? (
          <EmptyState 
            hasFilters={activeFiltersCount > 0}
            currentFilters={currentFilters}
            onClearFilters={clearAllFilters}
            getMachineNameById={getMachineNameById}
          />
        ) : (
          <div className="relative">
            {/* Show loading overlay when refreshing existing data */}
            {isLoading && maintenanceItems.length > 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"></div>
                  <span className="text-sm font-medium text-muted-foreground">Refreshing...</span>
                </div>
              </div>
            )}
            <MaintenanceList
              items={sortedItems}
              selectedItems={selectedItems}
              onSelectAll={handleSelectAll}
              onSelectItem={handleSelectItem}
              onSort={handleSortWrapper}
              onDelete={setDeleteConfirm}
              sortBy={sortBy}
              sortOrder={sortOrder}
              formatDate={formatDate}
              getMachineNames={getMachineNames}
              getStatusInfo={getStatusInfo}
              canOperate={canOperate}
            />
          </div>
        )}

        {/* Pagination */}
        {(() => {
          const currentPageSize = page_size || 10;
          const calculatedTotalPages = totalCount > 0 ? Math.ceil(totalCount / currentPageSize) : 0;
          const currentPage = Number(page) || 1;
          const shouldShowPagination = calculatedTotalPages > 1 && totalCount > 0;
          
          // Ensure current page is valid (useEffect above will fix it, but validate here too)
          const validCurrentPage = calculatedTotalPages > 0 
            ? Math.max(1, Math.min(currentPage, calculatedTotalPages))
            : 1;
          
          if (shouldShowPagination) {
            return (
              <Pagination
                currentPage={validCurrentPage}
                totalPages={calculatedTotalPages}
                pageSize={currentPageSize}
                totalCount={totalCount}
                onPageChange={(newPage) => {
                  // Validate the new page before changing
                  if (newPage < 1 || (calculatedTotalPages > 0 && newPage > calculatedTotalPages)) {
                    console.warn('📄 Invalid page requested:', { newPage, calculatedTotalPages, totalCount });
                    return;
                  }
                  handleFilterChangeWrapper('page', newPage);
                }}
                onPageSizeChange={(newSize) => {
                  // setPageSize resets page to 1 in the same store update.
                  setPageSize(newSize);
                }}
              />
            );
          }
          return null;
        })()}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              showFilters ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary'
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {activeFiltersCount}
              </span>
            )}
          </button>
          
          {canOperate && (
            <Link
              href="/dashboard/preventive-maintenance/create"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Maintenance
            </Link>
          )}
          
        </div>
      </div>

      {/* Delete Modal */}
      {deleteConfirm && (
        <DeleteModal
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

export default function PreventiveMaintenanceListPage() {
  return <PreventiveMaintenanceListPageContent />;
}
