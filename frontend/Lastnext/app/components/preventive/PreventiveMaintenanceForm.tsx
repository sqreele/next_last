"use client";
import { PMTemplateSection } from "./PMTemplateSection";
import { PMScheduleSection } from "./PMScheduleSection";
import { PMMachineSection } from "./PMMachineSection";
import { PMEvidenceSection } from "./PMEvidenceSection";
import { PMFormActions } from "./PMFormActions";
import { validateMaintenanceForm } from "./maintenance-form-validation";

import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Formik,
  Form,
  Field,
  FormikHelpers,
} from "formik";
import Link from "next/link";
import { MaintenanceFormSync } from "./MaintenanceFormSync";
import { normalizeGroupId, type FormValues, type MaintenanceTaskOption } from "./maintenance-form-types";
import {
  PreventiveMaintenance,
  validateFrequency,
  Topic,
  ServiceResponse,
  getPropertyDetails,
  MachineDetails, // Import MachineDetails
} from "@/app/lib/preventiveMaintenanceModels";
import { useToast } from "@/app/lib/hooks/use-toast";
import { useUser, useProperties } from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
import {
  preventiveMaintenanceService,
  type CreatePreventiveMaintenanceData,
  type UpdatePreventiveMaintenanceData,
} from "@/app/lib/PreventiveMaintenanceService";
import TopicService from "@/app/lib/TopicService";
import MachineService from "@/app/lib/MachineService";
import {
  fetchAllMaintenanceProcedures,
  type MaintenanceProcedureTemplate,
} from "@/app/lib/maintenanceProcedures";
import apiClient from "@/app/lib/api-client";

const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
interface PreventiveMaintenanceFormProps {
  pmId?: string | null;
  onSuccessAction: (data: PreventiveMaintenance) => void;
  initialData?: PreventiveMaintenance | null;
  onCancel?: () => void;
  machineId?: string; // Pre-select a machine if provided
}

const PreventiveMaintenanceForm: React.FC<PreventiveMaintenanceFormProps> = ({
  pmId,
  onSuccessAction,
  initialData: initialDataProp,
  onCancel,
  machineId,
}) => {
  const { toast } = useToast();
  const { data: session } = useSession();
  const user = session?.user || null;

  const { properties: userProperties } = useProperties();
  const { selectedPropertyId: selectedProperty, userProfile } = useUser();
  const hasProperties = userProperties && userProperties.length > 0;

  const [fetchedInitialData, setFetchedInitialData] =
    useState<PreventiveMaintenance | null>(null);
  const actualInitialData = initialDataProp || fetchedInitialData;

  const loaderShownAtRef = useRef<number | null>(null);

  const clearLoadingAfterMinTime = useCallback(() => {
    const shownAt = loaderShownAtRef.current;
    loaderShownAtRef.current = null;
    if (shownAt == null) {
      setIsLoading(false);
      return;
    }
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
    if (remaining === 0) {
      setIsLoading(false);
    } else {
      const t = setTimeout(() => setIsLoading(false), remaining);
      return () => clearTimeout(t);
    }
  }, []);

  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [availableMachines, setAvailableMachines] = useState<MachineDetails[]>(
    [],
  );
  const [availableMaintenanceTasks, setAvailableMaintenanceTasks] = useState<
    MaintenanceTaskOption[]
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImageUploading, setIsImageUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [beforeImagePreview, setBeforeImagePreview] = useState<string | null>(
    null,
  );
  const [afterImagePreview, setAfterImagePreview] = useState<string | null>(
    null,
  );
  const [loadingTopics, setLoadingTopics] = useState<boolean>(true);
  const [loadingMachines, setLoadingMachines] = useState<boolean>(true);
  const [loadingMaintenanceTasks, setLoadingMaintenanceTasks] =
    useState<boolean>(true);
  const [canOperate, setCanOperate] = useState<boolean | null>(null);
  const [loadingCapability, setLoadingCapability] = useState(false);
  const [propertyTimezone, setPropertyTimezone] = useState<string | null>(null);
  const machineRequestRef = useRef(0);
  const templateRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    if (pmId || !selectedProperty) {
      setCanOperate(pmId ? true : null);
      setPropertyTimezone(null);
      setLoadingCapability(false);
      return () => {
        active = false;
      };
    }

    setLoadingCapability(true);
    preventiveMaintenanceService
      .getMaintenanceStatistics({ property_id: selectedProperty })
      .then((response) => {
        if (!active) return;
        setCanOperate(response.data?.can_operate === true);
        setPropertyTimezone(response.data?.timezone || null);
      })
      .catch(() => {
        if (!active) return;
        setCanOperate(false);
        setPropertyTimezone(null);
        setError("Unable to verify create permission for this property.");
      })
      .finally(() => {
        if (active) setLoadingCapability(false);
      });

    return () => {
      active = false;
    };
  }, [pmId, selectedProperty]);

  const formatDateForInput = useCallback((date: Date): string => {
    // Use local methods to match the user's timezone for datetime-local inputs
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const result = `${year}-${month}-${day}T${hours}:${minutes}`;
    return result;
  }, []);

  // Helper function to calculate next scheduled date based on frequency
  const calculateNextScheduledDate = useCallback(
    (frequency: string, customDays?: number, baseDate?: Date): Date => {
      const now = baseDate ?? new Date();
      let nextDate: Date;

      switch (frequency) {
        case "daily":
          nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case "weekly":
          nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case "monthly":
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() + 1);
          // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28/29)
          if (nextDate.getDate() !== now.getDate()) {
            nextDate.setDate(0); // Set to last day of previous month
          }
          break;
        case "quarterly":
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() + 3);
          if (nextDate.getDate() !== now.getDate()) {
            nextDate.setDate(0);
          }
          break;
        case "semi_annual":
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() + 6);
          if (nextDate.getDate() !== now.getDate()) {
            nextDate.setDate(0);
          }
          break;
        case "annual":
          nextDate = new Date(now);
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          // Handle leap year edge case (Feb 29)
          if (nextDate.getDate() !== now.getDate()) {
            nextDate.setDate(0);
          }
          break;
        case "custom":
          if (customDays) {
            nextDate = new Date(now);
            nextDate.setDate(nextDate.getDate() + customDays);
          } else {
            nextDate = new Date(now);
            nextDate.setMonth(nextDate.getMonth() + 1);
          }
          break;
        default:
          // Default to monthly
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() + 1);
          if (nextDate.getDate() !== now.getDate()) {
            nextDate.setDate(0);
          }
      }

      return nextDate;
    },
    [],
  );

  // Helper function to convert datetime-local values to ISO 8601 format
  const convertToISO8601 = useCallback((dateTimeLocal: string): string => {
    if (!dateTimeLocal) {
      return "";
    }

    try {
      // Create a Date object from the datetime-local value
      // This assumes the datetime-local value is in the user's local timezone
      const date = new Date(dateTimeLocal);

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }

      // Create a format that Django can parse: YYYY-MM-DDThh:mm
      // This matches Django's expected format without seconds
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");

      const isoString = `${year}-${month}-${day}T${hours}:${minutes}`;
      return isoString;
    } catch (error) {
      console.error(
        "[convertToISO8601] Error converting datetime-local to ISO 8601:",
        error,
        "Input:",
        dateTimeLocal,
      );

      // If it's already in ISO format, return as is
      if (
        dateTimeLocal.includes("T") &&
        (dateTimeLocal.includes("Z") || dateTimeLocal.includes("+"))
      ) {
        return dateTimeLocal;
      }

      // If it's in YYYY-MM-DDTHH:mm format, add seconds and convert to ISO
      if (dateTimeLocal.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        const fallbackDate = new Date(dateTimeLocal + ":00");
        if (!isNaN(fallbackDate.getTime())) {
          // Use the same format: YYYY-MM-DDThh:mm
          const year = fallbackDate.getFullYear();
          const month = String(fallbackDate.getMonth() + 1).padStart(2, "0");
          const day = String(fallbackDate.getDate()).padStart(2, "0");
          const hours = String(fallbackDate.getHours()).padStart(2, "0");
          const minutes = String(fallbackDate.getMinutes()).padStart(2, "0");

          const fallbackISO = `${year}-${month}-${day}T${hours}:${minutes}`;
          return fallbackISO;
        }
      }

      // Last resort: try to construct ISO string manually
      const fallback = `${dateTimeLocal}:00`;
      console.warn(
        "[convertToISO8601] Using last resort fallback format:",
        fallback,
      );
      return fallback;
    }
  }, []);

  // Helper function to ensure datetime-local input format
  const ensureDateTimeLocalFormat = useCallback(
    (dateString: string): string => {
      if (!dateString) {
        return "";
      }

      // If it's already in datetime-local format, return as is
      if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        return dateString;
      }

      // If it's a Date object or ISO string, convert to datetime-local format
      try {
        const date = new Date(dateString);

        if (!isNaN(date.getTime())) {
          const formattedDate = formatDateForInput(date);
          return formattedDate;
        }
      } catch (formatError) {
        console.error(
          "[ensureDateTimeLocalFormat] Error ensuring datetime-local format:",
          formatError,
        );
      }
      return dateString;
    },
    [formatDateForInput],
  );

  // Use a static default date to avoid hydration issues
  const [defaultScheduledDate, setDefaultScheduledDate] = useState<string>("");

  // Set the default date after component mounts to avoid hydration issues
  useEffect(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const defaultDate = `${year}-${month}-${day}T09:00`;
    setDefaultScheduledDate(defaultDate);
  }, []);

  const getPropertyName = useCallback(
    (propertyId: string | null): string => {
      if (!propertyId) return "No Property Selected";
      const foundProperty = userProperties?.find(
        (p) => p.property_id === propertyId,
      );
      return foundProperty?.name || `Property ${propertyId}`;
    },
    [userProperties],
  );

  // Form validation
  const getInitialValues = useCallback((): FormValues => {
    const currentData = actualInitialData;

    if (currentData) {
      const topicIds: number[] =
        currentData.topics
          ?.map((topic: Topic | number) =>
            typeof topic === "object" && "id" in topic
              ? topic.id
              : typeof topic === "number"
                ? topic
                : null,
          )
          .filter((id): id is number => id !== null) || [];

      let machineIdsFromData: string[] = [];
      if (currentData.machines) {
        machineIdsFromData = currentData.machines
          .map((machine: MachineDetails | string) =>
            typeof machine === "object" && "machine_id" in machine
              ? machine.machine_id
              : typeof machine === "string"
                ? machine
                : null,
          )
          .filter((id): id is string => id !== null);
      } else if (currentData.machine_id) {
        machineIdsFromData = [currentData.machine_id];
      }

      const finalMachineIds = machineId
        ? Array.from(new Set([machineId, ...machineIdsFromData]))
        : machineIdsFromData;

      const propertyDetails = getPropertyDetails(currentData.property_id);
      const propertyId = propertyDetails.id || "";

      const customDays =
        currentData.custom_days === null ||
        currentData.custom_days === undefined
          ? ""
          : currentData.custom_days;
      const selectedTopics = topicIds || [];
      const selectedMachineIds = finalMachineIds || [];

      const scheduledDate = currentData.scheduled_date
        ? ensureDateTimeLocalFormat(currentData.scheduled_date)
        : defaultScheduledDate;
      const completedDate = currentData.completed_date
        ? ensureDateTimeLocalFormat(currentData.completed_date)
        : "";

      let assignedToId = "";
      if (currentData.assigned_to_details?.id) {
        assignedToId = String(currentData.assigned_to_details.id);
      } else if (
        currentData.assigned_to &&
        typeof currentData.assigned_to === "object" &&
        currentData.assigned_to !== null &&
        "id" in currentData.assigned_to
      ) {
        assignedToId = String((currentData.assigned_to as any).id);
      } else if (typeof currentData.assigned_to === "number") {
        assignedToId = String(currentData.assigned_to);
      }

      return {
        pmtitle: currentData.pmtitle || "",
        scheduled_date: scheduledDate,
        completed_date: completedDate,
        frequency: validateFrequency(currentData.frequency || "monthly"),
        custom_days: customDays,
        status: currentData.status || (completedDate ? "completed" : "pending"),
        notes: currentData.notes || "",
        before_image_file: null,
        after_image_file: null,
        selected_topics: selectedTopics,
        selected_machine_ids: selectedMachineIds,
        property_id: propertyId,
        procedure: currentData.procedure || "",
        procedure_template: (currentData as any).procedure_template || "",
        assigned_to: assignedToId,
        create_master_plan: false,
        lead_time_days: 7,
      };
    }

    // For new records, assign to the current application user. Prefer the
    // persisted backend profile id because Auth0 session ids may be non-numeric
    // provider identifiers that the preventive-maintenance API cannot accept.
    const currentUserId = userProfile?.id || user?.id;

    return {
      pmtitle: "",
      scheduled_date: defaultScheduledDate,
      completed_date: "",
      frequency: "monthly",
      custom_days: "",
      status: "pending",
      notes: "",
      before_image_file: null,
      after_image_file: null,
      selected_topics: [],
      // Query-string machines are selected only after the active property's
      // candidate response proves that the external machine_id is valid.
      selected_machine_ids: [],
      property_id: selectedProperty,
      procedure: "",
      procedure_template: "",
      assigned_to: currentUserId ? String(currentUserId) : "",
      create_master_plan: false,
      lead_time_days: 7,
    };
  }, [
    actualInitialData,
    selectedProperty,
    machineId,
    defaultScheduledDate,
    ensureDateTimeLocalFormat,
    userProfile?.id,
    user,
  ]);

  const clearError = useCallback(() => {
    setError(null);
    setSubmitError(null);
  }, []);

  const fetchAvailableTopics = useCallback(async () => {
    setLoadingTopics(true);
    try {
      const topicService = new TopicService();
      // Get access token from Auth0 hook
      const response = await topicService.getTopics(selectedProperty);
      if (response.success && response.data) {
        // Map the topics to ensure description is always a string
        const mappedTopics: Topic[] = response.data.map((topic) => ({
          id: topic.id,
          title: topic.title,
          description: topic.description || "", // Provide empty string as default
        }));
        setAvailableTopics(mappedTopics);
      } else {
        throw new Error(response.message || "Failed to fetch topics");
      }
    } catch (err: any) {
      console.error("Error fetching available topics:", err);
      setError("Failed to load topics. Please try again.");
    } finally {
      setLoadingTopics(false);
    }
  }, [selectedProperty]);

  const fetchAvailableMachines = useCallback(
    async (propertyId: string | null | undefined) => {
      const requestId = ++machineRequestRef.current;
      if (!propertyId) {
        setAvailableMachines([]);
        setLoadingMachines(false);
        return;
      }
      setLoadingMachines(true);
      try {
        const machineService = new MachineService();
        // Convert null/undefined to undefined for the API call
        const propertyIdForApi: string | undefined = propertyId || undefined;
        const response = await machineService.getMachines(propertyIdForApi);
        if (requestId !== machineRequestRef.current) return;
        if (response.success && response.data) {
          setAvailableMachines(response.data);
        } else {
          throw new Error(response.message || "Failed to fetch machines");
        }
      } catch (err: any) {
        if (requestId !== machineRequestRef.current) return;
        console.error("❌ Error fetching available machines:", err);

        // Provide more specific error messages
        let errorMessage = "Failed to load machines for the selected property.";
        if (
          err.message?.includes("401") ||
          err.message?.includes("Unauthorized")
        ) {
          errorMessage =
            "Authentication failed. Please refresh the page and try again.";
        } else if (err.message?.includes("404")) {
          errorMessage = "No machines found for this property.";
        } else if (err.message?.includes("500")) {
          errorMessage = "Server error. Please try again later.";
        }

        setError(errorMessage);
        setAvailableMachines([]);
      } finally {
        if (requestId === machineRequestRef.current) {
          setLoadingMachines(false);
        }
      }
    },
    [],
  );

  // Fetch available maintenance tasks (templates) - filtered by selected machines
  const fetchAvailableMaintenanceTasks = useCallback(
    async (machineIds?: string[]) => {
      const requestId = ++templateRequestRef.current;
      setAvailableMaintenanceTasks([]);
      const mergeTemplatesById = (
        templates: MaintenanceProcedureTemplate[],
      ): MaintenanceProcedureTemplate[] => {
        const uniqueTemplates = new Map<number, MaintenanceProcedureTemplate>();
        templates.forEach((template) => {
          if (
            template &&
            typeof template.id === "number" &&
            !uniqueTemplates.has(template.id)
          ) {
            uniqueTemplates.set(template.id, template);
          }
        });
        return Array.from(uniqueTemplates.values());
      };

      setLoadingMaintenanceTasks(true);
      try {
        let tasks: MaintenanceProcedureTemplate[] = [];

        if (machineIds && machineIds.length > 0) {
          // Fetch procedures for each selected machine
          const allProcedureIds = new Set<number>();
          const machineGroupIdsRaw = new Set<string>();
          const machineGroupIdsNormalized = new Set<string>();

          // Fetch machine details to get their maintenance procedures and group_id
          for (const machineId of machineIds) {
            try {
              const response = await apiClient.get(
                `/api/v1/machines/${machineId}/`,
              );
              const machine = response.data as any;

              // Collect machine's group_id if it exists (check for null, undefined, and empty string)
              const normalizedMachineGroupId = normalizeGroupId(
                machine.group_id,
              );
              if (normalizedMachineGroupId) {
                machineGroupIdsRaw.add(String(machine.group_id));
                machineGroupIdsNormalized.add(normalizedMachineGroupId);
              } else {
              }

              // Check if machine has maintenance_procedures field
              if (
                machine.maintenance_procedures &&
                Array.isArray(machine.maintenance_procedures)
              ) {
                machine.maintenance_procedures.forEach((proc: any) => {
                  if (proc.id) {
                    allProcedureIds.add(proc.id);
                  }
                });
              }
            } catch (err) {
              console.error(
                `[PreventiveMaintenanceForm] Failed to fetch machine ${machineId}:`,
                err,
              );
            }
          }

          // Fetch all available tasks
          const allTasks = await fetchAllMaintenanceProcedures({
            pageSize: 100, propertyId: selectedProperty,
          });

          // Log all tasks to show their group_ids for debugging
          // Filter tasks based on:
          // 1. If machine has group_id, ONLY show tasks with matching group_id (strict match: machine.group_id === task.group_id)
          // 2. Otherwise, show tasks linked to the machine via maintenance_procedures
          // 3. If no group_id and no linked procedures, show all tasks (fallback)
          const tasksMatchedByGroupId =
            machineGroupIdsNormalized.size > 0
              ? allTasks.filter((task) => {
                  const normalizedTaskGroupId = normalizeGroupId(task.group_id);
                  const matches = normalizedTaskGroupId
                    ? machineGroupIdsNormalized.has(normalizedTaskGroupId)
                    : false;
                  if (matches) {
                  }
                  return matches;
                })
              : [];

          const tasksMatchedByProcedures =
            allProcedureIds.size > 0
              ? allTasks.filter((task) => allProcedureIds.has(task.id))
              : [];

          const combinedMatches = mergeTemplatesById([
            ...tasksMatchedByGroupId,
            ...tasksMatchedByProcedures,
          ]);

          if (combinedMatches.length > 0) {
            tasks = combinedMatches;
          } else if (
            machineGroupIdsNormalized.size === 0 &&
            allProcedureIds.size === 0
          ) {
            // No filtering clues available - show everything
            tasks = allTasks;
          } else {
            // Filtering clues existed but nothing matched
            tasks = [];
            console.warn(
              "[PreventiveMaintenanceForm] ⚠️ No maintenance templates matched the selected machines via group_id or linked procedures.",
            );
          }
        } else {
          // No machines selected, show all tasks
          tasks = await fetchAllMaintenanceProcedures({ pageSize: 100, propertyId: selectedProperty });
        }

        if (requestId !== templateRequestRef.current) return;
        setAvailableMaintenanceTasks(
          tasks.map<MaintenanceTaskOption>(
            (task: MaintenanceProcedureTemplate) => ({
              id: task.id,
              name: task.name,
              group_id: task.group_id ?? undefined,
              category: task.category ?? undefined,
              frequency: task.frequency || "N/A",
              difficulty_level: task.difficulty_level || "N/A",
              responsible_department: task.responsible_department ?? undefined,
              custom_days: (task as any).custom_days ?? undefined, // Include custom_days if available from API
              machine_ids: task.machine_ids ?? [],
              machines: task.machines ?? [],
            }),
          ),
        );
      } catch (err: any) {
        if (requestId !== templateRequestRef.current) return;
        console.error("Error fetching maintenance tasks:", err);
        setAvailableMaintenanceTasks([]);
      } finally {
        if (requestId === templateRequestRef.current) setLoadingMaintenanceTasks(false);
      }
    },
    [selectedProperty],
  );

  // Handle property ID changes and fetch machines
  useEffect(() => {
    fetchAvailableMachines(selectedProperty);
  }, [selectedProperty, fetchAvailableMachines]);

  // Fetch maintenance tasks when machines are selected or on mount
  useEffect(() => {
    // Initial load - fetch all tasks if no machines selected yet
    fetchAvailableMaintenanceTasks();
  }, [fetchAvailableMaintenanceTasks]);

  // Move all hooks to the top, before any conditional returns
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        await fetchAvailableTopics();
        if (mounted) {
          setLoadingTopics(false);
        }
      } catch (err) {
        if (mounted) {
          console.error("Error loading topics:", err);
          setError("Failed to load topics. Please try again.");
          setLoadingTopics(false);
        }
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
  }, [fetchAvailableTopics]);

  useEffect(() => {
    let mounted = true;
    if (pmId && !initialDataProp) {
      loaderShownAtRef.current = Date.now();
      setIsLoading(true);
      clearError();
      preventiveMaintenanceService
        .getPreventiveMaintenanceById(pmId)
        .then((response) => {
          if (!mounted) return;

          if (response.success && response.data) {
            setFetchedInitialData(response.data);
            if (response.data.before_image_url)
              setBeforeImagePreview(response.data.before_image_url);
            if (response.data.after_image_url)
              setAfterImagePreview(response.data.after_image_url);
            if (!response.data.property_id) {
              console.warn(
                "[PreventiveMaintenanceForm] Missing property_id in maintenance data",
              );
              setError(
                "Warning: No property associated with this maintenance record. Please select one.",
              );
            }
            if (!response.data.machine_id && !response.data.machines?.length) {
              console.warn(
                "[PreventiveMaintenanceForm] Missing machine_id/machines in maintenance data",
              );
            }
          } else {
            throw new Error(
              response.message || "Failed to fetch maintenance data",
            );
          }
        })
        .catch((err) => {
          if (!mounted) return;
          console.error("Error fetching maintenance data:", err);
          setError(err.message || "Failed to fetch maintenance data");
          setFetchedInitialData(null);
        })
        .finally(() => {
          if (!mounted) return;
          clearLoadingAfterMinTime();
        });
    } else if (initialDataProp) {
      if (initialDataProp.before_image_url)
        setBeforeImagePreview(initialDataProp.before_image_url);
      if (initialDataProp.after_image_url)
        setAfterImagePreview(initialDataProp.after_image_url);
      if (!initialDataProp.property_id) {
        console.warn(
          "[PreventiveMaintenanceForm] Missing property_id in initialDataProp",
        );
        setError(
          "Warning: No property associated with this maintenance record. Please select one.",
        );
      }
      if (!initialDataProp.machine_id && !initialDataProp.machines?.length) {
        console.warn(
          "[PreventiveMaintenanceForm] Missing machine_id/machines in initialDataProp",
        );
      }
    }

    return () => {
      mounted = false;
    };
  }, [pmId, initialDataProp, clearError, clearLoadingAfterMinTime]);

  // Now check for early return conditions after all hooks are defined
  if (!hasProperties) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-sm mb-4">
          <h2 className="font-semibold mb-2">No Properties Available</h2>
          <p>
            You need to have at least one property assigned to create preventive
            maintenance records.
          </p>
          <p className="mt-2 text-sm">
            Please contact your administrator to assign properties to your
            account.
          </p>
        </div>
        <div className="mt-4">
          <Link
            href="/dashboard/preventive-maintenance"
            className="bg-gray-100 py-2 px-4 rounded-md text-gray-700 hover:bg-gray-200"
          >
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  // Check if properties are still loading
  if (userProperties.length === 0) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-sm mb-4">
          <h2 className="font-semibold mb-2">Loading Properties...</h2>
          <p>Please wait while we load your property information.</p>
        </div>
      </div>
    );
  }

  const handleFileSelection = (
    files: File[],
    type: "before" | "after",
    setFieldValue: (field: string, value: any) => void,
  ) => {
    if (files.length === 0) {
      if (type === "before") {
        setBeforeImagePreview(null);
        setFieldValue("before_image_file", null);
      } else {
        setAfterImagePreview(null);
        setFieldValue("after_image_file", null);
      }
      return;
    }
    const file = files[0];
    const validImageTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!validImageTypes.includes(file.type)) {
      toast.error(
        `Please upload an image file (JPEG, PNG, or GIF) for ${type === "before" ? "Before" : "After"} image.`,
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        `${type === "before" ? "Before" : "After"} image must be less than 5MB`,
      );
      return;
    }
    setFieldValue(
      type === "before" ? "before_image_file" : "after_image_file",
      file,
    );
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === "before") setBeforeImagePreview(reader.result as string);
      else setAfterImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>,
  ) => {
    const { setSubmitting, resetForm } = formikHelpers;
    const isMounted = true;

    clearError();
    setSubmitError(null);
    loaderShownAtRef.current = Date.now();
    setIsLoading(true);

    const hasBeforeImageFile = values.before_image_file instanceof File;
    const hasAfterImageFile = values.after_image_file instanceof File;

    if (hasBeforeImageFile || hasAfterImageFile) {
      setIsImageUploading(true);
    }

    try {
      // Validate dates before submission (only for edit mode)
      // For new records, completed_date should be empty unless status is completed
      if (
        !pmId &&
        values.completed_date &&
        values.completed_date.trim() !== "" &&
        values.status !== "completed"
      ) {
        setSubmitError(
          "Completed date should be empty when creating new maintenance records unless status is completed.",
        );
        setIsLoading(false);
        setIsImageUploading(false);
        setSubmitting(false);
        return;
      }

      // Validate completed_date is after scheduled_date (only when editing)
      if (
        pmId &&
        values.completed_date &&
        values.completed_date.trim() !== "" &&
        values.scheduled_date
      ) {
        const scheduledDate = new Date(values.scheduled_date);
        const completedDate = new Date(values.completed_date);

        if (completedDate < scheduledDate) {
          setSubmitError(
            "Completion date cannot be earlier than scheduled date",
          );
          setIsLoading(false);
          setIsImageUploading(false);
          setSubmitting(false);
          return;
        }
      }

      // Ensure property_id is set when machines are selected
      if (
        values.selected_machine_ids &&
        values.selected_machine_ids.length > 0 &&
        !values.property_id
      ) {
        setSubmitError("Property must be selected when machines are specified");
        setIsLoading(false);
        setIsImageUploading(false);
        setSubmitting(false);
        return;
      }

      // Prepare ISO 8601 strings for dates
      const scheduledDateISO = convertToISO8601(values.scheduled_date);
      // Include completed_date when editing or when status is completed.
      // If status is completed and no completed_date provided, default to now.
      const completedDateISO =
        values.completed_date && values.completed_date.trim() !== ""
          ? convertToISO8601(values.completed_date)
          : values.status === "completed"
            ? new Date().toISOString()
            : undefined;

      const assignedToValue = values.assigned_to;
      const assignedToNumber =
        assignedToValue &&
        !isNaN(Number(assignedToValue)) &&
        Number(assignedToValue) > 0
          ? Number(assignedToValue)
          : undefined;

      const finalMachineIds =
        Array.isArray(values.selected_machine_ids) &&
        values.selected_machine_ids.length > 0
          ? values.selected_machine_ids.map((id) => String(id))
          : [];

      const dataForService: CreatePreventiveMaintenanceData = {
        pmtitle: values.pmtitle.trim(),
        property_id: values.property_id || "",
        scheduled_date: scheduledDateISO,
        frequency: values.frequency,
        custom_days:
          values.frequency === "custom" && values.custom_days
            ? Number(values.custom_days)
            : undefined,
        notes: values.notes?.trim() || "",
        topic_ids:
          Array.isArray(values.selected_topics) &&
          values.selected_topics.length > 0
            ? values.selected_topics
            : [],
        // CRITICAL: Ensure machine_ids is always an array of strings
        machine_ids: finalMachineIds,
        completed_date: pmId ? completedDateISO : undefined,
        // CRITICAL: Only include images if they are actual File objects with size > 0
        // Do NOT send null, undefined, empty objects, or empty files
        // Backend will reject non-file data for ImageField
        before_image:
          pmId && values.before_image_file instanceof File &&
          values.before_image_file.size > 0
            ? values.before_image_file
            : undefined,
        after_image:
          pmId && values.after_image_file instanceof File &&
          values.after_image_file.size > 0
            ? values.after_image_file
            : undefined,
        procedure: values.procedure?.trim() || "",
        procedure_template:
          values.procedure_template !== ""
            ? Number(values.procedure_template)
            : undefined,
        // Only send assigned_to if it's a valid numeric ID
        // If not provided, backend will automatically use created_by (from request.user)
        assigned_to: assignedToNumber,
      };
      // Additional validation before sending to backend

      // Validate required fields

      if (!dataForService.scheduled_date) {
        throw new Error("Scheduled date is required");
      }
      if (!dataForService.frequency) {
        throw new Error("Frequency is required");
      }
      if (
        dataForService.frequency === "custom" &&
        !dataForService.custom_days
      ) {
        throw new Error("Custom days is required when frequency is custom");
      }
      const maintenanceIdToUpdate = pmId || (actualInitialData?.pm_id ?? null);
      let response: ServiceResponse<PreventiveMaintenance>;

      try {
        if (maintenanceIdToUpdate) {
          response =
            await preventiveMaintenanceService.updatePreventiveMaintenance(
              maintenanceIdToUpdate,
              dataForService as UpdatePreventiveMaintenanceData,
            );
        } else {
          if (values.create_master_plan) {
            const masterPlanResponse =
              await preventiveMaintenanceService.createPMMasterPlan({
                title: dataForService.pmtitle,
                machine_ids: dataForService.machine_ids,
                topic_ids: dataForService.topic_ids,
                start_date: dataForService.scheduled_date,
                frequency: dataForService.frequency,
                custom_days: dataForService.custom_days,
                lead_time_days: values.lead_time_days || 7,
                procedure_template: dataForService.procedure_template,
                assigned_to: dataForService.assigned_to,
                notes: dataForService.notes,
                procedure: dataForService.procedure,
                remarks: dataForService.remarks,
                active: true,
              }, selectedProperty || undefined);
            response = {
              success: masterPlanResponse.success,
              data: {
                ...dataForService,
                pm_id: masterPlanResponse.data?.plan_id || "projected",
                scheduled_date: dataForService.scheduled_date,
                frequency: dataForService.frequency as any,
                next_due_date:
                  masterPlanResponse.data?.next_due_date ||
                  dataForService.scheduled_date,
                status: "projected",
              } as PreventiveMaintenance,
              message: masterPlanResponse.message,
            };
          } else {
            response =
              await preventiveMaintenanceService.createPreventiveMaintenance(
                dataForService,
              );
          }
        }
      } catch (apiError: any) {
        // Re-throw to be caught by outer catch block
        throw apiError;
      }

      if (!isMounted) return;

      if (response.success && response.data) {
        toast.success(
          maintenanceIdToUpdate
            ? "Maintenance record updated successfully"
            : values.create_master_plan
              ? "PM master plan created successfully"
              : "Maintenance record created successfully",
        );
        if (onSuccessAction) {
          onSuccessAction(response.data);
        }

        if (!maintenanceIdToUpdate) {
          resetForm({ values: getInitialValues() });
          setBeforeImagePreview(null);
          setAfterImagePreview(null);
        } else {
          setBeforeImagePreview(response.data.before_image_url || null);
          setAfterImagePreview(response.data.after_image_url || null);
        }
      } else {
        const errMsg =
          response.message ||
          (response.error
            ? JSON.stringify(response.error)
            : "Failed to save maintenance record");
        throw new Error(errMsg);
      }
    } catch (error: any) {
      if (!isMounted) return;

      // Log comprehensive error details
      const errorDetails = {
        message: error.message,
        name: error.name,
        type: error.constructor?.name,
        hasResponse: !!error.response,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        code: error.code,
        stack: error.stack?.substring(0, 500), // Limit stack trace length
      };

      console.error("[FORM] handleSubmit - Error submitting form:", error);
      console.error("[FORM] Error details:", errorDetails);

      // Handle different error types
      let errorMessage = "An unexpected error occurred.";

      // Check if it's a network error
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        errorMessage =
          "Request timed out. Please check your internet connection and try again.";
      } else if (
        error.code === "ERR_NETWORK" ||
        error.message?.includes("Network Error")
      ) {
        errorMessage =
          "Network error. Please check your internet connection and try again.";
      } else if (error.response?.data) {
        // HTTP error response from backend
        const responseData = error.response.data;

        if (typeof responseData === "string") {
          errorMessage = responseData;
        } else if (responseData.detail) {
          errorMessage = responseData.detail;
        } else if (responseData.message) {
          errorMessage = responseData.message;
        } else if (typeof responseData === "object") {
          const fieldErrors = Object.entries(responseData)
            .filter(([key]) => key !== "detail" && key !== "message")
            .map(([field, errs]) => {
              const errorText = Array.isArray(errs)
                ? errs.join(", ")
                : String(errs);
              return `${field}: ${errorText}`;
            })
            .join("; ");
          if (fieldErrors) {
            errorMessage = `Validation errors: ${fieldErrors}`;
          } else if (responseData.detail) {
            errorMessage = responseData.detail;
          }
        }
      } else if (error.message) {
        // Use error message if available
        errorMessage = error.message;
      } else if (error.toString) {
        // Fallback to string representation
        errorMessage = error.toString();
      }
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (isMounted) {
        setSubmitting(false);
        clearLoadingAfterMinTime();
        setIsImageUploading(false);
      }
    }
  };

  if (isLoading && pmId && !actualInitialData) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-xs"
        aria-live="polite"
        aria-busy="true"
        role="status"
      >
        <BouncingDotsLoader size="lg" />
        <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
          Loading form, please wait…
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-3 sm:p-4 md:p-6 pb-28 md:pb-6">
      {(error || submitError) && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-sm mb-3 sm:mb-4"
          role="alert"
        >
          <div className="flex justify-between items-start gap-2">
            <p className="whitespace-pre-wrap text-sm sm:text-base flex-1">
              {error || submitError}
            </p>
            <button
              onClick={clearError}
              className="text-red-700 hover:text-red-900 text-xl sm:text-2xl leading-none min-w-[32px] min-h-[32px] flex items-center justify-center touch-target"
              type="button"
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <Formik
        initialValues={getInitialValues()}
        validate={(values) => {
          const errors = validateMaintenanceForm(values, pmId);
          return errors;
        }}
        enableReinitialize
        onSubmit={(values, formikHelpers) => {
          return handleSubmit(values, formikHelpers);
        }}
      >
        {function FormContent({
          values,
          isSubmitting,
          setFieldValue,
        }) {
          const nextDueDate = (() => {
            if (!values.frequency || !values.scheduled_date) {
              return null;
            }

            const baseDate = new Date(values.scheduled_date);
            if (isNaN(baseDate.getTime())) {
              return null;
            }

            return calculateNextScheduledDate(
              values.frequency,
              values.frequency === "custom" && values.custom_days
                ? Number(values.custom_days)
                : undefined,
              baseDate,
            );
          })();

          const nextDueLabel = nextDueDate
            ? nextDueDate.toLocaleString()
            : "Not available";

          return (
            <Form
              aria-label="Preventive Maintenance Form"
              className="relative space-y-4 sm:space-y-6"
            >
              <MaintenanceFormSync
                pmId={pmId}
                selectedProperty={selectedProperty}
                machineId={machineId}
                loadingMachines={loadingMachines}
                availableMachines={availableMachines}
                availableMaintenanceTasks={availableMaintenanceTasks}
                fetchAvailableMaintenanceTasks={fetchAvailableMaintenanceTasks}
              />
              {/* Full-screen saving/uploading overlay */}
              {(isSubmitting || isLoading) && (
                <div
                  className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-xs"
                  aria-live="polite"
                  aria-busy="true"
                  role="status"
                >
                  <BouncingDotsLoader size="lg" />
                  <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
                    Saving, please wait…
                  </p>
                </div>
              )}
              {!values.property_id && !pmId && (
                <div className="mb-4 sm:mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 sm:p-4 text-xs sm:text-sm text-amber-800">
                  Please select a property using the header dropdown before
                  creating preventive maintenance tasks.
                </div>
              )}

              {!pmId && values.property_id && (
                <section
                  className="rounded-lg border border-blue-200 bg-blue-50 p-4"
                  aria-labelledby="pm-property-context"
                >
                  <h2
                    id="pm-property-context"
                    className="text-sm font-semibold text-blue-950"
                  >
                    Creating preventive maintenance for
                  </h2>
                  <p className="mt-1 text-lg font-bold text-blue-900">
                    {getPropertyName(values.property_id)}
                  </p>
                  <p className="mt-1 text-xs text-blue-800">
                    Property ID: {values.property_id}
                    {propertyTimezone ? ` · Timezone: ${propertyTimezone}` : ""}
                  </p>
                  {loadingCapability ? (
                    <p className="mt-2 text-sm text-blue-700" role="status">
                      Checking create permission…
                    </p>
                  ) : canOperate === false ? (
                    <p className="mt-2 font-medium text-red-700" role="alert">
                      Your role cannot create maintenance for this property.
                    </p>
                  ) : null}
                </section>
              )}

              <Field type="hidden" name="property_id" />

              {/* Assigned User - Hidden, auto-assigned to current user */}
              <Field type="hidden" name="assigned_to" />

              <PMTemplateSection loadingMaintenanceTasks={loadingMaintenanceTasks} availableMaintenanceTasks={availableMaintenanceTasks}
                calculateNextScheduledDate={calculateNextScheduledDate} formatDateForInput={formatDateForInput} />
              <PMScheduleSection pmId={pmId} propertyTimezone={propertyTimezone} nextDueLabel={nextDueLabel} />
              {/* Notes */}
              <div className="mb-4 sm:mb-6">
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2"
                >
                  Notes
                </label>
                <Field
                  as="textarea"
                  id="notes"
                  name="notes"
                  rows={4}
                  className="w-full p-2.5 sm:p-3 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-y"
                  placeholder="Enter any notes for this maintenance task"
                />
              </div>

              {/* Procedure - HIDDEN (linked via maintenance task template) */}
              {false && (
                <div className="mb-6">
                  <label
                    htmlFor="procedure"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Procedure
                  </label>
                  <Field
                    as="textarea"
                    id="procedure"
                    name="procedure"
                    rows={4}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="Enter the maintenance procedure"
                  />
                </div>
              )}

              <PMMachineSection loadingMachines={loadingMachines} availableMachines={availableMachines}
                availableMaintenanceTasks={availableMaintenanceTasks} machineId={machineId} error={error} fetchAvailableMachines={fetchAvailableMachines} />
              <fieldset className="mb-4 rounded-md border border-gray-200 p-3 sm:mb-6 sm:p-4">
                <legend className="px-1 text-sm font-medium text-gray-700">
                  Topics (Optional)
                </legend>
                {loadingTopics ? (
                  <p className="text-sm text-gray-500" role="status">
                    Loading topics…
                  </p>
                ) : availableTopics.length === 0 ? (
                  <p className="text-sm text-gray-500">No topics available.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {availableTopics.map((topic) => (
                      <label
                        key={topic.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-200 px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded-sm border-gray-300 text-blue-600"
                          checked={values.selected_topics.includes(topic.id)}
                          onChange={(event) => {
                            const nextTopics = event.target.checked
                              ? [...values.selected_topics, topic.id]
                              : values.selected_topics.filter(
                                  (id) => id !== topic.id,
                                );
                            setFieldValue("selected_topics", nextTopics);
                          }}
                        />
                        <span className="text-sm text-gray-700">{topic.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <section className="mb-4 rounded-md border border-gray-200 p-3 sm:mb-6 sm:p-4">
                <h2 className="text-sm font-medium text-gray-700">Assignment</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Assigned to {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "the current user"}.
                  The server verifies an active operable TenantMembership for
                  this property.
                </p>
              </section>

              <PMEvidenceSection pmId={pmId} isLoading={isLoading} beforeImagePreview={beforeImagePreview} afterImagePreview={afterImagePreview}
                setBeforeImagePreview={setBeforeImagePreview} setAfterImagePreview={setAfterImagePreview} handleFileSelection={handleFileSelection} />
              <PMFormActions pmId={pmId} hasInitialData={Boolean(actualInitialData)} onCancel={onCancel}
                isImageUploading={isImageUploading} isLoading={isLoading} loadingCapability={loadingCapability} canOperate={canOperate} />
            </Form>
          );
        }}
      </Formik>
    </div>
  );
};

export default PreventiveMaintenanceForm;
