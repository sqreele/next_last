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
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
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
  // getFrequencyText removed - frequency no longer displayed
  verifyPMProperty?: (item: PreventiveMaintenance) => {
    matches: boolean;
    message: string;
    machinesAtProperty: number;
    totalMachines: number;
  };
  selectedProperty?: string | null;
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
  verifyPMProperty,
  selectedProperty,
}) => {
  const statusInfo = getStatusInfo(item);
  const verification =
    verifyPMProperty && selectedProperty ? verifyPMProperty(item) : null;

  return (
    <div className="px-4 md:px-6 py-4 hover:bg-muted transition-colors">
      <div className="flex items-start md:items-center">
        {/* Desktop Checkbox */}
        <div className="hidden md:block">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded border-border focus:ring-blue-500"
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
                    className="h-4 w-4 text-blue-600 rounded border-border focus:ring-blue-500"
                  />
                  <Link
                    href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                    className="text-sm font-medium text-foreground hover:text-blue-600 truncate"
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
                      className="p-1 text-blue-600 hover:text-blue-800"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                      className="p-1 text-muted-foreground hover:text-foreground"
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
                  {verification && verification.totalMachines > 0 && (
                    <Badge
                      variant="outline"
                      className={`text-xs flex-shrink-0 ${
                        verification.matches
                          ? "bg-green-50 text-green-700 border-green-300"
                          : "bg-orange-50 text-orange-700 border-orange-300"
                      }`}
                      title={verification.message}
                    >
                      {verification.matches ? (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      ) : (
                        <XCircle className="h-3 w-3 mr-1" />
                      )}
                      {verification.machinesAtProperty}/
                      {verification.totalMachines}
                    </Badge>
                  )}
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
                  className="p-1 text-blue-600 hover:text-blue-800"
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Link>
                <Link
                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                  className="p-1 text-muted-foreground hover:text-foreground"
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
