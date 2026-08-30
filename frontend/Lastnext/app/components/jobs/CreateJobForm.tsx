"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Formik, Form, Field, FormikErrors } from "formik";
import * as Yup from "yup";
import axios from "axios";
import { Button } from "@/app/components/ui/button";
import {
  PriorityBadge,
  SectionCard,
  StatusBadge,
} from "@/app/components/pcms-ui";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Plus,
  Loader,
  AlertCircle,
  CheckCircle,
  Check,
  ArrowLeft,
  ClipboardList,
  MapPin,
  Info,
  ImagePlus,
  Wrench,
  ShieldAlert,
  CalendarCheck,
  X,
  Layers3,
  DoorOpen,
  Tag,
} from "lucide-react";
import { Checkbox } from "@/app/components/ui/checkbox";
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
import { Input } from "@/app/components/ui/input";
import RoomAutocomplete from "@/app/components/jobs/RoomAutocomplete";
import TopicPicker from "@/app/components/jobs/TopicPicker";
import FileUpload from "@/app/components/jobs/FileUpload";
import { Room, TopicFromAPI, Area, Property } from "@/app/lib/types";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/lib/stores/mainStore";
import {
  getAllowedUserProperties,
  getPropertyId,
} from "@/app/lib/security/propertyAccess";

// Use Next.js API routes for proxying to the backend
const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_STAGE = 20; // Maximum images allowed for before/after sections
type TFunction = (key: DictKey) => string;

function formatMessage(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

interface FormValues {
  description: string;
  status: string;
  priority: string;
  remarks: string;
  topic: {
    title: string;
    description: string;
  };
  room: Room | null;
  area_id: number | null;
  floor: string | null;
  files: File[];
  afterFiles: File[];
  is_defective: boolean;
  is_preventivemaintenance: boolean;
}

const createValidationSchema = (t: TFunction) =>
  Yup.object().shape({
    description: Yup.string().required(
      t("createJob.validation.descriptionRequired"),
    ),
    status: Yup.string().required(t("createJob.validation.statusRequired")),
    priority: Yup.string().required(t("createJob.validation.priorityRequired")),
    remarks: Yup.string().optional(),
    topic: Yup.object()
      .shape({
        title: Yup.string().required(
          t("createJob.validation.categoryRequired"),
        ),
        description: Yup.string(),
      })
      .required(),
    room: Yup.object()
      .nullable()
      .shape({
        room_id: Yup.number()
          .typeError(t("createJob.validation.invalidRoom"))
          .min(1, t("createJob.validation.roomRequired")),
        name: Yup.string(),
      })
      .test(
        "room-or-area",
        t("createJob.validation.roomOrArea"),
        function (value) {
          const areaId = this.parent.area_id;
          if (areaId) return true;
          return Boolean(value && (value as { room_id?: number }).room_id);
        },
      ),
    area_id: Yup.number()
      .nullable()
      .test(
        "area-or-room",
        t("createJob.validation.roomOrArea"),
        function (value) {
          const room = this.parent.room as { room_id?: number } | null;
          if (room && room.room_id) return true;
          return value != null;
        },
      ),
    files: Yup.array()
      .of(
        Yup.mixed<File>()
          .test(
            "fileSize",
            t("createJob.validation.fileTooLarge"),
            (value) =>
              !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE,
          )
          .test(
            "fileType",
            t("createJob.validation.onlyImages"),
            (value) =>
              !value ||
              !(value instanceof File) ||
              value.type.startsWith("image/"),
          ),
      )
      .min(1, t("createJob.validation.imageRequired"))
      .max(
        MAX_FILES_PER_STAGE,
        formatMessage(t("createJob.validation.maxBeforeImages"), {
          max: MAX_FILES_PER_STAGE,
        }),
      )
      .required(t("createJob.validation.beforeImageRequired")),
    afterFiles: Yup.array()
      .of(
        Yup.mixed<File>()
          .test(
            "fileSize",
            t("createJob.validation.fileTooLarge"),
            (value) =>
              !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE,
          )
          .test(
            "fileType",
            t("createJob.validation.onlyImages"),
            (value) =>
              !value ||
              !(value instanceof File) ||
              value.type.startsWith("image/"),
          ),
      )
      .max(
        MAX_FILES_PER_STAGE,
        formatMessage(t("createJob.validation.maxAfterImages"), {
          max: MAX_FILES_PER_STAGE,
        }),
      ),
    is_defective: Yup.boolean().default(false),
    is_preventivemaintenance: Yup.boolean().default(false),
  });

const PRIORITY_OPTIONS = [
  { value: "low", labelKey: "priority.low" },
  { value: "medium", labelKey: "priority.medium" },
  { value: "high", labelKey: "priority.high" },
  { value: "critical", labelKey: "priority.critical" },
] as const satisfies Array<{ value: string; labelKey: DictKey }>;

const STATUS_OPTIONS = [
  { value: "pending", labelKey: "status.pending" },
  { value: "in_progress", labelKey: "status.inProgress" },
  { value: "waiting_sparepart", labelKey: "status.waitingSparepart" },
  { value: "completed", labelKey: "status.completed" },
  { value: "cancelled", labelKey: "status.cancelled" },
] as const satisfies Array<{ value: string; labelKey: DictKey }>;

const JOB_TYPES = [
  {
    key: "work_order",
    labelKey: "createJob.type.workOrder",
    descriptionKey: "createJob.type.workOrderDesc",
    icon: Wrench,
  },
  {
    key: "defect",
    labelKey: "createJob.type.defect",
    descriptionKey: "createJob.type.defectDesc",
    icon: ShieldAlert,
  },
  {
    key: "pm",
    labelKey: "createJob.type.pm",
    descriptionKey: "createJob.type.pmDesc",
    icon: CalendarCheck,
  },
] as const satisfies Array<{
  key: string;
  labelKey: DictKey;
  descriptionKey: DictKey;
  icon: React.ElementType;
}>;

const STATUS_SELECT_CLASSES: Record<string, string> = {
  pending: "border-info/30 bg-info/10 text-info",
  in_progress: "border-warning/35 bg-warning/10 text-warning-emphasis",
  waiting_sparepart: "border-warning/35 bg-warning/10 text-warning-emphasis",
  completed: "border-success/30 bg-success/10 text-success",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_OPTION_CLASSES: Record<string, string> = {
  pending: "font-semibold text-info focus:bg-info/10",
  in_progress: "font-semibold text-warning-emphasis focus:bg-warning/10",
  waiting_sparepart:
    "font-semibold text-warning-emphasis focus:bg-warning/10",
  completed: "font-semibold text-success focus:bg-success/10",
  cancelled: "font-semibold text-destructive focus:bg-destructive/10",
};

const initialValues: FormValues = {
  description: "",
  status: "pending",
  priority: "medium",
  remarks: "",
  topic: { title: "", description: "" },
  room: null,
  area_id: null,
  floor: null,
  files: [],
  afterFiles: [],
  is_defective: false,
  is_preventivemaintenance: false,
};

const SECTION_CARD_CLASS =
  "scroll-mt-32 rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5";
const FORM_SHELL_CLASS =
  "mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden pb-28 text-foreground md:pb-4";
const FIELD_BASE_CLASS =
  "border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/20";

function RequiredMark() {
  return (
    <span className="text-destructive" aria-label="required">
      *
    </span>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const circumference = 119.4;
  const offset = circumference - (circumference * percent) / 100;

  return (
    <div className="relative h-[46px] w-[46px] shrink-0">
      <svg
        className="-rotate-90"
        width="46"
        height="46"
        viewBox="0 0 46 46"
        aria-hidden
      >
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="4"
        />
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-primary">
        {percent}%
      </div>
    </div>
  );
}

function CreateJobHeader({
  onBack,
  progress,
  stepStatus,
  t,
}: {
  onBack: () => void;
  progress: number;
  stepStatus: boolean[];
  t: TFunction;
}) {
  const steps = [
    { label: t("createJob.step.jobDetails"), target: "cj-step-1" },
    { label: t("createJob.step.location"), target: "cj-step-2" },
    { label: t("createJob.step.category"), target: "cj-step-category" },
    { label: t("createJob.step.additional"), target: "cj-step-3" },
    { label: t("createJob.step.photos"), target: "cj-step-4" },
  ];

  return (
    <header
      className="sticky top-0 z-30 rounded-xl border border-border bg-card px-4 pb-4 pt-3 text-foreground shadow-soft md:top-3 md:px-5 xl:px-6"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          aria-label={t("createJob.header.back")}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold leading-tight text-foreground md:text-xl">
            {t("createJob.header.title")}
          </h2>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {t("createJob.header.subtitle")}
          </p>
        </div>
        <ProgressRing percent={progress} />
      </div>
      <nav
        className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden"
        aria-label={t("createJob.header.sections")}
      >
        {steps.map((step, index) => {
          const done = stepStatus[index];
          return (
            <button
              key={step.target}
              type="button"
              onClick={() =>
                document
                  .getElementById(step.target)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={`flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
                done
                  ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {done && <Check className="h-3.5 w-3.5 text-primary" />}
              {step.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="break-words text-base font-semibold leading-6 text-foreground">
          {title}
        </h2>
        <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [topics, setTopics] = useState<TopicFromAPI[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [isFloorLoading, setIsFloorLoading] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      if (!activePropertyNumericId) return false;
      return room.property_id !== null && room.property_id !== undefined
        ? String(room.property_id) === activePropertyNumericId
        : false;
    },
    [activePropertyNumericId],
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

  const validateFiles = (files: File[]) => {
    if (!files || files.length === 0) {
      return t("createJob.validation.imageRequired");
    }
    if (files.length > MAX_FILES_PER_STAGE) {
      return formatMessage(t("createJob.error.fileMax"), {
        max: MAX_FILES_PER_STAGE,
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
      if (!hasRoom && !hasArea) {
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

      const fileError = validateFiles(values.files);
      if (fileError) {
        setError(fileError);
        showErrorToast(fileError);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (values.afterFiles.length > 0) {
        const afterFileError = validateFiles(values.afterFiles);
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
          title: values.topic.title.trim(),
          description: values.topic.description.trim() || "",
        }),
      );
      if (values.remarks?.trim()) {
        formData.append("remarks", values.remarks.trim());
      }
      formData.append("user_id", session.user.id);
      formData.append("property_id", activePropertyId);
      formData.append("is_defective", values.is_defective ? "true" : "false");
      formData.append(
        "is_preventivemaintenance",
        values.is_preventivemaintenance ? "true" : "false",
      );
      if (values.area_id != null) {
        formData.append("area_id", String(values.area_id));
      }
      [...values.files, ...values.afterFiles].forEach((file) => {
        formData.append("images", file);
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
    async (areaId?: number | null, floor?: string | null) => {
      const requestId = ++roomRequestIdRef.current;
      if (!session?.user?.accessToken || !activePropertyId) {
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
            ...(areaId ? { area_id: areaId } : {}),
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
      session?.user?.accessToken,
      activePropertyId,
      normalizeRoomsResponse,
      roomBelongsToActiveProperty,
      showErrorToast,
      t,
    ],
  );

  const fetchFloorsForArea = useCallback(
    async (areaId: number | null) => {
      const requestId = ++floorRequestIdRef.current;
      if (!session?.user?.accessToken || !activePropertyId) {
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
            ...(areaId ? { area_id: areaId } : {}),
            property: activePropertyId,
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
      session?.user?.accessToken,
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
    if (!session?.user?.accessToken || !activePropertyId) {
      setRooms([]);
      setAreas([]);
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

    try {
      const [roomsResponse, topicsResponse, areasResponse] = await Promise.all([
        axios.get(`/api/rooms/`, {
          withCredentials: true,
          params: { property: activePropertyId },
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
      setAreas(areasList.filter(areaBelongsToActiveProperty));
      setFloors(deriveFloorsFromRooms(initialRooms));
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
    session?.user?.accessToken,
    activePropertyId,
    clearLoadingAfterMinTime,
    normalizeRoomsResponse,
    roomBelongsToActiveProperty,
    areaBelongsToActiveProperty,
    deriveFloorsFromRooms,
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

        {/* Full-screen loading overlay (form data) */}
        {isLoading && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-card/90 backdrop-blur-xs"
            aria-live="polite"
            aria-busy="true"
            role="status"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Loader
                className="h-8 w-8 animate-spin text-primary"
                aria-hidden
              />
            </div>
            <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
              {t("createJob.loadingForm")}
            </p>
          </div>
        )}

        {/* Form - only show when not loading */}
        {!isLoading && (
          <Formik
            key={activePropertyId || "no-active-property"}
            initialValues={initialValues}
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
              const stepStatus = [
                Boolean(values.description) && Boolean(values.priority),
                Boolean(values.area_id) || Boolean(values.room?.room_id),
                Boolean(values.topic.title),
                Boolean(values.remarks) ||
                  values.is_defective ||
                  values.is_preventivemaintenance,
                Array.isArray(values.files) && values.files.length > 0,
              ];
              const progress = Math.round(
                (stepStatus.filter(Boolean).length / stepStatus.length) * 100,
              );

              return (
                <Form className="relative space-y-4" noValidate>
                  <CreateJobHeader
                    onBack={() => window.history.back()}
                    progress={progress}
                    stepStatus={stepStatus}
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
                              <Loader
                                className="h-8 w-8 animate-spin text-primary"
                                aria-hidden
                              />
                            </div>
                            <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
                              {t("createJob.creating")}
                            </p>
                          </div>
                        )}
                        {/* Step 1: Status & Priority */}
                        <div
                          id="cj-step-1"
                          className={`${SECTION_CARD_CLASS} lg:col-span-2`}
                        >
                          <SectionTitle
                            icon={ClipboardList}
                            title={t("createJob.section.jobInfo")}
                            description={t("createJob.section.jobInfoDesc")}
                          />

                          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                            {/* Description */}
                            <div className="md:col-span-2 space-y-2">
                              <Label
                                htmlFor="description"
                                className="text-sm font-semibold text-foreground"
                              >
                                {t("createJob.description")} <RequiredMark />
                              </Label>
                              <Field
                                as={Textarea}
                                id="description"
                                name="description"
                                placeholder={t(
                                  "createJob.descriptionPlaceholder",
                                )}
                                disabled={isSubmitting}
                                className={`min-h-28 w-full rounded-lg p-3 text-sm transition-colors ${
                                  touched.description && errors.description
                                    ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                                    : FIELD_BASE_CLASS
                                } pcms-textarea resize-none focus:outline-hidden focus:ring-2`}
                              />
                              {(touched.description || submitCount > 0) &&
                                errors.description && (
                                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.description}
                                  </p>
                                )}
                            </div>

                            {/* Status and Priority */}
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {t("createJob.status")}{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <Select
                                value={values.status}
                                onValueChange={(value) => {
                                  setFieldValue("status", value);
                                  setFieldTouched("status", true, false);
                                }}
                                disabled={isSubmitting}
                              >
                                <SelectTrigger
                                  className={`h-11 rounded-lg font-semibold transition-colors ${
                                    (touched.status || submitCount > 0) &&
                                    errors.status
                                      ? "border border-red-400 bg-red-50 text-red-900"
                                      : STATUS_SELECT_CLASSES[values.status] ||
                                        FIELD_BASE_CLASS
                                  }`}
                                >
                                  <SelectValue
                                    placeholder={t("createJob.selectStatus")}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                      className={
                                        STATUS_OPTION_CLASSES[option.value]
                                      }
                                    >
                                      {t(option.labelKey)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {t("createJob.selected")}
                                </span>
                                <StatusBadge status={values.status} size="sm" />
                              </div>
                              {(touched.status || submitCount > 0) &&
                                errors.status && (
                                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.status}
                                  </p>
                                )}
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {t("createJob.priority")}{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <div
                                className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${(touched.priority || submitCount > 0) && errors.priority ? "rounded-lg p-1 ring-2 ring-destructive/20" : ""}`}
                                role="radiogroup"
                                aria-label={t("createJob.priority")}
                              >
                                {PRIORITY_OPTIONS.map((option) => {
                                  const active =
                                    values.priority === option.value;
                                  const colorMap: Record<string, string> = {
                                    low: active
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                                    medium: active
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                                    high: active
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                                    critical: active
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10",
                                  };
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      disabled={isSubmitting}
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() => {
                                        setFieldValue("priority", option.value);
                                        setFieldTouched(
                                          "priority",
                                          true,
                                          false,
                                        );
                                      }}
                                      className={`min-h-11 touch-manipulation rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${colorMap[option.value]}`}
                                    >
                                      {t(option.labelKey)}
                                    </button>
                                  );
                                })}
                              </div>
                              {(touched.priority || submitCount > 0) &&
                                errors.priority && (
                                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.priority}
                                  </p>
                                )}
                            </div>

                            <div className="space-y-2 md:col-span-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {t("createJob.jobType")} <RequiredMark />
                              </Label>
                              <div
                                className="grid gap-2 sm:grid-cols-3"
                                role="radiogroup"
                                aria-label={t("createJob.jobType")}
                              >
                                {JOB_TYPES.map((type) => {
                                  const active =
                                    type.key === "work_order"
                                      ? !values.is_defective &&
                                        !values.is_preventivemaintenance
                                      : type.key === "defect"
                                        ? values.is_defective
                                        : values.is_preventivemaintenance;
                                  return (
                                    <button
                                      key={type.key}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      disabled={isSubmitting}
                                      onClick={() => {
                                        setFieldValue(
                                          "is_defective",
                                          type.key === "defect",
                                        );
                                        setFieldValue(
                                          "is_preventivemaintenance",
                                          type.key === "pm",
                                        );
                                      }}
                                      className={`min-h-[72px] touch-manipulation rounded-lg border p-3 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
                                        active
                                          ? "border-primary/30 bg-primary/10 text-primary"
                                          : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/10"
                                      }`}
                                    >
                                      <span className="flex items-center gap-2 font-semibold">
                                        <type.icon
                                          className="h-5 w-5"
                                          aria-hidden
                                        />
                                        {t(type.labelKey)}
                                        {active && (
                                          <Check
                                            className="ml-auto h-4 w-4"
                                            aria-hidden
                                          />
                                        )}
                                      </span>
                                      <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                                        {t(type.descriptionKey)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

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

                                  if (nextAreaId) {
                                    void fetchFloorsForArea(nextAreaId);
                                    void fetchRooms(nextAreaId, null);
                                  } else {
                                    void fetchFloorsForArea(null);
                                    void fetchRooms(null, null);
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
                                    void fetchRooms(values.area_id, nextFloor);
                                  } else {
                                    void fetchRooms(values.area_id, null);
                                  }
                                }}
                                disabled={
                                  isSubmitting ||
                                  isFloorLoading ||
                                  !activePropertyId
                                }
                              >
                                <SelectTrigger
                                  className={`h-11 rounded-lg ${FIELD_BASE_CLASS}`}
                                >
                                  {isFloorLoading ? (
                                    <span className="flex items-center gap-2 text-muted-foreground">
                                      <Loader className="h-4 w-4 animate-spin" />{" "}
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
                              {values.area_id &&
                                !isFloorLoading &&
                                floors.length === 0 && (
                                  <p className="text-sm font-medium text-muted-foreground">
                                    {t("createJob.noFloorsArea")}
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
                                disabled={isSubmitting || !activePropertyId}
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
                        </div>

                        {/* Step 3: Category */}
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
                                topics={topics}
                                value={values.topic}
                                onChange={(topic) => {
                                  setFieldValue("topic", topic);
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

                        {/* Step 4: Additional Details */}
                        <div id="cj-step-3" className={SECTION_CARD_CLASS}>
                          <SectionTitle
                            icon={Info}
                            title={t("createJob.section.additional")}
                            description={t("createJob.section.additionalDesc")}
                          />

                          <div className="space-y-4 sm:space-y-6">
                            {/* Remarks */}
                            <div className="space-y-2">
                              <Label
                                htmlFor="remarks"
                                className="text-sm font-semibold text-foreground"
                              >
                                {t("createJob.remarks")}
                              </Label>
                              <Field
                                as={Textarea}
                                id="remarks"
                                name="remarks"
                                placeholder={t("createJob.remarksPlaceholder")}
                                disabled={isSubmitting}
                                className={`min-h-28 w-full rounded-lg p-3 text-sm transition-colors ${
                                  (touched.remarks || submitCount > 0) &&
                                  errors.remarks
                                    ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                                    : FIELD_BASE_CLASS
                                } pcms-textarea resize-none focus:outline-hidden focus:ring-2`}
                              />
                              {(touched.remarks || submitCount > 0) &&
                                errors.remarks && (
                                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.remarks}
                                  </p>
                                )}
                            </div>

                            {/* Checkboxes */}
                            <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                              <div className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-background p-3">
                                <Checkbox
                                  id="is_defective"
                                  checked={values.is_defective}
                                  onCheckedChange={(checked) =>
                                    setFieldValue("is_defective", checked)
                                  }
                                  disabled={isSubmitting}
                                  className="h-5 w-5 rounded-sm border-primary"
                                />
                                <Label
                                  htmlFor="is_defective"
                                  className="cursor-pointer text-sm font-semibold text-foreground"
                                >
                                  {t("createJob.isDefective")}
                                </Label>
                              </div>

                              <div className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-background p-3">
                                <Checkbox
                                  id="is_preventivemaintenance"
                                  checked={values.is_preventivemaintenance}
                                  onCheckedChange={(checked) =>
                                    setFieldValue(
                                      "is_preventivemaintenance",
                                      checked,
                                    )
                                  }
                                  disabled={isSubmitting}
                                  className="h-5 w-5 rounded-sm border-primary"
                                />
                                <Label
                                  htmlFor="is_preventivemaintenance"
                                  className="cursor-pointer text-sm font-semibold text-foreground"
                                >
                                  {t("createJob.isPreventiveMaintenance")}
                                </Label>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 5: Evidence Upload */}
                        <div
                          id="cj-step-4"
                          className={`${SECTION_CARD_CLASS} lg:col-span-2`}
                        >
                          <SectionTitle
                            icon={ImagePlus}
                            title={t("createJob.section.images")}
                            description={t("createJob.section.imagesDesc")}
                          />

                          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {formatMessage(t("createJob.beforePhoto"), {
                                  max: MAX_FILES_PER_STAGE,
                                })}{" "}
                                <span className="text-red-500">*</span>
                              </Label>
                              <FileUpload
                                onFileSelect={(selectedFiles) => {
                                  setFieldValue("files", selectedFiles);
                                  setFieldTouched("files", true, false);
                                }}
                                error={
                                  (touched.files || submitCount > 0) &&
                                  typeof errors.files === "string"
                                    ? errors.files
                                    : undefined
                                }
                                touched={Boolean(
                                  touched.files || submitCount > 0,
                                )}
                                disabled={isSubmitting}
                                maxFiles={MAX_FILES_PER_STAGE}
                              />
                              <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                                {formatMessage(t("createJob.beforePhotoHint"), {
                                  max: MAX_FILES_PER_STAGE,
                                })}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-foreground">
                                {formatMessage(t("createJob.afterPhoto"), {
                                  max: MAX_FILES_PER_STAGE,
                                })}
                              </Label>
                              <FileUpload
                                onFileSelect={(selectedFiles) => {
                                  setFieldValue("afterFiles", selectedFiles);
                                  setFieldTouched("afterFiles", true, false);
                                }}
                                error={
                                  (touched.afterFiles || submitCount > 0) &&
                                  typeof errors.afterFiles === "string"
                                    ? errors.afterFiles
                                    : undefined
                                }
                                touched={Boolean(
                                  touched.afterFiles || submitCount > 0,
                                )}
                                disabled={isSubmitting}
                                maxFiles={MAX_FILES_PER_STAGE}
                              />
                              <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                                {formatMessage(t("createJob.afterPhotoHint"), {
                                  max: MAX_FILES_PER_STAGE,
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <aside className="hidden xl:block">
                        <div className="sticky top-28 space-y-4">
                          <SectionCard
                            title={t("createJob.summary.title")}
                            description={t("createJob.summary.desc")}
                          >
                            <dl className="space-y-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.property")}
                                </dt>
                                <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                                  {selectedPropertyLabel ||
                                    t("createJob.error.selectActiveProperty")}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.area")}
                                </dt>
                                <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                                  {areas.find(
                                    (area) => area.id === values.area_id,
                                  )?.name || t("createJob.selectAreaOptional")}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.roomNumber")}
                                </dt>
                                <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                                  {values.room?.name ||
                                    t("createJob.selectRoomNumber")}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.category")}
                                </dt>
                                <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                                  {values.topic.title ||
                                    t("createJob.category")}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.status")}
                                </dt>
                                <dd>
                                  <StatusBadge
                                    status={values.status}
                                    size="sm"
                                  />
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.priority")}
                                </dt>
                                <dd>
                                  <PriorityBadge priority={values.priority} />
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.summary.assignedTo")}
                                </dt>
                                <dd className="min-w-0 break-words text-right font-semibold text-foreground [overflow-wrap:anywhere]">
                                  {[
                                    session?.user?.first_name,
                                    session?.user?.last_name,
                                  ]
                                    .filter(Boolean)
                                    .join(" ") ||
                                    session?.user?.username ||
                                    t("createJob.summary.chiefReview")}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.summary.beforeCount")}
                                </dt>
                                <dd className="font-semibold text-foreground">
                                  {values.files.length}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">
                                  {t("createJob.summary.afterCount")}
                                </dt>
                                <dd className="font-semibold text-foreground">
                                  {values.afterFiles.length}
                                </dd>
                              </div>
                            </dl>
                          </SectionCard>
                          <SectionCard
                            title={t("createJob.progress.title")}
                            description={t("createJob.progress.desc")}
                          >
                            <div className="space-y-3">
                              {(
                                [
                                  [
                                    t("createJob.step.jobDetails"),
                                    stepStatus[0],
                                  ],
                                  [t("createJob.step.location"), stepStatus[1]],
                                  [t("createJob.step.category"), stepStatus[2]],
                                  [
                                    t("createJob.step.additional"),
                                    stepStatus[3],
                                  ],
                                  [t("createJob.step.photos"), stepStatus[4]],
                                ] as Array<[string, boolean]>
                              ).map(([label, done]) => (
                                <div
                                  key={String(label)}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="min-w-0 break-words font-medium text-muted-foreground [overflow-wrap:anywhere]">
                                    {label}
                                  </span>
                                  <span
                                    className={`inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                                  >
                                    {done
                                      ? t("createJob.progress.done")
                                      : t("createJob.progress.open")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </SectionCard>
                        </div>
                      </aside>
                    </div>

                    {/* Submit Button — sticky on mobile, with progress hint and scroll-to-error */}
                    {(() => {
                      const stepStatus = [
                        Boolean(values.description) &&
                          Boolean(values.priority) &&
                          Boolean(values.status),
                        Boolean(values.area_id) ||
                          Boolean(values.room?.room_id),
                        Boolean(values.topic.title),
                        Array.isArray(values.files) && values.files.length > 0,
                      ];
                      const completedCount = stepStatus.filter(Boolean).length;
                      const firstIncomplete =
                        stepStatus.findIndex((s) => !s) + 1;
                      const allReady = completedCount === stepStatus.length;
                      return (
                        <div
                          className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-border bg-card px-3 py-3 shadow-soft sm:px-6 md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none"
                          style={{
                            bottom:
                              "calc(4.5rem + env(safe-area-inset-bottom))",
                          }}
                        >
                          <div className="w-full max-w-none md:max-w-none">
                            {!allReady && !isSubmitting && (
                              <div className="mb-2 flex flex-col items-stretch gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-semibold text-foreground md:hidden">
                                <span className="flex min-w-0 items-start gap-1.5 leading-5">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  {formatMessage(
                                    t("createJob.mobileProgress"),
                                    {
                                      completed: completedCount,
                                      total: stepStatus.length,
                                      step: firstIncomplete,
                                    },
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="min-h-11 self-start rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  onClick={() => {
                                    if (typeof document !== "undefined") {
                                      document
                                        .getElementById(
                                          `cj-step-${firstIncomplete}`,
                                        )
                                        ?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "start",
                                        });
                                    }
                                  }}
                                >
                                  {t("createJob.jump")}
                                </button>
                              </div>
                            )}
                            <Button
                              type="submit"
                              disabled={isSubmitting}
                              aria-busy={isSubmitting}
                              onClick={(event) => {
                                // If something's missing, jump to the first incomplete step on mobile
                                // before the form's own submit validation triggers so the user sees
                                // exactly which section needs work.
                                if (
                                  !allReady &&
                                  typeof document !== "undefined" &&
                                  window.innerWidth < 1280
                                ) {
                                  event.preventDefault();
                                  document
                                    .getElementById(
                                      `cj-step-${firstIncomplete}`,
                                    )
                                    ?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "start",
                                    });
                                }
                              }}
                              className={`h-12 w-full touch-manipulation rounded-lg text-sm font-semibold text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-100 sm:text-base ${
                                allReady
                                  ? "bg-primary hover:bg-[hsl(var(--primary-hover))] disabled:bg-primary/50"
                                  : "bg-primary hover:bg-[hsl(var(--primary-hover))] disabled:bg-primary/50"
                              }`}
                            >
                              {isSubmitting ? (
                                <div className="flex items-center gap-3">
                                  <Loader className="h-5 w-5 animate-spin" />
                                  <span>{t("createJob.creating")}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <Plus className="h-5 w-5" />
                                  <span>
                                    {allReady
                                      ? t("createJob.cta")
                                      : t("createJob.ctaFinishStep").replace(
                                          "{n}",
                                          String(firstIncomplete),
                                        )}
                                  </span>
                                </div>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
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
