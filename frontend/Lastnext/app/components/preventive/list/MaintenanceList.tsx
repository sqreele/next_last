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
  canOperate: boolean;
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
  canOperate,
}) => {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-label="Preventive maintenance tasks">
      {/* Desktop Header */}
      <div className="hidden border-b border-border bg-muted/50 px-5 py-3 xl:block">
        <div className="flex items-center">
          {canOperate && <div className="w-8 shrink-0">
            <input
              type="checkbox"
              checked={selectedItems.length === items.length && items.length > 0}
              onChange={(e) => onSelectAll(e.target.checked)}
              aria-label="Select all maintenance tasks on this page"
              className="h-5 w-5 rounded-sm border-input text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>}
          
          <div className="ml-4 grid min-w-0 flex-1 grid-cols-[1.25fr_1fr_0.9fr_1.2fr_1.2fr_8.5rem] gap-4">
            <button
              onClick={() => onSort('date')}
              className="min-h-10 rounded-md text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Date {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>

            <div className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Next Due
            </div>
            
            <button
              onClick={() => onSort('status')}
              className="min-h-10 rounded-md text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            
            <button
              onClick={() => onSort('machine')}
              className="min-h-10 rounded-md text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            canOperate={canOperate}
          />
        ))}
      </div>
    </section>
  );
};

export default MaintenanceList;
