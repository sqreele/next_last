'use client';

import React from 'react';
import Link from 'next/link';
import { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import { Eye, Edit, Trash2, MoreVertical, CheckCircle, AlertCircle, Clock, Calendar, Wrench, Clipboard } from 'lucide-react';

interface MaintenanceItemProps {
  item: PreventiveMaintenance;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onDelete: (id: string) => void;
  formatDate: (date: string) => string;
  getMachineNames: (machines: any) => string;
  getStatusInfo: (item: PreventiveMaintenance) => any;
  // getFrequencyText removed - frequency no longer displayed
}

const MaintenanceItem: React.FC<MaintenanceItemProps> = ({
  item,
  isSelected,
  onSelect,
  onDelete,
  formatDate,
  getMachineNames,
  getStatusInfo,
  // getFrequencyText removed
}) => {
  const statusInfo = getStatusInfo(item);

  return (
    <div className="px-4 md:px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start md:items-center">
        {/* Desktop Checkbox */}
        <div className="hidden md:block">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex-1 md:ml-4">
          {/* Mobile Layout */}
          <div className="md:hidden">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(e.target.checked)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <Link 
                    href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
                  >
                    {item.pmtitle || `Task ${item.pm_id}`}
                  </Link>
                </div>
                
                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    <span>{formatDate(item.scheduled_date)}</span>
                  </div>
                  <div className="flex items-center">
                    <Wrench className="h-3 w-3 mr-1" />
                    <span>{getMachineNames(item.machines)}</span>
                  </div>
                  {(item as any).procedure_template_id && (
                    <div className="flex items-center">
                      <Clipboard className="h-3 w-3 mr-1" />
                      <span className="truncate">
                        {(item as any).procedure_template_name || `Task #${(item as any).procedure_template_id}`}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                    {statusInfo.text}
                  </span>
                  
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                      className="p-1 text-blue-600 hover:text-blue-800"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                      className="p-1 text-gray-600 hover:text-gray-800"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => onDelete(item.pm_id)}
                      className="p-1 text-red-600 hover:text-red-800"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:block">
            <div className="grid grid-cols-5 gap-4 items-center">
              <div className="text-sm text-gray-900">
                <Link 
                  href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                  className="font-medium hover:text-blue-600 block"
                >
                  {item.pmtitle || `Task ${item.pm_id}`}
                </Link>
                <div className="text-xs text-gray-500">{formatDate(item.scheduled_date)}</div>
              </div>
              
              <div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.text}
                </span>
              </div>
              
              <div className="text-sm text-gray-900 truncate">
                {getMachineNames(item.machines)}
              </div>
              
              <div className="text-sm text-gray-900">
                {(item as any).procedure_template_id ? (
                  <Link 
                    href={`/dashboard/maintenance-tasks/${(item as any).procedure_template_id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                    title={(item as any).procedure_template_name || `Task #${(item as any).procedure_template_id}`}
                  >
                    <div className="flex items-center gap-1">
                      <Clipboard className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {(item as any).procedure_template_name || `Task #${(item as any).procedure_template_id}`}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <span className="text-gray-400 text-xs">No template</span>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <Link
                  href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                  className="p-1 text-blue-600 hover:text-blue-800"
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Link>
                <Link
                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                  className="p-1 text-gray-600 hover:text-gray-800"
                  title="Edit"
                >
                  <Edit className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => onDelete(item.pm_id)}
                  className="p-1 text-red-600 hover:text-red-800"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceItem;