"use client";

import React from "react";
import Link from "next/link";
import { PreventiveMaintenance } from "@/app/lib/preventiveMaintenanceModels";
import {
  Eye,
  Edit,
  Trash2,
  Clock,
  Calendar,
  Wrench,
  Clipboard,
} from "lucide-react";
import { StatusBadge } from "@/app/components/StatusBadge";

interface MaintenanceItemProps {
  item: PreventiveMaintenance;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onDelete: (id: string) => void;
  formatDate: (date: string) => string;
  getMachineNames: (machines: PreventiveMaintenance["machines"]) => string;
  getStatusInfo: (item: PreventiveMaintenance) => {
    text: string;
    color: string;
    icon: string;
  };
  canOperate: boolean;
}

const MaintenanceItem: React.FC<MaintenanceItemProps> = ({
  item,
  isSelected,
  onSelect,
  onDelete,
  formatDate,
  getMachineNames,
  getStatusInfo,
  canOperate,
}) => {
  const statusInfo = getStatusInfo(item);

  return (
    <div className="px-4 md:px-6 py-4 hover:bg-muted transition-colors">
      <div className="flex items-start md:items-center">
        {/* Desktop Checkbox */}
        {canOperate && <div className="hidden md:block">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${item.pmtitle || `task ${item.pm_id}`}`}
            className="h-4 w-4 text-blue-600 rounded border-border focus:ring-blue-500"
          />
        </div>}

        <div className="flex-1 md:ml-4">
          {/* Mobile Layout */}
          <div className="md:hidden">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  {canOperate && <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(e.target.checked)}
                    aria-label={`Select ${item.pmtitle || `task ${item.pm_id}`}`}
                    className="h-5 w-5 flex-none rounded border-border text-blue-600 focus:ring-blue-500"
                  />}
                  <Link
                    href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                    className="min-w-0 text-base font-semibold text-foreground hover:text-blue-600"
                  >
                    {item.pmtitle || `Task ${item.pm_id}`}
                  </Link>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    <span>{formatDate(item.scheduled_date)}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    <span>
                      Next due:{" "}
                      {item.next_due_date
                        ? formatDate(item.next_due_date)
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Wrench className="h-3 w-3 mr-1" />
                    <span>{getMachineNames(item.machines)}</span>
                  </div>
                  {item.procedure_template_id && (
                    <div className="flex items-center">
                      <Clipboard className="h-3 w-3 mr-1" />
                      <span className="truncate">
                        {item.procedure_template_name ||
                          `Task #${item.procedure_template_id}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <StatusBadge status={statusInfo.text} />

                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                      className="grid h-11 w-11 place-items-center rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                      title="View Details"
                      aria-label={`View ${item.pmtitle || `task ${item.pm_id}`}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    {canOperate && <Link
                      href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                      className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                      aria-label={`Edit ${item.pmtitle || `task ${item.pm_id}`}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Link>}
                    {canOperate && <button
                      onClick={() => onDelete(item.pm_id)}
                      className="grid h-11 w-11 place-items-center rounded-lg text-red-600 hover:bg-red-50 hover:text-red-800"
                      title="Delete"
                      aria-label={`Delete ${item.pmtitle || `task ${item.pm_id}`}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:block">
            <div className="grid grid-cols-6 gap-4 items-center">
              <div className="text-sm text-foreground">
                <Link
                  href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                  className="font-medium hover:text-blue-600 block"
                >
                  {item.pmtitle || `Task ${item.pm_id}`}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {formatDate(item.scheduled_date)}
                </div>
              </div>

              <div className="text-sm text-foreground">
                <div className="text-xs text-muted-foreground">Next due</div>
                <div>
                  {item.next_due_date ? formatDate(item.next_due_date) : "N/A"}
                </div>
              </div>

              <div>
                <StatusBadge status={statusInfo.text} />
              </div>

              <div className="text-sm text-foreground truncate">
                <div className="flex items-center gap-2">
                  <span className="truncate">
                    {getMachineNames(item.machines)}
                  </span>
                </div>
              </div>

              <div className="text-sm text-foreground">
                {item.procedure_template_id ? (
                  <Link
                    href={`/dashboard/maintenance-tasks/${item.procedure_template_id}`}
                    className="text-primary hover:underline"
                    title={
                      item.procedure_template_name ||
                      `Task #${item.procedure_template_id}`
                    }
                  >
                    <div className="flex items-center gap-1">
                      <Clipboard className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {item.procedure_template_name ||
                          `Task #${item.procedure_template_id}`}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    No template
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Link
                  href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                  title="View Details"
                  aria-label={`View ${item.pmtitle || `task ${item.pm_id}`}`}
                >
                  <Eye className="h-4 w-4" />
                </Link>
                {canOperate && <Link
                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Edit"
                  aria-label={`Edit ${item.pmtitle || `task ${item.pm_id}`}`}
                >
                  <Edit className="h-4 w-4" />
                </Link>}
                {canOperate && <button
                  onClick={() => onDelete(item.pm_id)}
                  className="grid h-11 w-11 place-items-center rounded-lg text-red-600 hover:bg-red-50 hover:text-red-800"
                  title="Delete"
                  aria-label={`Delete ${item.pmtitle || `task ${item.pm_id}`}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceItem;
