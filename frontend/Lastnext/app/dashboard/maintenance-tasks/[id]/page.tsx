"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/lib/session.client";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import { fetchMaintenanceProcedure } from "@/app/lib/maintenanceProcedures";
import type { MaintenanceProcedureDetail } from "@/app/lib/api/maintenance-procedure-contracts";
import type { PMListItem, PMListResponse } from "@/app/lib/api/pm-contracts";
import apiClient from "@/app/lib/api-client";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { StatusBadge } from "@/app/components/StatusBadge";
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Users,
  FileText,
  Shield,
  History,
  Calendar,
  User,
} from "lucide-react";
import Link from "next/link";
import { getDisplayName } from "@/app/lib/utils/display-name";

export default function MaintenanceTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Unwrap params using React.use() for Next.js 15 compatibility
  const unwrappedParams = use(params);
  const { status } = useSession();
  const router = useRouter();
  const { selectedProperty } = useAuthStore();
  const [task, setTask] = useState<MaintenanceProcedureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<PMListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setLoading);

  // Debug logging for property changes
  useEffect(() => {}, [
    selectedProperty,
    unwrappedParams.id,
    task?.id,
    task?.name,
  ]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  // Memoize fetchMaintenanceHistory to prevent infinite loops
  const fetchMaintenanceHistory = useCallback(
    async (taskTemplateId: number) => {
      setLoadingHistory(true);
      try {
        // Build API params
        const apiParams: { page_size: number; property_id?: string } = { page_size: 100 };
        if (selectedProperty) {
          apiParams.property_id = selectedProperty;
        }

        // Fetch preventive maintenance records (filtered by property if selected)
        const response = await apiClient.get<PMListResponse>(
          "/api/v1/preventive-maintenance/",
          {
            params: apiParams,
          },
        );

        const historyData: PMListItem[] = response.data.results;

        if (historyData.length > 0) {
        }

        // Filter to show records that use this task template
        const filtered = historyData.filter((record) => {
          // Match by procedure_template or procedure_template_id
          const matchesTemplate =
            record.procedure_template === taskTemplateId ||
            record.procedure_template_id === taskTemplateId;
          return matchesTemplate;
        });
        if (filtered.length > 0) {
        }

        setMaintenanceHistory(filtered);
      } catch (err: unknown) {
        console.error("[Maintenance History] Error:", err);
        // Don't set error, just leave history empty
        setMaintenanceHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    },
    [selectedProperty],
  ); // Add selectedProperty to dependencies

  // Memoize fetchTask to prevent infinite loops
  const fetchTask = useCallback(async () => {
    recordLoaderShown();
    setLoading(true);
    setError(null);
    try {
      const procedure = await fetchMaintenanceProcedure(unwrappedParams.id);
      setTask(procedure);

      // Fetch maintenance history for this task template
      fetchMaintenanceHistory(procedure.id);
    } catch (err: unknown) {
      console.error("Error fetching task:", err);
      setError(err instanceof Error ? err.message : "Failed to load task details");
    } finally {
      clearLoadingAfterMinTime();
    }
  }, [
    unwrappedParams.id,
    fetchMaintenanceHistory,
    recordLoaderShown,
    clearLoadingAfterMinTime,
  ]); // Add selectedProperty

  useEffect(() => {
    if (status === "authenticated" && unwrappedParams.id) {
      fetchTask();
    }
  }, [status, unwrappedParams.id, selectedProperty, fetchTask]); // Add selectedProperty to trigger refetch

  if (status === "loading" || loading) {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-5"
        aria-live="polite"
        aria-busy="true"
        role="status"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
        <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
          Loading task details…
        </p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl desktop:max-w-[96rem]">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error || "Task not found"}</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/maintenance-tasks">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Tasks
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const frequencyColors: Record<string, string> = {
    daily: "bg-red-100 text-red-800",
    weekly: "bg-orange-100 text-orange-800",
    monthly: "bg-blue-100 text-blue-800",
    quarterly: "bg-green-100 text-green-800",
    semi_annual: "bg-purple-100 text-purple-800",
    annual: "bg-indigo-100 text-indigo-800",
    custom: "bg-muted text-foreground",
  };

  const difficultyColors: Record<string, string> = {
    beginner: "bg-green-100 text-green-800",
    intermediate: "bg-yellow-100 text-yellow-800",
    advanced: "bg-orange-100 text-orange-800",
    expert: "bg-red-100 text-red-800",
  };

  return (
    <div className="w-full max-w-none space-y-4 px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl desktop:max-w-[96rem]">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/maintenance-tasks">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{task.name}</h1>
          <p className="text-muted-foreground">Task ID: {task.id}</p>
        </div>
      </div>

      {/* Equipment Info */}
      {/* Equipment Information Card removed - tasks are now generic templates */}

      {/* Task Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Task Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Description</p>
            <p className="text-foreground">{task.description}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Frequency</p>
              <Badge className={frequencyColors[task.frequency]}>
                {task.frequency.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Difficulty</p>
              <Badge className={difficultyColors[task.difficulty_level]}>
                {task.difficulty_level.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Duration</p>
              <p className="font-semibold text-foreground flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {task.estimated_duration}
              </p>
            </div>
            {task.responsible_department && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Department</p>
                <p className="font-semibold text-foreground flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {task.responsible_department}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Required Tools */}
      {task.required_tools && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Required Tools & Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground whitespace-pre-wrap">
              {task.required_tools}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Safety Notes */}
      {task.safety_notes && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <Shield className="h-5 w-5" />
              Safety Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-1" />
              <p className="text-yellow-900 whitespace-pre-wrap">
                {task.safety_notes}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Maintenance History for this Equipment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Maintenance History ({maintenanceHistory.length})
          </CardTitle>
          <CardDescription>
            Past maintenance records using this task template
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="ml-3 text-muted-foreground">
                Loading maintenance history...
              </p>
            </div>
          ) : maintenanceHistory.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">
                No maintenance history found for this task template yet.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Create a preventive maintenance record and link it to this task
                template to see history here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {maintenanceHistory
                .sort(
                  (a, b) =>
                    new Date(b.scheduled_date).getTime() -
                    new Date(a.scheduled_date).getTime(),
                )
                .map((record) => (
                  <div
                    key={record.pm_id}
                    className="border border-border rounded-lg p-4 hover:bg-muted transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <Link
                              href={`/dashboard/preventive-maintenance/${record.pm_id}`}
                              className="text-base font-semibold text-foreground hover:text-blue-600 transition-colors block"
                            >
                              {record.pmtitle || "Untitled Maintenance"}
                            </Link>
                            {record.pm_id && (
                              <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300 font-mono text-sm font-bold shadow-soft">
                                <span className="text-blue-600">PM ID:</span>
                                <span>{record.pm_id}</span>
                              </div>
                            )}
                          </div>
                          <StatusBadge status={record.status || "scheduled"} />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            <div>
                              <span className="text-xs text-muted-foreground">
                                Scheduled:
                              </span>
                              <p className="font-medium text-foreground">
                                {new Date(
                                  record.scheduled_date,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          {record.completed_date && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <div>
                                <span className="text-xs text-muted-foreground">
                                  Completed:
                                </span>
                                <p className="font-medium text-green-700">
                                  {new Date(
                                    record.completed_date,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          )}
                          {record.assigned_to_details &&
                            (() => {
                              const displayName = getDisplayName(
                                record.assigned_to_details,
                                "Unknown Technician",
                              );
                              return (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <User className="h-4 w-4 text-sky-500" />
                                  <div>
                                    <span className="text-xs text-muted-foreground">
                                      Assigned To:
                                    </span>
                                    <p className="font-medium text-foreground">
                                      {displayName}
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}
                          {record.created_by_details && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Users className="h-4 w-4 text-purple-500" />
                              <div>
                                <span className="text-xs text-muted-foreground">
                                  Created By:
                                </span>
                                <p className="font-medium text-foreground">
                                  {getDisplayName(record.created_by_details, "Unknown Technician")}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {record.notes && (
                          <div className="mt-2 p-2 bg-muted rounded border border-border">
                            <p className="text-xs text-muted-foreground mb-1">
                              Notes:
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {record.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <p>Created: {new Date(task.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p>Updated: {new Date(task.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
