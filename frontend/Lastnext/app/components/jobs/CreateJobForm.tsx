'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Formik, Form, Field, FormikErrors } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { Button } from "@/app/components/ui/button";
import { PriorityBadge, SectionCard, StatusBadge } from '@/app/components/pcms-ui';
import { useT } from '@/app/lib/i18n/LocaleProvider';
import type { DictKey } from '@/app/lib/i18n/dictionary';
import { Textarea } from "@/app/components/ui/textarea";
import { Plus, Loader, AlertCircle, CheckCircle, Search, Check, ArrowLeft, ClipboardList, MapPin, Info, ImagePlus, Wrench, ShieldAlert, CalendarCheck, X, Layers3, DoorOpen, Tag } from 'lucide-react';
import { Checkbox } from "@/app/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession, signIn } from '@/app/lib/session.client';
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import RoomAutocomplete from '@/app/components/jobs/RoomAutocomplete';
import FileUpload from '@/app/components/jobs/FileUpload';
import { Room, TopicFromAPI, Area, Property } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { useUser } from '@/app/lib/stores/mainStore';

// Use Next.js API routes for proxying to the backend
const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_STAGE = 20; // Maximum images allowed for before/after sections
type TFunction = (key: DictKey) => string;

function formatMessage(template: string, values: Record<string, string | number>) {
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

const createValidationSchema = (t: TFunction) => Yup.object().shape({
  description: Yup.string().required(t('createJob.validation.descriptionRequired')),
  status: Yup.string().required(t('createJob.validation.statusRequired')),
  priority: Yup.string().required(t('createJob.validation.priorityRequired')),
  remarks: Yup.string().optional(),
  topic: Yup.object().shape({
    title: Yup.string().required(t('createJob.validation.categoryRequired')),
    description: Yup.string(),
  }).required(),
  room: Yup.object()
    .nullable()
    .shape({
      room_id: Yup.number()
        .typeError(t('createJob.validation.invalidRoom'))
        .min(1, t('createJob.validation.roomRequired')),
      name: Yup.string(),
    })
    .test(
      'room-or-area',
      t('createJob.validation.roomOrArea'),
      function (value) {
        const areaId = this.parent.area_id;
        if (areaId) return true;
        return Boolean(value && (value as { room_id?: number }).room_id);
      },
    ),
  area_id: Yup.number()
    .nullable()
    .test(
      'area-or-room',
      t('createJob.validation.roomOrArea'),
      function (value) {
        const room = this.parent.room as { room_id?: number } | null;
        if (room && room.room_id) return true;
        return value != null;
      },
    ),
  files: Yup.array()
    .of(
      Yup.mixed<File>()
        .test('fileSize', t('createJob.validation.fileTooLarge'), (value) => !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE)
        .test('fileType', t('createJob.validation.onlyImages'), (value) => !value || !(value instanceof File) || value.type.startsWith('image/'))
    )
    .min(1, t('createJob.validation.imageRequired'))
    .max(MAX_FILES_PER_STAGE, formatMessage(t('createJob.validation.maxBeforeImages'), { max: MAX_FILES_PER_STAGE }))
    .required(t('createJob.validation.beforeImageRequired')),
  afterFiles: Yup.array()
    .of(
      Yup.mixed<File>()
        .test('fileSize', t('createJob.validation.fileTooLarge'), (value) => !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE)
        .test('fileType', t('createJob.validation.onlyImages'), (value) => !value || !(value instanceof File) || value.type.startsWith('image/'))
    )
    .max(MAX_FILES_PER_STAGE, formatMessage(t('createJob.validation.maxAfterImages'), { max: MAX_FILES_PER_STAGE })),
  is_defective: Yup.boolean().default(false),
  is_preventivemaintenance: Yup.boolean().default(false),
});


const PRIORITY_OPTIONS = [
  { value: 'low', labelKey: 'priority.low' },
  { value: 'medium', labelKey: 'priority.medium' },
  { value: 'high', labelKey: 'priority.high' },
  { value: 'critical', labelKey: 'priority.critical' },
] as const satisfies Array<{ value: string; labelKey: DictKey }>;

const STATUS_OPTIONS = [
  { value: 'pending', labelKey: 'status.pending' },
  { value: 'in_progress', labelKey: 'status.inProgress' },
  { value: 'waiting_sparepart', labelKey: 'status.waitingSparepart' },
  { value: 'completed', labelKey: 'status.completed' },
  { value: 'cancelled', labelKey: 'status.cancelled' },
] as const satisfies Array<{ value: string; labelKey: DictKey }>;

const JOB_TYPES = [
  { key: 'work_order', labelKey: 'createJob.type.workOrder', descriptionKey: 'createJob.type.workOrderDesc', icon: Wrench },
  { key: 'defect', labelKey: 'createJob.type.defect', descriptionKey: 'createJob.type.defectDesc', icon: ShieldAlert },
  { key: 'pm', labelKey: 'createJob.type.pm', descriptionKey: 'createJob.type.pmDesc', icon: CalendarCheck },
] as const satisfies Array<{ key: string; labelKey: DictKey; descriptionKey: DictKey; icon: React.ElementType }>;

const STATUS_SELECT_CLASSES: Record<string, string> = {
  pending: 'border-[#e2e6e8] bg-white text-[#4f5d63]',
  in_progress: 'border-[#46b8bc] bg-[#f8ffff] text-[#1b7178]',
  waiting_sparepart: 'border-[#f0c36d] bg-[#fffaf0] text-[#946200]',
  completed: 'border-[#7cc89c] bg-[#f5fff8] text-[#267345]',
  cancelled: 'border-[#eca3a3] bg-[#fff7f7] text-[#a53d3d]',
};

const STATUS_OPTION_CLASSES: Record<string, string> = {
  pending: 'font-semibold text-[#4f5d63] focus:bg-slate-50',
  in_progress: 'font-semibold text-[#1b7178] focus:bg-[#f8ffff]',
  waiting_sparepart: 'font-semibold text-[#946200] focus:bg-[#fffaf0]',
  completed: 'font-semibold text-[#267345] focus:bg-[#f5fff8]',
  cancelled: 'font-semibold text-[#a53d3d] focus:bg-[#fff7f7]',
};

const initialValues: FormValues = {
  description: '',
  status: 'pending',
  priority: 'medium',
  remarks: '',
  topic: { title: '', description: '' },
  room: null,
  area_id: null,
  floor: null,
  files: [],
  afterFiles: [],
  is_defective: false,
  is_preventivemaintenance: false,
};

const SECTION_CARD_CLASS = 'scroll-mt-28 rounded-[4px] border border-[#e2e6e8] bg-white p-4 sm:p-5';
const FORM_SHELL_CLASS = 'mx-auto min-h-screen w-full max-w-7xl overflow-x-hidden bg-[#f7f8f8] pb-32 text-[#2f3a3f] md:pb-8';
const FIELD_BASE_CLASS = 'border border-[#dfe5e8] bg-white text-[#2f3a3f] placeholder:text-[#9aa4a9] focus:border-[#46b8bc] focus:ring-[#dff6f7]';

function RequiredMark() {
  return <span className="text-red-500" aria-label="required">*</span>;
}

function ProgressRing({ percent }: { percent: number }) {
  const circumference = 119.4;
  const offset = circumference - (circumference * percent) / 100;

  return (
    <div className="relative h-[46px] w-[46px] shrink-0">
      <svg className="-rotate-90" width="46" height="46" viewBox="0 0 46 46" aria-hidden>
        <circle cx="23" cy="23" r="19" fill="none" stroke="#e2e6e8" strokeWidth="4" />
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="#46b8bc"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-[#269fa8]">
        {percent}%
      </div>
    </div>
  );
}

function CreateJobHeader({ onBack, progress, stepStatus, t }: { onBack: () => void; progress: number; stepStatus: boolean[]; t: TFunction }) {
  const steps = [
    { label: t('createJob.step.jobDetails'), target: 'cj-step-1' },
    { label: t('createJob.step.location'), target: 'cj-step-2' },
    { label: t('createJob.step.category'), target: 'cj-step-category' },
    { label: t('createJob.step.additional'), target: 'cj-step-3' },
    { label: t('createJob.step.photos'), target: 'cj-step-4' },
  ];

  return (
    <header
      className="sticky top-0 z-30 rounded-b-[4px] border border-[#e2e6e8] bg-white px-4 pb-4 pt-3 text-[#2f3a3f] shadow-sm md:top-3 md:rounded-[4px] md:px-5 xl:px-6"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-[#e2e6e8] bg-white text-[#6f7c82] transition hover:border-[#46b8bc] hover:text-[#269fa8] active:scale-95"
          aria-label={t('createJob.header.back')}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold leading-tight md:text-xl">{t('createJob.header.title')}</h1>
          <p className="mt-0.5 text-xs text-[#8a9499]">{t('createJob.header.subtitle')}</p>
        </div>
        <ProgressRing percent={progress} />
      </div>
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden" aria-label={t('createJob.header.sections')}>
        {steps.map((step, index) => {
          const done = stepStatus[index];
          return (
            <button
              key={step.target}
              type="button"
              onClick={() => document.getElementById(step.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition ${
                done
                  ? 'border-[#46b8bc] bg-[#f8ffff] font-semibold text-[#269fa8]'
                  : 'border-[#e2e6e8] bg-white text-[#7b878c]'
              }`}
            >
              {done && <Check className="h-3 w-3 text-[#269fa8]" />}
              {step.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-[#e2e6e8] bg-[#f8ffff] text-[#269fa8]">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight text-[#2f3a3f]">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-[#8a9499]">{description}</p>
      </div>
    </div>
  );
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="h-12 animate-pulse rounded-[4px] bg-[#edf1f2]" />
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

const propertyLabel = (property: Property | string | number) => {
  if (typeof property === 'string' || typeof property === 'number') return String(property);
  return property.name || property.property_id || String(property.id);
};

const propertyValue = (property: Property | string | number) => {
  if (typeof property === 'string' || typeof property === 'number') return String(property);
  return property.property_id || String(property.id);
};

const CreateJobForm: React.FC<{ onJobCreated?: () => void }> = ({ onJobCreated }) => {
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useT();
  const validationSchema = React.useMemo(() => createValidationSchema(t), [t]);
  const isSubmittingRef = React.useRef(false); // Prevent double submission
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
      setTimeout(() => setIsLoading(false), remaining);
    }
  }, []);

  const { selectedPropertyId: selectedProperty, setSelectedPropertyId: setSelectedProperty, userProfile } = useUser();
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
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');

  const normalizeRoomsResponse = useCallback((data: unknown): Room[] => {
    if (Array.isArray(data)) return data as Room[];
    if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
      return (data as { results: Room[] }).results;
    }
    return [];
  }, []);

  const getFloorFromRoomName = useCallback((roomName: unknown): string | null => {
    const code = String(roomName ?? '').trim();
    if (!code) return null;

    const numericMatch = code.match(/\d+/);
    if (!numericMatch) return null;

    const numericCode = numericMatch[0];
    if (numericCode.length === 4 && numericCode.startsWith('1')) {
      return numericCode[1];
    }
    if (numericCode.length >= 3) {
      return numericCode[0];
    }

    return null;
  }, []);

  const deriveFloorsFromRooms = useCallback((roomsList: Room[]): string[] => {
    return Array.from(
      new Set(
        roomsList
          .map((room) => getFloorFromRoomName(room?.name))
          .filter((floor): floor is string => Boolean(floor)),
      ),
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [getFloorFromRoomName]);

  const normalizeFloorsResponse = useCallback((data: unknown): string[] => {
    const rawFloors = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { floors?: unknown }).floors)
        ? (data as { floors: unknown[] }).floors
        : [];

    return rawFloors
      .map((floor) => String(floor ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, []);

  const selectedPropertyLabel = React.useMemo(() => {
    const activeProperty = selectedProperty || currentPropertyId;
    if (!activeProperty) return '';

    const matchedProperty = userProfile?.properties?.find(
      (property) => propertyValue(property) === activeProperty,
    );

    return matchedProperty ? propertyLabel(matchedProperty) : '';
  }, [currentPropertyId, selectedProperty, userProfile?.properties]);

  const formatApiError = (error: unknown, fallbackMessage: string): string => {
    if (!axios.isAxiosError(error)) {
      if (error instanceof Error && error.message) return error.message;
      return fallbackMessage;
    }

    const data = error.response?.data;
    if (!data) return error.message || fallbackMessage;
    if (typeof data === 'string') return data;
    if (typeof data !== 'object') return fallbackMessage;

    const normalizeErrorValue = (value: unknown): string => {
      if (Array.isArray(value)) return value.map(normalizeErrorValue).join(', ');
      if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
          .map(([nestedKey, nestedValue]) => `${nestedKey}: ${normalizeErrorValue(nestedValue)}`)
          .join(', ');
      }
      return String(value);
    };

    const payload = data as Record<string, unknown>;
    const details = payload.details && typeof payload.details === 'object'
      ? (payload.details as Record<string, unknown>)
      : null;
    const errorPayload = details || payload;
    const directMessage = errorPayload.detail || errorPayload.message || (!details ? errorPayload.error : null);
    const fieldErrors = Object.entries(errorPayload)
      .filter(([key]) => !['detail', 'message', 'error', 'non_field_errors'].includes(key))
      .map(([key, value]) => `${key}: ${normalizeErrorValue(value)}`);

    const nonFieldErrors = Array.isArray(errorPayload.non_field_errors)
      ? errorPayload.non_field_errors.map(normalizeErrorValue).join(', ')
      : null;

    const parts = [
      directMessage ? String(directMessage) : null,
      nonFieldErrors,
      ...fieldErrors,
    ].filter(Boolean);

    return parts.length ? parts.join(' | ') : fallbackMessage;
  };

  const showErrorToast = useCallback((message: string) => {
    toast({
      title: t('error.title'),
      description: message,
      variant: 'destructive',
    });
  }, [toast, t]);

  // Check if user has properties
  const hasProperties = userProfile?.properties && userProfile.properties.length > 0;

  // Auto-select first property if none selected and user has properties
  useEffect(() => {
    if (!selectedProperty && hasProperties && userProfile?.properties?.[0]) {
      const firstProperty = userProfile.properties[0];
      const propertyId = typeof firstProperty === 'string' ? firstProperty : 
                        typeof firstProperty === 'number' ? String(firstProperty) :
                        firstProperty.property_id || String(firstProperty.id);
      setSelectedProperty(propertyId);
      setCurrentPropertyId(propertyId);
    } else if (selectedProperty) {
      setCurrentPropertyId(selectedProperty);
    }
  }, [selectedProperty, hasProperties, userProfile, setSelectedProperty]);

  const validateFiles = (files: File[]) => {
    if (!files || files.length === 0) {
      return t('createJob.validation.imageRequired');
    }
    if (files.length > MAX_FILES_PER_STAGE) {
      return formatMessage(t('createJob.error.fileMax'), { max: MAX_FILES_PER_STAGE });
    }
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return formatMessage(t('createJob.error.fileTooLargeNamed'), { file: file.name });
      }
      if (!file.type.startsWith('image/')) {
        return formatMessage(t('createJob.error.fileNotImage'), { file: file.name });
      }
    }
    return null;
  };

  const handleSubmit = async (values: FormValues, { resetForm, setSubmitting }: { resetForm: () => void; setSubmitting: (isSubmitting: boolean) => void }) => {
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
        const message = t('createJob.error.loginFirst');
        setError(message);
        showErrorToast(message);
        await signIn();
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (!selectedProperty) {
        const message = t('createJob.error.selectProperty');
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      const hasRoom = Boolean(values.room && values.room.room_id);
      const hasArea = values.area_id != null;
      if (!hasRoom && !hasArea) {
        const message = t('createJob.validation.roomOrArea');
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
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
      formData.append('description', values.description.trim());
      formData.append('status', values.status);
      formData.append('priority', values.priority);
      if (values.room && values.room.room_id) {
        formData.append('room_id', values.room.room_id.toString());
      }
      formData.append('topic_data', JSON.stringify({
        title: values.topic.title.trim(),
        description: values.topic.description.trim() || '',
      }));
      if (values.remarks?.trim()) {
        formData.append('remarks', values.remarks.trim());
      }
      formData.append('user_id', session.user.id);
      formData.append('property_id', selectedProperty);
      formData.append('is_defective', values.is_defective ? 'true' : 'false');
      formData.append('is_preventivemaintenance', values.is_preventivemaintenance ? 'true' : 'false');
      if (values.area_id != null) {
        formData.append('area_id', String(values.area_id));
      }
      [...values.files, ...values.afterFiles].forEach(file => {
        formData.append('images', file);
      });

      await axios.post(`/api/jobs/`, formData, { withCredentials: true });

      const statusOption = STATUS_OPTIONS.find((option) => option.value === values.status);
      const statusLabel = statusOption ? t(statusOption.labelKey) : values.status.replace('_', ' ');
      setSuccessMessage(formatMessage(t('createJob.successMessage'), { status: statusLabel }));

      // Success - reset form and redirect
      resetForm();
      if (onJobCreated) onJobCreated();
      toast({
        title: t('success.title'),
        description: t('createJob.successToast'),
        variant: 'success',
      });
      setTimeout(() => {
        router.push('/dashboard/my-jobs');
      }, 1500);
      
      // Note: Don't reset isSubmittingRef here because we're navigating away
    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = formatApiError(error, t('createJob.error.createFailed'));
      setError(errorMessage);
      setSuccessMessage(null);
      showErrorToast(errorMessage);
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const fetchRooms = useCallback(async (areaId?: number | null, floor?: string | null) => {
    if (!session?.user?.accessToken) return;

    const propertyParam = selectedProperty || currentPropertyId || undefined;
    setIsRoomLoading(true);
    try {
      const response = await axios.get(`/api/rooms/`, {
        withCredentials: true,
        params: {
          ...(propertyParam ? { property: propertyParam } : {}),
          ...(areaId ? { area_id: areaId } : {}),
          ...(floor ? { floor } : {}),
        },
      });
      setRooms(normalizeRoomsResponse(response.data));
    } catch (error) {
      console.error('Error fetching rooms:', error);
      const errorMessage = formatApiError(error, t('createJob.error.fetchRooms'));
      setError(errorMessage);
      showErrorToast(errorMessage);
      setRooms([]);
    } finally {
      setIsRoomLoading(false);
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId, normalizeRoomsResponse, showErrorToast, t]);

  const fetchFloorsForArea = useCallback(async (areaId: number | null) => {
    const propertyParam = selectedProperty || currentPropertyId || undefined;
    if (!session?.user?.accessToken || (!areaId && !propertyParam)) {
      setFloors([]);
      return;
    }
    setIsFloorLoading(true);
    try {
      const response = await axios.get(`/api/rooms/`, {
        withCredentials: true,
        params: {
          floors_only: 'true',
          ...(areaId ? { area_id: areaId } : {}),
          ...(propertyParam ? { property: propertyParam } : {}),
        },
      });
      const fetchedFloors = normalizeFloorsResponse(response.data);
      setFloors(fetchedFloors.length ? fetchedFloors : deriveFloorsFromRooms(rooms));
    } catch (error) {
      console.error('Error fetching floors:', error);
      const errorMessage = formatApiError(error, t('createJob.error.fetchFloors'));
      setError(errorMessage);
      showErrorToast(errorMessage);
      setFloors([]);
    } finally {
      setIsFloorLoading(false);
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId, normalizeFloorsResponse, deriveFloorsFromRooms, rooms, showErrorToast, t]);

  const fetchData = useCallback(async () => {
    if (!session?.user?.accessToken) {
      return;
    }

    loaderShownAtRef.current = Date.now();
    setIsLoading(true);
    setError(null);
    setFloors([]);
    
    try {
      const propertyParam = selectedProperty || currentPropertyId || undefined;
      const [roomsResponse, topicsResponse, areasResponse] = await Promise.all([
        axios.get(`/api/rooms/`, { withCredentials: true, params: propertyParam ? { property: propertyParam } : undefined }),
        axios.get(`/api/topics/`, {
          withCredentials: true,
          params: propertyParam ? { property: propertyParam } : undefined,
        }),
        axios.get(`/api/areas/`, {
          withCredentials: true,
          params: { is_active: 'true', ...(propertyParam ? { property_id: propertyParam } : {}) },
        }),
      ]);
      const initialRooms = normalizeRoomsResponse(roomsResponse.data);
      setRooms(initialRooms);
      setTopics(topicsResponse.data);
      const areasData = areasResponse.data;
      const areasList: Area[] = Array.isArray(areasData) ? areasData : (areasData?.results || []);
      setAreas(areasList);
      setFloors(deriveFloorsFromRooms(initialRooms));
    } catch (error) {
      console.error('Error fetching data:', error);
      const errorMessage = formatApiError(error, t('createJob.error.fetchData'));
      setError(errorMessage);
      showErrorToast(errorMessage);
    } finally {
      clearLoadingAfterMinTime();
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId, clearLoadingAfterMinTime, normalizeRoomsResponse, deriveFloorsFromRooms, showErrorToast, t]);

  useEffect(() => {
    if (session?.user?.accessToken) {
      fetchData();
    }
  }, [fetchData, session?.user?.accessToken, selectedProperty]);



  return (
    <div className={FORM_SHELL_CLASS}>
      <div className="space-y-4">
      {/* Error Alert */}
      {error && (
        <Alert className="border-red-300 bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-700" />
          <AlertDescription className="break-words text-sm font-medium text-red-900">{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-emerald-300 bg-emerald-50">
          <CheckCircle className="h-5 w-5 text-emerald-700" />
          <AlertDescription className="text-sm font-medium text-emerald-900">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Full-screen loading overlay (form data) */}
      {isLoading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
          role="status"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-[4px] border border-[#e2e6e8] bg-[#f8ffff]">
            <Loader className="h-8 w-8 animate-spin text-[#269fa8]" aria-hidden />
          </div>
          <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
            {t('createJob.loadingForm')}
          </p>
        </div>
      )}

      {/* Form - only show when not loading */}
      {!isLoading && (
        <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, submitCount, setFieldValue, setFieldTouched, isSubmitting }) => {
          const stepStatus = [
            Boolean(values.description) && Boolean(values.priority),
            Boolean(values.area_id) || Boolean(values.room?.room_id),
            Boolean(values.topic.title),
            Boolean(values.remarks) || values.is_defective || values.is_preventivemaintenance,
            Array.isArray(values.files) && values.files.length > 0,
          ];
          const progress = Math.round((stepStatus.filter(Boolean).length / stepStatus.length) * 100);

          return (
          <Form className="relative space-y-4" noValidate>
            <CreateJobHeader onBack={() => window.history.back()} progress={progress} stepStatus={stepStatus} t={t} />
            <div className="px-0 pt-4 sm:px-1 md:px-0">

          {/* Completion state per step — drives the bottom CTA hint. */}


          <div className="grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="grid gap-4 lg:grid-cols-2 xl:gap-5">
          {/* Upload loading overlay */}
          {isSubmitting && (
            <div
              className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
              aria-live="polite"
              aria-busy="true"
              role="status"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-[4px] border border-[#e2e6e8] bg-[#f8ffff]">
                <Loader className="h-8 w-8 animate-spin text-[#269fa8]" aria-hidden />
              </div>
              <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
                {t('createJob.creating')}
              </p>
            </div>
          )}
          {/* Step 1: Status & Priority */}
            <div id="cj-step-1" className={`${SECTION_CARD_CLASS} lg:col-span-2`}>
              <SectionTitle icon={ClipboardList} title={t('createJob.section.jobInfo')} description={t('createJob.section.jobInfoDesc')} />
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Description */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description" className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.description')} <RequiredMark />
                  </Label>
                  <Field
                    as={Textarea}
                    id="description"
                    name="description"
                    placeholder={t('createJob.descriptionPlaceholder')}
                    disabled={isSubmitting}
                    className={`w-full min-h-[96px] rounded-[4px] p-3 text-sm transition-all duration-200 sm:min-h-[110px] ${
                      touched.description && errors.description 
                        ? 'border border-red-300 focus:border-red-500 focus:ring-red-100' 
                        : FIELD_BASE_CLASS
                    } pcms-textarea resize-none focus:outline-none focus:ring-2`}
                  />
                  {(touched.description || submitCount > 0) && errors.description && (
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {errors.description}
                    </p>
                  )}
                </div>

                {/* Status and Priority */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.status')} <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={values.status}
                    onValueChange={(value) => {
                      setFieldValue('status', value);
                      setFieldTouched('status', true, false);
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 rounded-[4px] font-semibold transition-all duration-200 ${
                      (touched.status || submitCount > 0) && errors.status
                        ? 'border border-red-400 bg-red-50 text-red-900'
                        : STATUS_SELECT_CLASSES[values.status] || FIELD_BASE_CLASS
                    }`}>
                      <SelectValue placeholder={t('createJob.selectStatus')} />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className={STATUS_OPTION_CLASSES[option.value]}>
                          {t(option.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 rounded-[4px] border border-[#e2e6e8] bg-[#fafafa] px-3 py-2">
                    <span className="text-xs font-semibold uppercase text-[#8a9499]">{t('createJob.selected')}</span>
                    <StatusBadge status={values.status} size="sm" />
                  </div>
                  {(touched.status || submitCount > 0) && errors.status && (
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {errors.status}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.priority')} <span className="text-red-500">*</span>
                  </Label>
                  <div
                    className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${(touched.priority || submitCount > 0) && errors.priority ? 'ring-2 ring-red-200 rounded-[4px] p-1' : ''}`}
                    role="radiogroup"
                    aria-label={t('createJob.priority')}
                  >
                    {PRIORITY_OPTIONS.map((option) => {
                      const active = values.priority === option.value;
                      const colorMap: Record<string, string> = {
                        low: active ? 'border-[#46b8bc] bg-[#46b8bc] text-white' : 'border-[#e2e6e8] bg-white text-[#4f5d63] hover:border-[#46b8bc] hover:bg-[#f8ffff]',
                        medium: active ? 'border-[#46b8bc] bg-[#46b8bc] text-white' : 'border-[#e2e6e8] bg-white text-[#4f5d63] hover:border-[#46b8bc] hover:bg-[#f8ffff]',
                        high: active ? 'border-[#46b8bc] bg-[#46b8bc] text-white' : 'border-[#e2e6e8] bg-white text-[#4f5d63] hover:border-[#46b8bc] hover:bg-[#f8ffff]',
                        critical: active ? 'border-[#46b8bc] bg-[#46b8bc] text-white' : 'border-[#e2e6e8] bg-white text-[#4f5d63] hover:border-[#46b8bc] hover:bg-[#f8ffff]',
                      };
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isSubmitting}
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setFieldValue('priority', option.value);
                            setFieldTouched('priority', true, false);
                          }}
                          className={`min-h-[40px] touch-manipulation rounded-[4px] border px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 ${colorMap[option.value]}`}
                        >
                          {t(option.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                  {(touched.priority || submitCount > 0) && errors.priority && (
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {errors.priority}
                    </p>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.jobType')} <RequiredMark />
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('createJob.jobType')}>
                    {JOB_TYPES.map((type) => {
                      const active = type.key === 'work_order'
                        ? !values.is_defective && !values.is_preventivemaintenance
                        : type.key === 'defect'
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
                          setFieldValue('is_defective', type.key === 'defect');
                          setFieldValue('is_preventivemaintenance', type.key === 'pm');
                        }}
                        className={`min-h-[68px] touch-manipulation rounded-[4px] border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#dff6f7] active:scale-[0.98] ${
                          active
                            ? 'border-[#46b8bc] bg-[#f8ffff] text-[#1b7178]'
                            : 'border-[#e2e6e8] bg-white text-[#4f5d63] hover:border-[#46b8bc] hover:bg-[#f8ffff]'
                        }`}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          <type.icon className="h-5 w-5" aria-hidden />
                          {t(type.labelKey)}
                          {active && <Check className="ml-auto h-4 w-4" aria-hidden />}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-[#8a9499]">{t(type.descriptionKey)}</span>
                      </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Assignment & Location */}
            <div id="cj-step-2" className={`${SECTION_CARD_CLASS} lg:col-span-2`}>
              <SectionTitle icon={MapPin} title={t('createJob.step.location')} description={t('createJob.section.locationDesc')} />
              <div className="mb-4 flex gap-2 rounded-[4px] border border-[#e2e6e8] bg-[#f8ffff] p-3 text-[12.5px] leading-5 text-[#4f5d63]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{t('createJob.locationHint')}</span>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.property')} <RequiredMark />
                  </Label>
                  <Select
                    value={selectedProperty || currentPropertyId || ''}
                    onValueChange={(value) => {
                      setSelectedProperty(value);
                      setCurrentPropertyId(value);
                      setFieldValue('area_id', null);
                      setFieldValue('floor', null);
                      setFieldValue('room', null);
                      setFieldValue('topic', { title: '', description: '' });
                      setFieldTouched('topic.title', false, false);
                      setCategorySearch('');
                      setFloors([]);
                      setRooms([]);
                    }}
                    disabled={isSubmitting || !hasProperties}
                  >
                    <SelectTrigger className={`h-11 rounded-[4px] ${FIELD_BASE_CLASS}`}>
                      <SelectValue placeholder={hasProperties ? t('createJob.selectProperty') : t('createJob.noProperties')} />
                    </SelectTrigger>
                    <SelectContent>
                      {userProfile?.properties?.map((property) => (
                        <SelectItem key={propertyValue(property)} value={propertyValue(property)}>
                          {propertyLabel(property)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Area Selection - required if no room selected */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.areaZone')} {values.room && values.room.room_id ? (
                      <span className="text-xs font-medium text-slate-600">{t('createJob.optional')}</span>
                    ) : (
                      <span className="text-red-500">*</span>
                    )}
                  </Label>
                  <Select
                    value={values.area_id ? String(values.area_id) : 'none'}
                    onValueChange={(value) => {
                      const nextAreaId = value === 'none' ? null : Number(value);
                      setFieldValue('area_id', nextAreaId);
                      setFieldValue('floor', null);
                      setFieldValue('room', null);
                      setFieldTouched('room', false, false);
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
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 rounded-[4px] ${
                      (touched.area_id || submitCount > 0) && errors.area_id ? 'border border-red-400 bg-red-50 text-red-900' : FIELD_BASE_CLASS
                    }`}>
                      <SelectValue placeholder={t('createJob.selectAreaOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('createJob.noArea')}</SelectItem>
                      {areas.length ? areas.map(area => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.name}{area.property_name ? ` · ${area.property_name}` : ''}
                        </SelectItem>
                      )) : (
                        <SelectItem value="empty" disabled>{t('createJob.noAreas')}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {values.area_id && (
                    <p className="text-xs font-semibold text-[#269fa8]">
                      {t('createJob.areaSavedHint')}
                    </p>
                  )}
                  {(touched.area_id || submitCount > 0) && errors.area_id && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                      <AlertCircle className="h-4 w-4" />
                      {String(errors.area_id)}
                    </p>
                  )}
                </div>

                {/* Floor Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.floor')} {!selectedProperty && <span className="text-xs font-medium text-slate-600">{t('createJob.selectProperty')}</span>}
                  </Label>
                  <Select
                    value={values.floor || 'none'}
                    onValueChange={(value) => {
                      const nextFloor = value === 'none' ? null : value;
                      setFieldValue('floor', nextFloor);
                      setFieldValue('room', null);
                      setFieldTouched('room', false, false);
                      setRooms([]);

                      if (nextFloor) {
                        void fetchRooms(values.area_id, nextFloor);
                      } else {
                        void fetchRooms(values.area_id, null);
                      }
                    }}
                    disabled={isSubmitting || isFloorLoading || !selectedProperty}
                  >
                    <SelectTrigger className={`h-11 rounded-[4px] ${FIELD_BASE_CLASS}`}>
                      {isFloorLoading ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader className="h-4 w-4 animate-spin" /> {t('createJob.loadingFloors')}
                        </span>
                      ) : (
                        <SelectValue placeholder={t('createJob.selectFloor')} />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('createJob.selectFloor')}</SelectItem>
                      {floors.length ? floors.map(floor => (
                        <SelectItem key={floor} value={floor}>
                          {formatMessage(t('createJob.floorValue'), { floor })}
                        </SelectItem>
                      )) : (
                        <SelectItem value="empty" disabled>{t('createJob.noFloorsArea')}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {values.area_id && !isFloorLoading && floors.length === 0 && (
                    <p className="text-sm font-medium text-slate-600">{t('createJob.noFloorsArea')}</p>
                  )}
                </div>

                {/* Room Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.roomNumber')} {values.area_id ? (
                      <span className="text-xs font-medium text-slate-600">{t('createJob.optional')}</span>
                    ) : (
                      <span className="text-red-500">*</span>
                    )}
                  </Label>
                  <RoomAutocomplete
                    rooms={rooms}
                    selectedRoom={values.room}
                    onSelect={(selectedRoom) => {
                      setFieldValue('room', selectedRoom);
                      setFieldTouched('room', true, false);
                    }}
                    disabled={isSubmitting}
                    loading={isRoomLoading}
                    emptyText={values.area_id && values.floor ? t('createJob.noRoomsFloor') : t('createJob.noRooms')}
                    placeholder={!values.floor ? t('createJob.selectFloorOrRoom') : t('createJob.selectRoomNumber')}
                  />
                  {values.floor && !isRoomLoading && rooms.length === 0 && (
                    <p className="text-sm font-medium text-slate-600">{t('createJob.noRoomsFloor')}</p>
                  )}
                  {isRoomLoading && <LoadingSkeleton label={t('createJob.loadingRooms')} />}
                  {(touched.room || submitCount > 0) && errors.room && (
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {typeof errors.room === 'string' ? errors.room : (errors.room as FormikErrors<Room>).room_id}
                    </p>
                  )}
                </div>

                {(values.area_id || values.floor || values.room) && (
                  <div className="md:col-span-2 rounded-[4px] border border-[#e2e6e8] bg-[#fafafa] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-[#8a9499]">{t('createJob.selectedLocation')}</p>
                    <div className="flex flex-wrap gap-2">
                      {values.area_id && (
                        <button type="button" onClick={() => { setFieldValue('area_id', null); setFieldValue('floor', null); setFieldValue('room', null); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-[4px] border border-[#46b8bc] bg-[#f8ffff] px-3 py-1 text-sm font-semibold text-[#269fa8]">
                          <MapPin className="h-4 w-4" /> {areas.find((area) => area.id === values.area_id)?.name || t('createJob.area')} <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {values.floor && (
                        <button type="button" onClick={() => { setFieldValue('floor', null); setFieldValue('room', null); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-[4px] border border-[#46b8bc] bg-[#f8ffff] px-3 py-1 text-sm font-semibold text-[#269fa8]">
                          <Layers3 className="h-4 w-4" /> {formatMessage(t('createJob.floorValue'), { floor: values.floor })} <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {values.room && (
                        <button type="button" onClick={() => setFieldValue('room', null)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[4px] border border-[#46b8bc] bg-[#f8ffff] px-3 py-1 text-sm font-semibold text-[#269fa8]">
                          <DoorOpen className="h-4 w-4" /> {values.room.name} <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Step 3: Category */}
            <div id="cj-step-category" className={SECTION_CARD_CLASS}>
              <SectionTitle icon={Tag} title={t('createJob.category')} description={t('createJob.section.categoryDesc')} />
              <div className="grid grid-cols-1 gap-4">
                {/* Topic Selection */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-[#2f3a3f]">
                      {t('createJob.category')} <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs font-medium text-slate-600 sm:text-sm">
                      {t('createJob.section.categoryDesc')}
                    </p>
                  </div>

                  {values.topic.title && (
                    <div className="rounded-[4px] border border-[#46b8bc] bg-[#f8ffff] p-3">
                      <p className="mb-2 text-xs font-semibold uppercase text-[#269fa8]">{t('createJob.selectedCategory')}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFieldValue('topic', { title: '', description: '' });
                          setFieldTouched('topic.title', true, false);
                        }}
                        disabled={isSubmitting}
                        className={`inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-[4px] border border-[#46b8bc] bg-[#46b8bc] px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#269fa8] active:scale-[0.98] ${
                          isSubmitting ? 'cursor-not-allowed opacity-60' : ''
                        }`}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        {values.topic.title}
                      </button>
                    </div>
                  )}

                  {topics.length > 8 && (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                      <Input
                        type="search"
                        value={categorySearch}
                        onChange={(event) => setCategorySearch(event.target.value)}
                        placeholder={t('createJob.searchCategories')}
                        aria-label={t('createJob.searchCategories')}
                        className={`h-11 rounded-[4px] pl-10 text-sm ${FIELD_BASE_CLASS}`}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}

                  {(() => {
                    const trimmedCategorySearch = categorySearch.trim().toLowerCase();
                    const visibleTopics = trimmedCategorySearch
                      ? topics.filter((topic) => topic.title.toLowerCase().includes(trimmedCategorySearch))
                      : topics;
                    const hasCategoryError = Boolean((touched.topic?.title || submitCount > 0) && errors.topic?.title);
                    const hasManyTopics = topics.length > 12;

                    return (
                      <div
                        role="listbox"
                        aria-label={t('createJob.chooseCategory')}
                        aria-multiselectable="false"
                        aria-invalid={hasCategoryError}
                        className={`flex flex-wrap gap-2 rounded-[4px] border bg-white p-2 sm:gap-3 sm:p-3 ${
                          hasManyTopics ? 'max-h-64 overflow-y-auto pr-2' : ''
                        } ${hasCategoryError ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}
                      >
                        {topics.length ? visibleTopics.map((topic) => {
                          const isSelected = values.topic.title === topic.title;

                          return (
                            <button
                              key={topic.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setFieldValue(
                                  'topic',
                                  isSelected ? { title: '', description: '' } : { title: topic.title, description: topic.description || '' },
                                );
                                setFieldTouched('topic.title', true, false);
                              }}
                              disabled={isSubmitting}
                              className={`inline-flex min-h-9 touch-manipulation items-center gap-2 rounded-[4px] border px-3 py-1.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] sm:px-4 ${
                                isSelected
                                  ? 'border-[#46b8bc] bg-[#46b8bc] text-white'
                                  : 'border-[#e2e6e8] bg-[#FBFBFD] text-[#5B6785] hover:border-[#46b8bc] hover:bg-[#f8ffff]'
                              } ${isSubmitting ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                              {isSelected && <Check className="h-4 w-4" aria-hidden />}
                              <span>{topic.title}</span>
                            </button>
                          );
                        }) : (
                          <div className="flex min-h-10 items-center rounded-[4px] border border-[#e2e6e8] bg-white px-4 py-2 text-sm font-semibold text-[#8a9499]">
                            {t('createJob.loadingTopics')}
                          </div>
                        )}

                        {topics.length > 0 && visibleTopics.length === 0 && (
                          <div className="flex min-h-10 items-center rounded-[4px] border border-dashed border-[#e2e6e8] bg-[#fafafa] px-4 py-2 text-sm font-semibold text-[#6f7c82]">
                            {formatMessage(t('createJob.noCategoryMatch'), { search: categorySearch })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {(touched.topic?.title || submitCount > 0) && errors.topic?.title && (
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
              <SectionTitle icon={Info} title={t('createJob.section.additional')} description={t('createJob.section.additionalDesc')} />
              
              <div className="space-y-4 sm:space-y-6">
                {/* Remarks */}
                <div className="space-y-2">
                  <Label htmlFor="remarks" className="text-sm font-semibold text-[#2f3a3f]">
                    {t('createJob.remarks')}
                  </Label>
                  <Field
                    as={Textarea}
                    id="remarks"
                    name="remarks"
                    placeholder={t('createJob.remarksPlaceholder')}
                    disabled={isSubmitting}
                    className={`w-full min-h-[96px] rounded-[4px] p-3 text-sm transition-all duration-200 sm:min-h-[110px] ${
                      (touched.remarks || submitCount > 0) && errors.remarks 
                        ? 'border border-red-300 focus:border-red-500 focus:ring-red-100' 
                        : FIELD_BASE_CLASS
                    } pcms-textarea resize-none focus:outline-none focus:ring-2`}
                  />
                  {(touched.remarks || submitCount > 0) && errors.remarks && (
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {errors.remarks}
                    </p>
                  )}
                </div>

                {/* Checkboxes */}
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-[4px] border border-[#e2e6e8] bg-white p-3">
                    <Checkbox
                      id="is_defective"
                      checked={values.is_defective}
                      onCheckedChange={(checked) => setFieldValue('is_defective', checked)}
                      disabled={isSubmitting}
                      className="h-5 w-5 rounded border border-[#46b8bc] text-[#269fa8]"
                    />
                    <Label htmlFor="is_defective" className="cursor-pointer text-sm font-semibold text-[#2f3a3f]">
                      {t('createJob.isDefective')}
                    </Label>
                  </div>

                  <div className="flex items-center gap-3 rounded-[4px] border border-[#e2e6e8] bg-white p-3">
                    <Checkbox
                      id="is_preventivemaintenance"
                      checked={values.is_preventivemaintenance}
                      onCheckedChange={(checked) => setFieldValue('is_preventivemaintenance', checked)}
                      disabled={isSubmitting}
                      className="h-5 w-5 rounded border border-[#46b8bc] text-[#269fa8]"
                    />
                    <Label htmlFor="is_preventivemaintenance" className="cursor-pointer text-sm font-semibold text-[#2f3a3f]">
                      {t('createJob.isPreventiveMaintenance')}
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5: Evidence Upload */}
            <div id="cj-step-4" className={`${SECTION_CARD_CLASS} lg:col-span-2`}>
              <SectionTitle icon={ImagePlus} title={t('createJob.section.images')} description={t('createJob.section.imagesDesc')} />
              
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {formatMessage(t('createJob.beforePhoto'), { max: MAX_FILES_PER_STAGE })} <span className="text-red-500">*</span>
                  </Label>
                  <FileUpload
                    onFileSelect={(selectedFiles) => {
                      setFieldValue('files', selectedFiles);
                      setFieldTouched('files', true, false);
                    }}
                    error={(touched.files || submitCount > 0) && typeof errors.files === 'string' ? errors.files : undefined}
                    touched={Boolean(touched.files || submitCount > 0)}
                    disabled={isSubmitting}
                    maxFiles={MAX_FILES_PER_STAGE}
                  />
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">
                    {formatMessage(t('createJob.beforePhotoHint'), { max: MAX_FILES_PER_STAGE })}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#2f3a3f]">
                    {formatMessage(t('createJob.afterPhoto'), { max: MAX_FILES_PER_STAGE })}
                  </Label>
                  <FileUpload
                    onFileSelect={(selectedFiles) => {
                      setFieldValue('afterFiles', selectedFiles);
                      setFieldTouched('afterFiles', true, false);
                    }}
                    error={(touched.afterFiles || submitCount > 0) && typeof errors.afterFiles === 'string' ? errors.afterFiles : undefined}
                    touched={Boolean(touched.afterFiles || submitCount > 0)}
                    disabled={isSubmitting}
                    maxFiles={MAX_FILES_PER_STAGE}
                  />
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">
                    {formatMessage(t('createJob.afterPhotoHint'), { max: MAX_FILES_PER_STAGE })}
                  </p>
                </div>
              </div>
            </div>

            </div>
            <aside className="hidden xl:block">
              <div className="sticky top-28 space-y-4">
                <SectionCard title={t('createJob.summary.title')} description={t('createJob.summary.desc')}>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.property')}</dt><dd className="text-right font-semibold text-[#2f3a3f]">{selectedPropertyLabel || t('createJob.selectProperty')}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.area')}</dt><dd className="text-right font-semibold text-[#2f3a3f]">{areas.find((area) => area.id === values.area_id)?.name || t('createJob.selectAreaOptional')}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.roomNumber')}</dt><dd className="text-right font-semibold text-[#2f3a3f]">{values.room?.name || t('createJob.selectRoomNumber')}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.category')}</dt><dd className="font-semibold text-[#2f3a3f]">{values.topic.title || t('createJob.category')}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.status')}</dt><dd><StatusBadge status={values.status} size="sm" /></dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.priority')}</dt><dd><PriorityBadge priority={values.priority} /></dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.summary.assignedTo')}</dt><dd className="text-right font-semibold text-[#2f3a3f]">{[session?.user?.first_name, session?.user?.last_name].filter(Boolean).join(' ') || session?.user?.username || t('createJob.summary.chiefReview')}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.summary.beforeCount')}</dt><dd className="font-semibold text-[#2f3a3f]">{values.files.length}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[#8a9499]">{t('createJob.summary.afterCount')}</dt><dd className="font-semibold text-[#2f3a3f]">{values.afterFiles.length}</dd></div>
                  </dl>
                </SectionCard>
                <SectionCard title={t('createJob.progress.title')} description={t('createJob.progress.desc')}>
                  <div className="space-y-3">
                    {([
                      [t('createJob.step.jobDetails'), stepStatus[0]],
                      [t('createJob.step.location'), stepStatus[1]],
                      [t('createJob.step.category'), stepStatus[2]],
                      [t('createJob.step.additional'), stepStatus[3]],
                      [t('createJob.step.photos'), stepStatus[4]],
                    ] as Array<[string, boolean]>).map(([label, done]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-[#6f7c82]">{label}</span>
                        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-[4px] px-2 text-xs font-semibold ${done ? 'bg-[#f8ffff] text-[#269fa8]' : 'bg-[#fafafa] text-[#8a9499]'}`}>
                          {done ? t('createJob.progress.done') : t('createJob.progress.open')}
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
                Boolean(values.description) && Boolean(values.priority) && Boolean(values.status),
                Boolean(values.area_id) || Boolean(values.room?.room_id),
                Boolean(values.topic.title),
                Array.isArray(values.files) && values.files.length > 0,
              ];
              const completedCount = stepStatus.filter(Boolean).length;
              const firstIncomplete = stepStatus.findIndex((s) => !s) + 1;
              const allReady = completedCount === stepStatus.length;
              return (
                <div
                  className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-[#e2e6e8] bg-white px-3 py-3 shadow-[0_-2px_10px_rgba(47,58,63,0.08)] sm:px-6 md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none"
                  style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
                >
                  <div className="w-full max-w-none md:max-w-none">
                    {!allReady && !isSubmitting && (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 md:hidden">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {formatMessage(t('createJob.mobileProgress'), { completed: completedCount, total: stepStatus.length, step: firstIncomplete })}
                        </span>
                        <button
                          type="button"
                          className="rounded-[4px] border border-[#46b8bc] bg-white px-2 py-1 text-[11px] font-semibold text-[#269fa8] hover:bg-[#f8ffff]"
                          onClick={() => {
                            if (typeof document !== 'undefined') {
                              document
                                .getElementById(`cj-step-${firstIncomplete}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                        >
                          {t('createJob.jump')}
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
                        if (!allReady && typeof document !== 'undefined' && window.innerWidth < 1280) {
                          event.preventDefault();
                          document
                            .getElementById(`cj-step-${firstIncomplete}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className={`h-12 w-full touch-manipulation rounded-[4px] text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-100 sm:text-base ${
                        allReady
                          ? 'bg-[#46b8bc] hover:bg-[#269fa8] disabled:bg-[#9ccfd1]'
                          : 'bg-[#46b8bc] hover:bg-[#269fa8] disabled:bg-[#9ccfd1]'
                      }`}
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-3">
                          <Loader className="h-5 w-5 animate-spin" />
                          <span>{t('createJob.creating')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Plus className="h-5 w-5" />
                          <span>
                            {allReady
                              ? t('createJob.cta')
                              : t('createJob.ctaFinishStep').replace('{n}', String(firstIncomplete))}
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
