"use client";

import React from "react";
import Link from "next/link";
import {
  PreventiveMaintenance,
  determinePMStatus,
} from "@/app/lib/preventiveMaintenanceModels";
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
  const canonicalStatus = determinePMStatus(item).toLowerCase();
  const statusSurface = canonicalStatus === "overdue"
    ? "border-l-destructive bg-destructive/[0.03]"
    : canonicalStatus === "completed"
      ? "border-l-success bg-success/[0.03]"
      : "border-l-transparent bg-card";

  return (
    <article className={`border-l-4 px-4 py-4 transition-colors hover:bg-muted/60 sm:px-5 lg:px-6 ${statusSurface}`}>
      <div className="flex items-start xl:items-center">
        {/* Desktop Checkbox */}
        {canOperate && <div className="hidden xl:block">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${item.pmtitle || `task ${item.pm_id}`}`}
            className="h-5 w-5 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>}

        <div className="min-w-0 flex-1 xl:ml-4">
          {/* Mobile Layout */}
          <div className="xl:hidden">
            <div className="flex min-w-0 items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex min-w-0 items-start gap-2">
                  {canOperate && <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(e.target.checked)}
                    aria-label={`Select ${item.pmtitle || `task ${item.pm_id}`}`}
                    className="mt-0.5 h-5 w-5 flex-none rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />}
                  <Link
                    href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                    className="min-w-0 break-words text-base font-semibold leading-5 text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {item.pmtitle || `Task ${item.pm_id}`}
                  </Link>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">Scheduled {formatDate(item.scheduled_date)}</span>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      Next due:{" "}
                      {item.next_due_date
                        ? formatDate(item.next_due_date)
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{getMachineNames(item.machines)}</span>
                  </div>
                  {item.procedure_template_id && (
                    <div className="flex min-w-0 items-start gap-2">
                      <Clipboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 break-words">
                        {item.procedure_template_name ||
                          `Task #${item.procedure_template_id}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
                  <StatusBadge status={statusInfo.text} />

                  <div className="ml-auto flex items-center gap-1">
                    <Link
                      href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                      className="grid h-11 w-11 place-items-center rounded-lg text-primary hover:bg-primary/10 hover:text-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title="View Details"
                      aria-label={`View ${item.pmtitle || `task ${item.pm_id}`}`}
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {canOperate && <Link
                      href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                      className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title="Edit"
                      aria-label={`Edit ${item.pmtitle || `task ${item.pm_id}`}`}
                    >
                      <Edit className="h-4 w-4" aria-hidden="true" />
                    </Link>}
                    {canOperate && <button
                      onClick={() => onDelete(item.pm_id)}
                      className="grid h-11 w-11 place-items-center rounded-lg text-destructive hover:bg-destructive/10 hover:text-[hsl(var(--destructive-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title="Delete"
                      aria-label={`Delete ${item.pmtitle || `task ${item.pm_id}`}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden xl:block">
            <div className="grid min-w-0 grid-cols-[1.25fr_1fr_0.9fr_1.2fr_1.2fr_8.5rem] items-center gap-4">
              <div className="text-sm text-foreground">
                <Link
                  href={`/dashboard/preventive-maintenance/${item.pm_id}`}
                  className="block break-words font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

              <div className="min-w-0 truncate text-sm text-foreground">
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
                    className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  className="grid h-11 w-11 place-items-center rounded-lg text-primary hover:bg-primary/10 hover:text-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title="View Details"
                  aria-label={`View ${item.pmtitle || `task ${item.pm_id}`}`}
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </Link>
                {canOperate && <Link
                  href={`/dashboard/preventive-maintenance/edit/${item.pm_id}`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title="Edit"
                  aria-label={`Edit ${item.pmtitle || `task ${item.pm_id}`}`}
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                </Link>}
                {canOperate && <button
                  onClick={() => onDelete(item.pm_id)}
                  className="grid h-11 w-11 place-items-center rounded-lg text-destructive hover:bg-destructive/10 hover:text-[hsl(var(--destructive-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title="Delete"
                  aria-label={`Delete ${item.pmtitle || `task ${item.pm_id}`}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

export default MaintenanceItem;
