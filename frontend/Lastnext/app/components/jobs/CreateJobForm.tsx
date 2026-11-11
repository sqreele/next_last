"use client";
import { STATUS_OPTIONS, initialValues, SECTION_CARD_CLASS, FORM_SHELL_CLASS, FIELD_BASE_CLASS } from "./create-job-config";
import { CreateJobHeader, RequiredMark, SectionTitle, LoadingSkeleton } from "./create-job-ui";
import { CreateJobDetails } from "./CreateJobDetails";
import { CreateJobRemarks } from "./CreateJobRemarks";
import { CreateJobEvidence } from "./CreateJobEvidence";
import { CreateJobSummary } from "./CreateJobSummary";
import { CreateJobSubmit } from "./CreateJobSubmit";

import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Formik, Form, FormikErrors } from "formik";
import { createValidationSchema, formatMessage, MAX_FILE_SIZE, MAX_BEFORE_FILES, MAX_AFTER_FILES, type FormValues } from "./create-job-validation";
import axios from "axios";

import MachineService, { type Machine } from "@/app/lib/MachineService";
import { MACHINE_WORK_CATEGORIES } from "@/app/lib/machine-work";
import { useT } from "@/app/lib/i18n/LocaleProvider";

import { AlertCircle, CheckCircle, MapPin, Info, X, Layers3, DoorOpen, Tag, CopyPlus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession, signIn } from "@/app/lib/session.client";
import { Label } from "@/app/components/ui/label";
import MachineAutocomplete from "@/app/components/jobs/MachineAutocomplete";
import RoomAutocomplete from "@/app/components/jobs/RoomAutocomplete";
import TopicPicker from "@/app/components/jobs/TopicPicker";
import { Room, TopicFromAPI, Area, Property, Job } from "@/app/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/app/lib/stores/mainStore";
import {
  getAllowedUserProperties,
  getPropertyId,
} from "@/app/lib/security/propertyAccess";
import { roomBelongsToProperty } from "@/app/lib/utils/property-filter";

import { fetchAllMaintenanceProcedures, type MaintenanceProcedureTemplate } from "@/app/lib/maintenanceProcedures";

// Use Next.js API routes for proxying to the backend
const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const CreateJobForm: React.FC<{ onJobCreated?: () => void }> = ({
  onJobCreated,
}) => {
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useT();
  const validationSchema = React.useMemo(() => createValidationSchema(t), [t]);
  const isSubmittingRef = React.useRef(false); // Prevent double submission
  const loaderShownAtRef = useRef<number | null>(null);
  const dataRequestIdRef = useRef(0);
  const roomRequestIdRef = useRef(0);
  const floorRequestIdRef = useRef(0);

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
      setTimeout(() => setIsLoading(false), remaining);
    }
  }, []);

  const { selectedPropertyId: selectedProperty, userProfile } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const copyFromJobId = searchParams.get("copy_from")?.trim() || null;
  const copyPropertyId = searchParams.get("property_id")?.trim() || null;
  const queryMachineId = searchParams.get("machine_id")?.trim() || null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [topics, setTopics] = useState<TopicFromAPI[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [pmTemplates, setPmTemplates] = useState<MaintenanceProcedureTemplate[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [isFloorLoading, setIsFloorLoading] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [beforeImagesBusy, setBeforeImagesBusy] = useState(false);
  const [afterImagesBusy, setAfterImagesBusy] = useState(false);
  const [formInitialValues, setFormInitialValues] =
    useState<FormValues>(initialValues);

  const accessibleProperties = React.useMemo(
    () => getAllowedUserProperties(userProfile),
    [userProfile],
  );
  const activeProperty = React.useMemo<Property | null>(() => {
    if (!selectedProperty) return null;
    return (
      accessibleProperties.find(
        (property) => getPropertyId(property) === selectedProperty,
      ) || null
    );
  }, [accessibleProperties, selectedProperty]);
  const activePropertyId = activeProperty
    ? getPropertyId(activeProperty)
    : null;
  const activePropertyNumericId = activeProperty
    ? String(activeProperty.id)
    : null;
  const activePropertyIdentifiers = React.useMemo(() => {
    const identifiers = new Set<string>();
    if (activePropertyId) identifiers.add(activePropertyId);
    if (activePropertyNumericId) identifiers.add(activePropertyNumericId);
    return identifiers;
  }, [activePropertyId, activePropertyNumericId]);
  const selectedPropertyLabel = activeProperty?.name || activePropertyId || "";

  const normalizeRoomsResponse = useCallback((data: unknown): Room[] => {
    if (Array.isArray(data)) return data as Room[];
    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as { results?: unknown }).results)
    ) {
      return (data as { results: Room[] }).results;
    }
    return [];
  }, []);

  const roomBelongsToActiveProperty = useCallback(
    (room: Room): boolean => {
      if (activePropertyIdentifiers.size === 0) return false;
      return roomBelongsToProperty(room, activePropertyIdentifiers);
    },
    [activePropertyIdentifiers],
  );

  const areaBelongsToActiveProperty = useCallback(
    (area: Area): boolean => {
      if (!activePropertyId) return false;
      return area.property_uuid === activePropertyId;
    },
    [activePropertyId],
  );

  const getFloorFromRoomName = useCallback(
    (roomName: unknown): string | null => {
      const code = String(roomName ?? "").trim();
      if (!code) return null;

      const numericMatch = code.match(/\d+/);
      if (!numericMatch) return null;

      const numericCode = numericMatch[0];
      if (numericCode.length === 4 && numericCode.startsWith("1")) {
        return numericCode[1];
      }
      if (numericCode.length >= 3) {
        return numericCode[0];
      }

      return null;
    },
    [],
  );

  const deriveFloorsFromRooms = useCallback(
    (roomsList: Room[]): string[] => {
      return Array.from(
        new Set(
          roomsList
            .map((room) => getFloorFromRoomName(room?.name))
            .filter((floor): floor is string => Boolean(floor)),
        ),
      ).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
    },
    [getFloorFromRoomName],
  );

  const normalizeFloorsResponse = useCallback((data: unknown): string[] => {
    const rawFloors = Array.isArray(data)
      ? data
      : data &&
          typeof data === "object" &&
          Array.isArray((data as { floors?: unknown }).floors)
        ? (data as { floors: unknown[] }).floors
        : [];

    return rawFloors
      .map((floor) => String(floor ?? "").trim())
      .filter(Boolean)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
  }, []);

  const formatApiError = (error: unknown, fallbackMessage: string): string => {
    if (!axios.isAxiosError(error)) {
      if (error instanceof Error && error.message) return error.message;
      return fallbackMessage;
    }

    const data = error.response?.data;
    if (!data) return error.message || fallbackMessage;
    if (typeof data === "string") return data;
    if (typeof data !== "object") return fallbackMessage;

    const normalizeErrorValue = (value: unknown): string => {
      if (Array.isArray(value))
        return value.map(normalizeErrorValue).join(", ");
      if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
          .map(
            ([nestedKey, nestedValue]) =>
              `${nestedKey}: ${normalizeErrorValue(nestedValue)}`,
          )
          .join(", ");
      }
      return String(value);
    };

    const payload = data as Record<string, unknown>;
    const details =
      payload.details && typeof payload.details === "object"
        ? (payload.details as Record<string, unknown>)
        : null;
    const errorPayload = details || payload;
    const directMessage =
      errorPayload.detail ||
      errorPayload.message ||
      (!details ? errorPayload.error : null);
    const fieldErrors = Object.entries(errorPayload)
      .filter(
        ([key]) =>
          !["detail", "message", "error", "non_field_errors"].includes(key),
      )
      .map(([key, value]) => `${key}: ${normalizeErrorValue(value)}`);

    const nonFieldErrors = Array.isArray(errorPayload.non_field_errors)
      ? errorPayload.non_field_errors.map(normalizeErrorValue).join(", ")
      : null;

    const parts = [
      directMessage ? String(directMessage) : null,
      nonFieldErrors,
      ...fieldErrors,
    ].filter(Boolean);

    return parts.length ? parts.join(" | ") : fallbackMessage;
  };

  const showErrorToast = useCallback(
    (message: string) => {
      toast({
        title: t("error.title"),
        description: message,
        variant: "destructive",
      });
    },
    [toast, t],
  );

  const validateFiles = (files: File[], maxFiles: number) => {
    if (!files || files.length === 0) {
      return t("createJob.validation.imageRequired");
    }
    if (files.length > maxFiles) {
      return formatMessage(t("createJob.error.fileMax"), {
        max: maxFiles,
      });
    }
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return formatMessage(t("createJob.error.fileTooLargeNamed"), {
          file: file.name,
        });
      }
      if (!file.type.startsWith("image/")) {
        return formatMessage(t("createJob.error.fileNotImage"), {
          file: file.name,
        });
      }
    }
    return null;
  };

  const handleSubmit = async (
    values: FormValues,
    {
      resetForm,
      setSubmitting,
    }: {
      resetForm: () => void;
      setSubmitting: (isSubmitting: boolean) => void;
    },
  ) => {
    // Prevent double submission
    if (isSubmittingRef.current) {
      return;
    }

    // Set submitting state immediately to prevent double submission
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (beforeImagesBusy || afterImagesBusy) {
        const message = t("createJob.validation.waitForUploads");
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (!session?.user) {
        const message = t("createJob.error.loginFirst");
        setError(message);
        showErrorToast(message);
        await signIn();
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (!activePropertyId) {
        const message = t("createJob.error.selectActiveProperty");
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      const hasRoom = Boolean(values.room && values.room.room_id);
      const hasArea = values.area_id != null;
      const hasMachine = values.locationType === "machine" && machines.some((machine) => machine.machine_id === values.machine_id);
      if (!hasRoom && !hasArea && !hasMachine) {
        const message = t("createJob.validation.roomOrArea");
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (values.room && !roomBelongsToActiveProperty(values.room)) {
        const message = t("createJob.error.roomPropertyMismatch");
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (values.area_id != null) {
        const selectedArea = areas.find((area) => area.id === values.area_id);
        if (!selectedArea || !areaBelongsToActiveProperty(selectedArea)) {
          const message = t("createJob.error.areaPropertyMismatch");
          setError(message);
          showErrorToast(message);
          isSubmittingRef.current = false;
          setSubmitting(false);
          return;
        }
      }

      if (hasMachine && !pmTemplates.some((template) =>
        template.id === values.procedure_template && (
          template.machine_ids?.includes(values.machine_id) ||
          template.machines?.some((machine) => machine.machine_id === values.machine_id)
        )
      )) {
        throw new Error(t("createJob.selectMaintenanceTemplate"));
      }

      const fileError = validateFiles(values.files, MAX_BEFORE_FILES);
      if (fileError) {
        setError(fileError);
        showErrorToast(fileError);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (values.afterFiles.length > 0) {
        const afterFileError = validateFiles(values.afterFiles, MAX_AFTER_FILES);
        if (afterFileError) {
          setError(afterFileError);
          showErrorToast(afterFileError);
          isSubmittingRef.current = false;
          setSubmitting(false);
          return;
        }
      }

      // All validations passed, proceed with submission
      const formData = new FormData();
      formData.append("description", values.description.trim());
      formData.append("status", values.status);
      formData.append("priority", values.priority);
      if (values.room && values.room.room_id) {
        formData.append("room_id", values.room.room_id.toString());
      }
      formData.append(
        "topic_data",
        JSON.stringify({
          title: hasMachine ? "PM" : values.topic.title.trim(),
          description: hasMachine ? "" : values.topic.description.trim() || "",
        }),
      );
      if (values.remarks?.trim()) {
        formData.append("remarks", values.remarks.trim());
      }
      formData.append("property_id", activePropertyId);
      formData.append("is_defective", !hasMachine && values.is_defective ? "true" : "false");
      formData.append(
        "is_preventivemaintenance",
        hasMachine || values.is_preventivemaintenance ? "true" : "false",
      );
      if (hasMachine && values.procedure_template) {
        formData.append("procedure_template", String(values.procedure_template));
      }
      if (values.area_id != null) {
        formData.append("area_id", String(values.area_id));
      }
      if (hasMachine) {
        formData.append("machine_id", values.machine_id);
        values.documents.forEach((file) => formData.append("documents", file));
      }
      values.beforeImageTokens.forEach((token) => {
        formData.append("before_image_tokens", token);
      });
      values.afterImageTokens.forEach((token) => {
        formData.append("after_image_tokens", token);
      });

      await axios.post(`/api/jobs/`, formData, { withCredentials: true });

      const statusOption = STATUS_OPTIONS.find(
        (option) => option.value === values.status,
      );
      const statusLabel = statusOption
        ? t(statusOption.labelKey)
        : values.status.replace("_", " ");
      setSuccessMessage(
        formatMessage(t("createJob.successMessage"), { status: statusLabel }),
      );

      // Success - reset form and redirect
      resetForm();
      if (onJobCreated) onJobCreated();
      toast({
        title: t("success.title"),
        description: t("createJob.successToast"),
        variant: "success",
      });
      setTimeout(() => {
        router.push("/dashboard/my-jobs");
      }, 1500);

      // Note: Don't reset isSubmittingRef here because we're navigating away
    } catch (error) {
      console.error("Submission error:", error);
      const errorMessage = formatApiError(
        error,
        t("createJob.error.createFailed"),
      );
      setError(errorMessage);
      setSuccessMessage(null);
      showErrorToast(errorMessage);
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const fetchRooms = useCallback(
    async (floor?: string | null) => {
      const requestId = ++roomRequestIdRef.current;
      if (!session?.user || !activePropertyId) {
        setRooms([]);
        setIsRoomLoading(false);
        return;
      }

      setIsRoomLoading(true);
      try {
        const response = await axios.get(`/api/rooms/`, {
          withCredentials: true,
          params: {
            property: activePropertyId,
            is_active: "true",
            ...(floor ? { floor } : {}),
          },
        });
        if (requestId !== roomRequestIdRef.current) return;
        setRooms(
          normalizeRoomsResponse(response.data).filter(
            roomBelongsToActiveProperty,
          ),
        );
      } catch (error) {
        if (requestId !== roomRequestIdRef.current) return;
        console.error("Error fetching rooms:", error);
        const errorMessage = formatApiError(
          error,
          t("createJob.error.fetchRooms"),
        );
        setError(errorMessage);
        showErrorToast(errorMessage);
        setRooms([]);
      } finally {
        if (requestId === roomRequestIdRef.current) {
          setIsRoomLoading(false);
        }
      }
    },
    [
      session?.user,
      activePropertyId,
      normalizeRoomsResponse,
      roomBelongsToActiveProperty,
      showErrorToast,
      t,
    ],
  );

  const fetchFloors = useCallback(
    async () => {
      const requestId = ++floorRequestIdRef.current;
      if (!session?.user || !activePropertyId) {
        setFloors([]);
        setIsFloorLoading(false);
        return;
      }
      setIsFloorLoading(true);
      try {
        const response = await axios.get(`/api/rooms/`, {
          withCredentials: true,
          params: {
            floors_only: "true",
            property: activePropertyId,
            is_active: "true",
          },
        });
        if (requestId !== floorRequestIdRef.current) return;
        const fetchedFloors = normalizeFloorsResponse(response.data);
        setFloors(
          fetchedFloors.length ? fetchedFloors : deriveFloorsFromRooms(rooms),
        );
      } catch (error) {
        if (requestId !== floorRequestIdRef.current) return;
        console.error("Error fetching floors:", error);
        const errorMessage = formatApiError(
          error,
          t("createJob.error.fetchFloors"),
        );
        setError(errorMessage);
        showErrorToast(errorMessage);
        setFloors([]);
      } finally {
        if (requestId === floorRequestIdRef.current) {
          setIsFloorLoading(false);
        }
      }
    },
    [
      session?.user,
      activePropertyId,
      normalizeFloorsResponse,
      deriveFloorsFromRooms,
      rooms,
      showErrorToast,
      t,
    ],
  );

  const fetchData = useCallback(async () => {
    const requestId = ++dataRequestIdRef.current;
    // A full property-scoped reload supersedes dependent requests that may
    // still be in flight for the previous active Property.
    roomRequestIdRef.current += 1;
    floorRequestIdRef.current += 1;
    if (!session?.user || !activePropertyId) {
      setRooms([]);
      setAreas([]);
      setMachines([]);
      setTopics([]);
      setFloors([]);
      loaderShownAtRef.current = null;
      setIsLoading(false);
      return;
    }

    loaderShownAtRef.current = Date.now();
    setIsLoading(true);
    setError(null);
    setFloors([]);
    setFormInitialValues(initialValues);

    try {
      if (
        copyFromJobId &&
        copyPropertyId &&
        copyPropertyId !== activePropertyId
      ) {
        throw new Error(t("createJob.copyPropertyMismatch"));
      }

      const [roomsResponse, topicsResponse, areasResponse, copiedJobResponse, machinesResponse] =
        await Promise.all([
        axios.get(`/api/rooms/`, {
          withCredentials: true,
          params: { property: activePropertyId, is_active: "true" },
        }),
        axios.get(`/api/topics/`, {
          withCredentials: true,
          params: { property: activePropertyId },
        }),
        axios.get(`/api/areas/`, {
          withCredentials: true,
          params: {
            is_active: "true",
            property_id: activePropertyId,
          },
        }),
        copyFromJobId
          ? axios.get<Job>(`/api/jobs/${encodeURIComponent(copyFromJobId)}`, {
              withCredentials: true,
              params: { property_id: activePropertyId },
            })
          : Promise.resolve(null),
        new MachineService().getMachines(activePropertyId),
      ]);
      if (requestId !== dataRequestIdRef.current) return;
      const initialRooms = normalizeRoomsResponse(roomsResponse.data).filter(
        roomBelongsToActiveProperty,
      );
      setRooms(initialRooms);
      setTopics(topicsResponse.data);
      const areasData = areasResponse.data;
      const areasList: Area[] = Array.isArray(areasData)
        ? areasData
        : areasData?.results || [];
      const propertyAreas = areasList.filter(areaBelongsToActiveProperty);
      setAreas(propertyAreas);
      setMachines(machinesResponse.data || []);
      setFloors(deriveFloorsFromRooms(initialRooms));
      const templates = await fetchAllMaintenanceProcedures({ propertyId: activePropertyId });
      if (requestId !== dataRequestIdRef.current) return;
      setPmTemplates(templates);

      if (!copiedJobResponse && queryMachineId) {
        const selectedMachine = (machinesResponse.data || []).find(
          (machine) => machine.machine_id === queryMachineId,
        );
        if (selectedMachine) {
          setFormInitialValues({
            ...initialValues,
            locationType: "machine",
            machine_id: selectedMachine.machine_id,
          });
        }
      }

      if (copiedJobResponse) {
        const copiedJob = copiedJobResponse.data;
        if (String(copiedJob.property_id || "") !== activePropertyId) {
          throw new Error(t("createJob.copyPropertyMismatch"));
        }

        const copiedRoom =
          copiedJob.rooms?.find((room) =>
            initialRooms.some(
              (candidate) => candidate.room_id === room.room_id,
            ),
          ) || null;
        const copiedAreaId = copiedJob.area_id ?? copiedJob.area?.id ?? null;
        const copiedArea = propertyAreas.find(
          (area) => area.id === copiedAreaId,
        );
        const copiedTopic = copiedJob.topics?.[0];

        setFormInitialValues({
          description: copiedJob.description || "",
          status: "pending",
          priority: copiedJob.priority || "medium",
          remarks: copiedJob.remarks || "",
          topic: {
            title: copiedTopic?.title || "",
            description: copiedTopic?.description || "",
          },
          locationType: copiedJob.machine ? "machine" : "location",
          machine_id: copiedJob.machine?.machine_id || "",
          documents: [],
          room: copiedRoom,
          area_id: copiedArea?.id ?? null,
          floor: copiedRoom ? getFloorFromRoomName(copiedRoom.name) : null,
          files: [],
          afterFiles: [],
          beforeImageTokens: [],
          afterImageTokens: [],
          is_defective: Boolean(copiedJob.is_defective),
          is_preventivemaintenance: Boolean(
            copiedJob.is_preventivemaintenance,
          ),
          procedure_template: null,
        });
      }
    } catch (error) {
      if (requestId !== dataRequestIdRef.current) return;
      console.error("Error fetching data:", error);
      const errorMessage = formatApiError(
        error,
        t("createJob.error.fetchData"),
      );
      setError(errorMessage);
      showErrorToast(errorMessage);
    } finally {
      if (requestId === dataRequestIdRef.current) {
        clearLoadingAfterMinTime();
      }
    }
  }, [
    session?.user,
    activePropertyId,
    clearLoadingAfterMinTime,
    normalizeRoomsResponse,
    roomBelongsToActiveProperty,
    areaBelongsToActiveProperty,
    deriveFloorsFromRooms,
    getFloorFromRoomName,
    copyFromJobId,
    copyPropertyId,
    queryMachineId,
    showErrorToast,
    t,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className={FORM_SHELL_CLASS}>
      <div className="space-y-4">
        {/* Error Alert */}
        {error && (
          <Alert className="border-red-300 bg-red-50">
            <AlertCircle className="h-5 w-5 text-red-700" />
            <AlertDescription className="break-words text-sm font-medium text-red-900">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="border-emerald-300 bg-emerald-50">
            <CheckCircle className="h-5 w-5 text-emerald-700" />
            <AlertDescription className="text-sm font-medium text-emerald-900">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {copyFromJobId && !isLoading && !error && (
          <Alert className="border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
            <CopyPlus className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            <AlertDescription className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {formatMessage(t("createJob.copyNotice"), {
                id: copyFromJobId,
              })}
            </AlertDescription>
          </Alert>
        )}

        {/* Full-screen loading overlay (form data) */}
        {isLoading && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-card/90 backdrop-blur-xs"
            aria-live="polite"
            aria-busy="true"
            role="status"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <BouncingDotsLoader size="md" className="text-primary" />
            </div>
            <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
              {t("createJob.loadingForm")}
            </p>
          </div>
        )}

        {/* Form - only show when not loading */}
        {!isLoading && (
          <Formik
            key={`${activePropertyId || "no-active-property"}:${copyFromJobId || "new"}`}
            initialValues={formInitialValues}
            validationSchema={validationSchema}
            onSubmit={handleSubmit}
          >
            {({
              values,
              errors,
              touched,
              submitCount,
              setFieldValue,
              setFieldTouched,
              isSubmitting,
            }) => {
              const completionSteps = [
                {
                  target: "cj-step-1",
                  done:
                    Boolean(values.description) &&
                    Boolean(values.priority) &&
                    Boolean(values.status),
                },
                {
                  target: "cj-step-2",
                  done: Boolean(values.area_id) || Boolean(values.room?.room_id) || Boolean(values.machine_id),
                },
                {
                  target: values.locationType === "machine" ? "cj-step-template" : "cj-step-category",
                  done: values.locationType === "machine" ? Boolean(values.procedure_template) : Boolean(values.topic.title),
                },
                {
                  target: "cj-step-4",
                  done: Array.isArray(values.files) && values.files.length > 0,
                },
              ];
              const stepStatus = [
                completionSteps[0].done,
                completionSteps[1].done,
                completionSteps[2].done,
                true,
                completionSteps[3].done,
              ];
              const progress = Math.round(
                (completionSteps.filter((step) => step.done).length /
                  completionSteps.length) *
                  100,
              );

              const selectedMachine = machines.find((machine) => machine.machine_id === values.machine_id);
              const machineTemplates = selectedMachine ? pmTemplates.filter((template) =>
                template.machine_ids?.includes(selectedMachine.machine_id) ||
                template.machines?.some((machine) => machine.machine_id === selectedMachine.machine_id)
              ) : [];
              return (
                <Form className="relative space-y-4" noValidate>
                  <CreateJobHeader
                    onBack={() => window.history.back()}
                    progress={progress}
                    stepStatus={stepStatus}
                    isMachine={values.locationType === "machine"}
                    t={t}
                  />
                  <div className="px-0 pt-4 sm:px-1 md:px-0">
                    {/* Completion state per step — drives the bottom CTA hint. */}

                    <div className="grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                      <div className="grid gap-4 lg:grid-cols-2 xl:gap-5">
                        {/* Upload loading overlay */}
                        {isSubmitting && (
                          <div
                            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-card/90 backdrop-blur-xs"
                            aria-live="polite"
                            aria-busy="true"
                            role="status"
                          >
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                              <BouncingDotsLoader size="md" className="text-primary" />
                            </div>
                            <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
                              {t("createJob.creating")}
                            </p>
                          </div>
                        )}
                        <CreateJobDetails t={t} />
                        {/* Step 2: Assignment & Location */}
                        <div
                          id="cj-step-2"
                          className={`${SECTION_CARD_CLASS} lg:col-span-2`}
                        >
                          <SectionTitle
                            icon={MapPin}
                            title={t("createJob.step.location")}
                            description={t("createJob.section.locationDesc")}
                          />
                          <div className="mb-5 flex gap-2 rounded-lg border border-info/20 bg-info/10 p-3 text-sm leading-5 text-foreground">
                            <Info
                              className="mt-0.5 h-4 w-4 shrink-0"
                              aria-hidden
                            />
                            <span>
                              {activePropertyId
                                ? formatMessage(
                                    t("createJob.activePropertyContext"),
                                    { property: selectedPropertyLabel },
                                  )
                                : t("createJob.error.selectActiveProperty")}
                            </span>
                          </div>

                          <div className="mb-5 flex gap-2" role="group" aria-label={t("createJob.step.location")}>
                            {(["location", "machine"] as const).map((kind) => (
                              <button type="button" key={kind} disabled={isSubmitting} aria-pressed={values.locationType === kind}
                                className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ${values.locationType === kind ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                                onClick={() => {
                                  if (values.locationType === kind) return;
                                  setFieldValue("locationType", kind);
                                  setFieldValue("machine_id", "");
                                  setFieldValue("documents", []);
                                  setFieldValue("procedure_template", null);
                                  setFieldValue("room", null);
                                  setFieldValue("area_id", null);
                                  setFieldValue("floor", null);
                                  setFieldValue("topic", { title: "", description: "" });
                                  setFieldValue("is_defective", false);
                                  setFieldValue("is_preventivemaintenance", false);
                                  void fetchFloors();
                                  void fetchRooms(null);
                                }}>
                                {t(kind === "machine" ? "createJob.machine" : "createJob.roomOrArea")}
                              </button>
                            ))}
                          </div>
                          {values.locationType === "machine" ? (
                            <div className="space-y-3">
                              <Label htmlFor="machine_id">{t("createJob.machine")} <RequiredMark /></Label>
                              <MachineAutocomplete
                                machines={machines}
                                value={values.machine_id}
                                onSelect={(machineId) => {
                                  if (machineId !== values.machine_id) {
                                    setFieldValue("procedure_template", null);
                                  }
                                  setFieldValue("machine_id", machineId);
                                }}
                                onBlur={() => setFieldTouched("machine_id", true, false)}
                                disabled={isSubmitting || !activePropertyId}
                                invalid={Boolean((touched.machine_id || submitCount > 0) && errors.machine_id)}
                              />
                              {selectedMachine && (
                                <div id="cj-step-template" className="scroll-mt-32 space-y-2">
                                  <Label htmlFor="job-pm-template">{t("createJob.maintenanceTemplate")} <RequiredMark /></Label>
                                  <select
                                    id="job-pm-template"
                                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={values.procedure_template ?? ""}
                                    disabled={isSubmitting || machineTemplates.length === 0}
                                    aria-describedby="job-pm-template-hint job-pm-template-error"
                                    aria-invalid={Boolean((touched.procedure_template || submitCount > 0) && errors.procedure_template)}
                                    onBlur={() => setFieldTouched("procedure_template", true)}
                                    onChange={(event) => {
                                      const templateId = event.target.value ? Number(event.target.value) : null;
                                      setFieldValue("procedure_template", templateId);
                                      if (templateId !== null) {
                                        setFieldValue("topic", { title: "PM", description: "" });
                                        setFieldValue("is_preventivemaintenance", true);
                                        setFieldValue("is_defective", false);
                                        setFieldTouched("topic.title", true, false);
                                      }
                                    }}
                                  >
                                    <option value="">{t("createJob.selectMaintenanceTemplate")}</option>
                                    {machineTemplates.map((template) => (
                                      <option key={template.id} value={template.id}>
                                        {template.name}{template.frequency ? ` · ${template.frequency}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                  {(touched.procedure_template || submitCount > 0) && errors.procedure_template && (
                                    <p id="job-pm-template-error" role="alert" className="text-sm text-destructive">{errors.procedure_template}</p>
                                  )}
                                  <p id="job-pm-template-hint" className="text-xs text-muted-foreground">
                                    {t(machineTemplates.length ? "createJob.maintenanceTemplateHint" : "createJob.noMaintenanceTemplates")}
                                  </p>
                                </div>
                              )}
                              {!machines.length && <p className="text-sm text-muted-foreground">{t("createJob.noMachines")}</p>}
                              {(touched.machine_id || submitCount > 0) && errors.machine_id && <p id="machine-error" role="alert" className="text-sm text-destructive">{errors.machine_id}</p>}
                              {selectedMachine && (
                                <p className="rounded-lg bg-muted p-3 text-sm">
                                  {selectedMachine.description || selectedMachine.name}
                                </p>
                              )}
                            </div>
                          ) : (
                          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                            {/* Area Selection - required if no room selected */}
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {t("createJob.areaZone")}{" "}
                                {values.room && values.room.room_id ? (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t("createJob.optional")}
                                  </span>
                                ) : (
                                  <span className="text-red-500">*</span>
                                )}
                              </Label>
                              <Select
                                value={
                                  values.area_id
                                    ? String(values.area_id)
                                    : "none"
                                }
                                onValueChange={(value) => {
                                  const nextAreaId =
                                    value === "none" ? null : Number(value);
                                  setFieldValue("area_id", nextAreaId);
                                  setFieldValue("floor", null);
                                  setFieldValue("room", null);
                                  setFieldTouched("room", false, false);
                                  setFloors([]);
                                  setRooms([]);

                                  if (!nextAreaId) {
                                    void fetchFloors();
                                    void fetchRooms(null);
                                  }
                                }}
                                disabled={isSubmitting || !activePropertyId}
                              >
                                <SelectTrigger
                                  className={`h-11 rounded-lg ${
                                    (touched.area_id || submitCount > 0) &&
                                    errors.area_id
                                      ? "border border-red-400 bg-red-50 text-red-900"
                                      : FIELD_BASE_CLASS
                                  }`}
                                >
                                  <SelectValue
                                    placeholder={t(
                                      "createJob.selectAreaOptional",
                                    )}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    {t("createJob.noArea")}
                                  </SelectItem>
                                  {areas.length ? (
                                    areas.map((area) => (
                                      <SelectItem
                                        key={area.id}
                                        value={String(area.id)}
                                      >
                                        {area.name}
                                        {area.property_name
                                          ? ` · ${area.property_name}`
                                          : ""}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="empty" disabled>
                                      {t("createJob.noAreas")}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              {values.area_id && (
                                <p className="text-xs font-semibold text-primary">
                                  {t("createJob.areaSavedHint")}
                                </p>
                              )}
                              {(touched.area_id || submitCount > 0) &&
                                errors.area_id && (
                                  <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                                    <AlertCircle className="h-4 w-4" />
                                    {String(errors.area_id)}
                                  </p>
                                )}
                            </div>

                            {/* Floor Selection */}
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {t("createJob.floor")}{" "}
                                {!activePropertyId && (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t("createJob.error.selectActiveProperty")}
                                  </span>
                                )}
                              </Label>
                              <Select
                                value={values.floor || "none"}
                                onValueChange={(value) => {
                                  const nextFloor =
                                    value === "none" ? null : value;
                                  setFieldValue("floor", nextFloor);
                                  setFieldValue("room", null);
                                  setFieldTouched("room", false, false);
                                  setRooms([]);

                                  if (nextFloor) {
                                    void fetchRooms(nextFloor);
                                  } else {
                                    void fetchRooms(null);
                                  }
                                }}
                                disabled={
                                  isSubmitting ||
                                  isFloorLoading ||
                                  !activePropertyId ||
                                  Boolean(values.area_id)
                                }
                              >
                                <SelectTrigger
                                  className={`h-11 rounded-lg ${FIELD_BASE_CLASS}`}
                                >
                                  {isFloorLoading ? (
                                    <span className="flex items-center gap-2 text-muted-foreground">
                                      <BouncingDotsLoader size="sm" />{" "}
                                      {t("createJob.loadingFloors")}
                                    </span>
                                  ) : (
                                    <SelectValue
                                      placeholder={t("createJob.selectFloor")}
                                    />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    {t("createJob.selectFloor")}
                                  </SelectItem>
                                  {floors.length ? (
                                    floors.map((floor) => (
                                      <SelectItem key={floor} value={floor}>
                                        {formatMessage(
                                          t("createJob.floorValue"),
                                          { floor },
                                        )}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="empty" disabled>
                                      {t("createJob.noFloorsArea")}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              {values.area_id && (
                                <p className="text-sm font-medium text-muted-foreground">
                                  {t("createJob.floorDisabledByArea")}
                                </p>
                              )}
                            </div>

                            {/* Room Selection */}
                            <div className="md:col-span-2 space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {t("createJob.roomNumber")}{" "}
                                {values.area_id ? (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t("createJob.optional")}
                                  </span>
                                ) : (
                                  <span className="text-red-500">*</span>
                                )}
                              </Label>
                              <RoomAutocomplete
                                rooms={rooms}
                                selectedRoom={values.room}
                                onSelect={(selectedRoom) => {
                                  setFieldValue("room", selectedRoom);
                                  setFieldTouched("room", true, false);
                                }}
                                disabled={
                                  isSubmitting ||
                                  !activePropertyId ||
                                  Boolean(values.area_id)
                                }
                                loading={isRoomLoading}
                                emptyText={
                                  values.area_id && values.floor
                                    ? t("createJob.noRoomsFloor")
                                    : t("createJob.noRooms")
                                }
                                placeholder={
                                  !values.floor
                                    ? t("createJob.selectFloorOrRoom")
                                    : t("createJob.selectRoomNumber")
                                }
                              />
                              {values.floor &&
                                !isRoomLoading &&
                                rooms.length === 0 && (
                                  <p className="text-sm font-medium text-muted-foreground">
                                    {t("createJob.noRoomsFloor")}
                                  </p>
                                )}
                              {isRoomLoading && (
                                <LoadingSkeleton
                                  label={t("createJob.loadingRooms")}
                                />
                              )}
                              {(touched.room || submitCount > 0) &&
                                errors.room && (
                                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                                    <AlertCircle className="h-4 w-4" />
                                    {typeof errors.room === "string"
                                      ? errors.room
                                      : (errors.room as FormikErrors<Room>)
                                          .room_id}
                                  </p>
                                )}
                            </div>

                            {(values.area_id ||
                              values.floor ||
                              values.room) && (
                              <div className="rounded-lg border border-border bg-muted/40 p-3 md:col-span-2">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {t("createJob.selectedLocation")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {values.area_id && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFieldValue("area_id", null);
                                        setFieldValue("floor", null);
                                        setFieldValue("room", null);
                                        void fetchFloors();
                                        void fetchRooms(null);
                                      }}
                                      className="inline-flex min-h-11 max-w-full touch-manipulation items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary"
                                    >
                                      <MapPin className="h-4 w-4" />{" "}
                                      {areas.find(
                                        (area) => area.id === values.area_id,
                                      )?.name || t("createJob.area")}{" "}
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {values.floor && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFieldValue("floor", null);
                                        setFieldValue("room", null);
                                        void fetchRooms(null);
                                      }}
                                      className="inline-flex min-h-11 max-w-full touch-manipulation items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary"
                                    >
                                      <Layers3 className="h-4 w-4" />{" "}
                                      {formatMessage(
                                        t("createJob.floorValue"),
                                        { floor: values.floor },
                                      )}{" "}
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {values.room && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setFieldValue("room", null)
                                      }
                                      className="inline-flex min-h-11 max-w-full touch-manipulation items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary"
                                    >
                                      <DoorOpen className="h-4 w-4" />{" "}
                                      {values.room.name}{" "}
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          )}
                        </div>

                        {values.locationType !== "machine" && (
                        <div
                          id="cj-step-category"
                          className={SECTION_CARD_CLASS}
                        >
                          <SectionTitle
                            icon={Tag}
                            title={t("createJob.category")}
                            description={t("createJob.section.categoryDesc")}
                          />
                          <div className="grid grid-cols-1 gap-4">
                            {/* Topic Selection */}
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label className="text-sm font-semibold text-foreground">
                                  {t("createJob.category")}{" "}
                                  <span className="text-red-500">*</span>
                                </Label>
                                <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                                  {t("createJob.section.categoryDesc")}
                                </p>
                              </div>

                              <TopicPicker
                                allowCustom
                                topics={topics.filter((topic) => !MACHINE_WORK_CATEGORIES.includes(topic.title))}
                                value={values.topic}
                                onChange={(topic) => {
                                  setFieldValue("topic", topic);
                                  if (topic.title !== values.topic.title) {
                                    setFieldValue("procedure_template", null);
                                  }
                                  setFieldTouched("topic.title", true, false);
                                }}
                                disabled={isSubmitting}
                                invalid={Boolean(
                                  (touched.topic?.title || submitCount > 0) &&
                                  errors.topic?.title,
                                )}
                              />

                              {(touched.topic?.title || submitCount > 0) &&
                                errors.topic?.title && (
                                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.topic.title}
                                  </p>
                                )}
                            </div>
                          </div>
                        </div>
                        )}

                        {values.locationType === "machine" && (
                          <div className={SECTION_CARD_CLASS}>
                            <Label htmlFor="documents">{t("createJob.pdfTitle")}</Label>
                            <p id="documents-hint" className="my-2 text-sm text-muted-foreground">{t("createJob.pdfHint")}</p>
                            <input key={values.documents.map((file) => `${file.name}:${file.size}`).join("|")} id="documents" type="file" multiple accept=".pdf,application/pdf" disabled={isSubmitting}
                              aria-describedby="documents-hint" className="block w-full text-sm"
                              onChange={(event) => {
                                const files = [...values.documents, ...Array.from(event.currentTarget.files || [])];
                                setFieldTouched("documents", true, false);
                                if (files.length > 3 || files.some((file) => file.size > 2 * 1024 * 1024 || !/\.pdf$/i.test(file.name))) {
                                  showErrorToast(t("createJob.pdfInvalid"));
                                  event.currentTarget.value = "";
                                  return;
                                }
                                setFieldValue("documents", files);
                              }} />
                            <ul className="mt-3 space-y-2">
                              {values.documents.map((file, index) => <li key={`${file.name}:${index}`} className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 break-all">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>
                                <button type="button" disabled={isSubmitting} aria-label={`${t("createJob.removeDocument")} ${file.name}`} className="min-h-11 px-3 text-destructive"
                                  onClick={() => setFieldValue("documents", values.documents.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>
                              </li>)}
                            </ul>
                            {typeof errors.documents === "string" && <p role="alert" className="text-sm text-destructive">{errors.documents}</p>}
                          </div>
                        )}
                        <CreateJobRemarks t={t} />
                        <CreateJobEvidence t={t} activePropertyId={activePropertyId}
                          setBeforeImagesBusy={setBeforeImagesBusy} setAfterImagesBusy={setAfterImagesBusy} />
                      </div>
                      <CreateJobSummary t={t} selectedMachine={selectedMachine} selectedPropertyLabel={selectedPropertyLabel}
                        areas={areas} pmTemplates={pmTemplates} stepStatus={stepStatus}
                        assignedTo={[session?.user?.first_name, session?.user?.last_name].filter(Boolean).join(" ") || session?.user?.username || ""} />
                    </div>

                    <CreateJobSubmit t={t} completionSteps={completionSteps}
                      beforeImagesBusy={beforeImagesBusy} afterImagesBusy={afterImagesBusy} />
                  </div>
                </Form>
              );
            }}
          </Formik>
        )}
      </div>
    </div>
  );
};

export default CreateJobForm;
