'use client';

import React from 'react';
import { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import MaintenanceItem from './MaintenanceItem';

// Define the sort field type
type SortField = 'date' | 'status' | 'machine';
type StatusInfo = { text: string; color: string; icon: string };

interface MaintenanceListProps {
  items: PreventiveMaintenance[];
  selectedItems: string[];
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (id: string, checked: boolean) => void;
  onSort: (field: string) => void;
  onDelete: (id: string) => void;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  formatDate: (date: string) => string;
  getMachineNames: (machines: PreventiveMaintenance['machines']) => string;
  getStatusInfo: (item: PreventiveMaintenance) => StatusInfo;
  // getFrequencyText removed - frequency no longer displayed
  verifyPMProperty?: (item: PreventiveMaintenance) => { matches: boolean; message: string; machinesAtProperty: number; totalMachines: number };
  selectedProperty?: string | null;
}

const MaintenanceList: React.FC<MaintenanceListProps> = ({
  items,
  selectedItems,
  onSelectAll,
  onSelectItem,
  onSort,
  onDelete,
  sortBy,
  sortOrder,
  formatDate,
  getMachineNames,
  getStatusInfo,
  // getFrequencyText removed
  verifyPMProperty,
  selectedProperty,
}) => {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      {/* Desktop Header */}
      <div className="hidden border-b border-border bg-muted/50 px-5 py-3 md:block">
        <div className="flex items-center">
          <div className="w-8">
            <input
              type="checkbox"
              checked={selectedItems.length === items.length && items.length > 0}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
          </div>
          
          <div className="flex-1 grid grid-cols-6 gap-4 ml-4">
            <button
              onClick={() => onSort('date')}
              className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground focus:outline-none"
            >
              Date {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>

            <div className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Next Due
            </div>
            
            <button
              onClick={() => onSort('status')}
              className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground focus:outline-none"
            >
              Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            
            <button
              onClick={() => onSort('machine')}
              className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground focus:outline-none"
            >
              Machine {sortBy === 'machine' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            
            <div className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Task Template
            </div>
            
            <div className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Actions
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-border">
        {items.map((item) => (
          <MaintenanceItem
            key={item.pm_id}
            item={item}
            isSelected={selectedItems.includes(item.pm_id)}
            onSelect={(checked) => onSelectItem(item.pm_id, checked)}
            onDelete={onDelete}
            formatDate={formatDate}
            getMachineNames={getMachineNames}
            getStatusInfo={getStatusInfo}
            verifyPMProperty={verifyPMProperty}
            selectedProperty={selectedProperty}
          />
        ))}
      </div>
    </div>
  );
};

export default MaintenanceList;
