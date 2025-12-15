'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { logger } from '@/app/lib/utils/logger';
import { useRouter } from 'next/navigation';
import { usePreventiveMaintenanceActions } from '@/app/lib/hooks/usePreventiveMaintenanceActions';
import { useFilterStore } from '@/app/lib/stores';
import { useAuthStore } from '@/app/lib/stores/useAuthStore';
import { usePreventiveMaintenanceStore } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';

// Import types
import { FilterState, MachineOption, Stats } from '@/app/lib/hooks/filterTypes';

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
import { Filter, Plus, FileText, CheckCircle2, AlertTriangle, XCircle, Building } from 'lucide-react';

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
  const router = useRouter();
  const { selectedProperty } = useAuthStore();
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
    topics,
    machines,
    isLoading,
    error,
    fetchMaintenanceItems,
    deleteMaintenance,
    clearError,
    totalCount,
    filterParams: pmFilterParams
  } = usePreventiveMaintenanceActions();
  
  // Mock functions for backward compatibility
  const debugMachineFilter = useCallback(async (machineId: string) => {
    logger.debug('Debug machine filter', { machineId });
  }, []);
  
  const testMachineFiltering = useCallback(() => {
    logger.debug('Test machine filtering');
  }, []);

  // Now using real data from context - removed mock implementations

  // Debug logging
  console.log('🔍 PreventiveMaintenanceListPage Debug:', {
    maintenanceItemsCount: maintenanceItems?.length || 0,
    machinesCount: machines?.length || 0,
    totalCount,
    isLoading,
    error,
    status,
    frequency,
    search,
    start_date,
    end_date,
    machine_id,
    page,
    page_size,
    totalPages: Math.ceil(totalCount / (page_size || 10))
  });

  // Manual data fetching if no data is present - preserve current pagination
  useEffect(() => {
    console.log('🔍 Component mounted, checking data...');
    console.log('🔍 Selected Property:', selectedProperty);
    if (maintenanceItems.length === 0 && !isLoading && !error) {
      console.log('🔍 No data found, manually fetching...');
      // Use current pagination params when fetching
      fetchMaintenanceItems({
        page: page || 1,
        page_size: page_size || 10,
      });
    }
  }, [maintenanceItems.length, isLoading, error, selectedProperty, fetchMaintenanceItems, page, page_size]);

  // Re-fetch data when selectedProperty changes - preserve current pagination
  useEffect(() => {
    console.log('=== PREVENTIVE MAINTENANCE LIST - PROPERTY CHANGE DEBUG ===');
    console.log('[Property Change] Selected Property:', selectedProperty);
    console.log('[Property Change] Will trigger data refetch');
    
    if (selectedProperty !== null && selectedProperty !== undefined) {
      console.log('[Property Change] Fetching maintenance items for property:', selectedProperty);
      // Reset to page 1 when property changes, but preserve page_size
      fetchMaintenanceItems({
        page: 1, // Reset to first page when property changes
        page_size: page_size || 10,
      });
      // Also update the filter store to reset page
      setPage(1);
    }
  }, [selectedProperty, fetchMaintenanceItems, page_size, setPage]);

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

  // Verify preventive maintenance item's machines against selected property
  const verifyPMProperty = useCallback((item: PreventiveMaintenance): { matches: boolean; message: string; machinesAtProperty: number; totalMachines: number } => {
    if (!selectedProperty) {
      return { matches: true, message: 'No property selected', machinesAtProperty: 0, totalMachines: 0 };
    }
    
    if (!item.machines || !Array.isArray(item.machines) || item.machines.length === 0) {
      return { matches: true, message: 'No machines assigned', machinesAtProperty: 0, totalMachines: 0 };
    }
    
    // Check each machine's property
    const machinesAtProperty = item.machines.filter((machine: any) => {
      // Machine can have property_id directly or through property object
      const machinePropertyId = machine.property_id || machine.property?.property_id;
      return machinePropertyId === selectedProperty;
    }).length;
    
    const totalMachines = item.machines.length;
    const matches = machinesAtProperty === totalMachines && totalMachines > 0;
    
    if (matches) {
      return { 
        matches: true, 
        message: `All ${totalMachines} equipment item${totalMachines !== 1 ? 's' : ''} verified at selected property`,
        machinesAtProperty,
        totalMachines
      };
    } else if (machinesAtProperty > 0) {
      return { 
        matches: false, 
        message: `${machinesAtProperty} of ${totalMachines} equipment item${totalMachines !== 1 ? 's' : ''} at selected property`,
        machinesAtProperty,
        totalMachines
      };
    } else {
      return { 
        matches: false, 
        message: `None of the ${totalMachines} equipment item${totalMachines !== 1 ? 's' : ''} are at the selected property`,
        machinesAtProperty,
        totalMachines
      };
    }
  }, [selectedProperty]);

  // Enhanced stats calculation
  const stats = useMemo((): Stats => {
    const completed = maintenanceItems.filter(item => item.completed_date).length;
    const overdue = maintenanceItems.filter(item => 
      !item.completed_date && new Date(item.scheduled_date) < new Date()
    ).length;
    const pending = maintenanceItems.filter(item => 
      !item.completed_date && new Date(item.scheduled_date) >= new Date()
    ).length;
    
    return { total: maintenanceItems.length, completed, overdue, pending };
  }, [maintenanceItems]);

  // Get setFilterParams from PM store
  const { setFilterParams } = usePreventiveMaintenanceStore();

  // Track if we're syncing to prevent loops
  const isSyncingRef = useRef(false);

  // Sync PM store filterParams back to useFilterStore when updated from backend response
  // This ensures both stores stay in sync after backend responses
  useEffect(() => {
    if (pmFilterParams.page !== undefined && pmFilterParams.page_size !== undefined) {
      const pmPage = Number(pmFilterParams.page) || 1;
      const pmPageSize = Number(pmFilterParams.page_size) || 10;
      const currentPage = Number(page) || 1;
      const currentPageSize = Number(page_size) || 10;
      
      // Only sync if different and we're not already syncing to avoid infinite loops
      if (!isSyncingRef.current && (currentPage !== pmPage || currentPageSize !== pmPageSize)) {
        isSyncingRef.current = true;
        const syncTimer = setTimeout(() => {
          console.log('📄 Syncing PM store pagination back to filter store:', {
            filterStore: { page: currentPage, page_size: currentPageSize },
            pmStore: { page: pmPage, page_size: pmPageSize }
          });
          setPage(pmPage);
          setPageSize(pmPageSize);
          // Reset sync flag after a delay to allow the main sync effect to run
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 500);
        }, 100);
        
        return () => clearTimeout(syncTimer);
      }
    }
  }, [pmFilterParams.page, pmFilterParams.page_size, page, page_size, setPage, setPageSize]);

  // Sync filter store with PM store and fetch data when filters change
  useEffect(() => {
    // Skip if we're in the middle of syncing to prevent loops
    if (isSyncingRef.current) {
      return;
    }

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

      console.log('Filter sync - current values:', { status, frequency, search, start_date, end_date, machine_id, page, page_size });
      console.log('Filter sync - newParams (cleaned):', newParams);
      console.log('📄 Pagination:', { page: currentPage, page_size: currentPageSize });

      // Check if params actually changed before updating and fetching
      const currentPMParams = pmFilterParams;
      const paramsChanged = 
        currentPMParams.page !== currentPage ||
        currentPMParams.page_size !== currentPageSize ||
        (status && status !== 'all' && currentPMParams.status !== status) ||
        (frequency && frequency !== 'all' && currentPMParams.frequency !== frequency) ||
        (search && currentPMParams.search !== search) ||
        (start_date && currentPMParams.start_date !== start_date) ||
        (end_date && currentPMParams.end_date !== end_date) ||
        (machine_id && currentPMParams.machine_id !== machine_id);

      if (paramsChanged) {
        // Update the PM store filter params
        setFilterParams(newParams);
        
        // Trigger fetch with the updated params
        fetchMaintenanceItems(newParams);
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
          const statusA = a.completed_date ? 'completed' : new Date(a.scheduled_date) < new Date() ? 'overdue' : 'pending';
          const statusB = b.completed_date ? 'completed' : new Date(b.scheduled_date) < new Date() ? 'overdue' : 'pending';
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

  // Count PM items matching selected property (must be after sortedItems)
  const matchingPMItems = useMemo(() => {
    return sortedItems.filter(item => verifyPMProperty(item).matches);
  }, [sortedItems, verifyPMProperty]);

  const mismatchedPMItems = useMemo(() => {
    return sortedItems.filter(item => {
      const verification = verifyPMProperty(item);
      return !verification.matches && verification.totalMachines > 0;
    });
  }, [sortedItems, verifyPMProperty]);

  // Utility function to get machine name by ID
  const getMachineNameById = useCallback((machineId: string) => {
    const machine = machines.find(m => m.machine_id === machineId);
    return machine ? machine.name : machineId;
  }, [machines]);

  // Enhanced filter handlers - create a wrapper function
  const handleFilterChangeWrapper = useCallback((key: string, value: string | number) => {
    console.log('Filter change:', key, value);
    
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
    console.log('Clearing all filters');
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
    console.log('Sort change:', field, order);
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
    console.log('Refreshing data...', { currentPage: page, pageSize: page_size });
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

  // DEBUG handlers
  const handleDebugMachine = useCallback(async () => {
    await debugMachineFilter('M257E5AC03B');
  }, [debugMachineFilter]);

  // Pagination - calculate from totalCount and page_size
  const totalPages = useMemo(() => {
    if (!totalCount || totalCount === 0) return 1;
    const currentPageSize = page_size || 10;
    const calculated = Math.ceil(totalCount / currentPageSize);
    console.log('📄 Calculating totalPages:', { totalCount, page_size: currentPageSize, calculated });
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
        setPage(1);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <MobileHeader
        totalCount={totalCount}
        overdueCount={stats.overdue}
        currentFilters={currentFilters}
        isLoading={isLoading}
        showFilters={showFilters}
        activeFiltersCount={activeFiltersCount}
        onRefresh={handleRefresh}
        onToggleFilters={() => setShowFilters(!showFilters)}
      />

      {/* Desktop Header */}
      <DesktopHeader
        currentFilters={currentFilters}
        isLoading={isLoading}
        showFilters={showFilters}
        activeFiltersCount={activeFiltersCount}
        getMachineNameById={getMachineNameById}
        onRefresh={handleRefresh}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onTestFiltering={testMachineFiltering}
        onDebugMachine={handleDebugMachine}
      />

      {/* Property Verification Info */}
      {selectedProperty && (
        <div className="container mx-auto px-4 mb-4">
          <div className="text-sm text-gray-600">
            {matchingPMItems.length} verified • {mismatchedPMItems.length} at different property
          </div>
        </div>
      )}

      {/* Property Verification Alert */}
      {selectedProperty && mismatchedPMItems.length > 0 && (
        <div className="container mx-auto px-4 mb-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 mb-1">Location Verification</h3>
                <p className="text-sm text-orange-800">
                  {mismatchedPMItems.length} maintenance task{mismatchedPMItems.length !== 1 ? 's' : ''} {mismatchedPMItems.length === 1 ? 'has' : 'have'} equipment located at a different property than the selected one.
                </p>
                <p className="text-xs text-orange-700 mt-2">
                  These tasks will still be displayed but may include equipment from other properties.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Property Match Confirmation */}
      {selectedProperty && mismatchedPMItems.length === 0 && matchingPMItems.length > 0 && (
        <div className="container mx-auto px-4 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  ✓ All displayed maintenance tasks have equipment verified to be at the selected property location.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="hidden md:block container mx-auto px-4">
        <StatsCards stats={stats} />
      </div>

      <div className="md:container md:mx-auto md:px-4">
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
        {selectedItems.length > 0 && (
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
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="text-sm text-gray-600">Refreshing...</span>
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
              currentFilters={currentFilters}
              verifyPMProperty={verifyPMProperty}
              selectedProperty={selectedProperty}
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
          
          console.log('📄 Pagination render check:', {
            totalCount,
            page_size: currentPageSize,
            calculatedTotalPages,
            shouldShow: shouldShowPagination,
            currentPage: validCurrentPage,
            originalPage: currentPage,
            hasItems: maintenanceItems.length > 0
          });
          
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
                  console.log('📄 Page change requested:', newPage);
                  handleFilterChangeWrapper('page', newPage);
                }}
                onPageSizeChange={(newSize) => {
                  console.log('📄 Page size change requested:', newSize);
                  // Reset to page 1 when changing page size
                  handleFilterChangeWrapper('page', 1);
                  handleFilterChangeWrapper('pageSize', newSize);
                }}
              />
            );
          }
          return null;
        })()}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center px-4 py-2 border rounded-lg transition-colors ${
              showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
          
          <Link
            href="/dashboard/preventive-maintenance/create"
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Maintenance
          </Link>
          
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