'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Formik, Form, Field, FormikErrors } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { Button } from "@/app/components/ui/button";
import { PageHeader, PriorityBadge, SectionCard, StatusBadge } from '@/app/components/pcms-ui';
import { useT } from '@/app/lib/i18n/LocaleProvider';
import { Textarea } from "@/app/components/ui/textarea";
import { Plus, Loader, AlertCircle, CheckCircle, Search, Check } from 'lucide-react';
import { Checkbox } from "@/app/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession, signIn } from '@/app/lib/session.client';
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import RoomAutocomplete from '@/app/components/jobs/RoomAutocomplete';
import FileUpload from '@/app/components/jobs/FileUpload';
import { Room, TopicFromAPI, Area } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { useUser } from '@/app/lib/stores/mainStore';

// Use Next.js API routes for proxying to the backend
const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_STAGE = 2; // Maximum images allowed for before/after sections

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

const validationSchema = Yup.object().shape({
  description: Yup.string().required('Description is required'),
  status: Yup.string().required('Status is required'),
  priority: Yup.string().required('Priority is required'),
  remarks: Yup.string().optional(),
  topic: Yup.object().shape({
    title: Yup.string().required('Category is required'),
    description: Yup.string(),
  }).required(),
  room: Yup.object()
    .nullable()
    .shape({
      room_id: Yup.number().typeError('Invalid Room ID').min(1, 'Room must be selected'),
      name: Yup.string(),
    })
    .test(
      'room-or-area',
      'Select either a room or an area',
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
      'Select either an area or a room',
      function (value) {
        const room = this.parent.room as { room_id?: number } | null;
        if (room && room.room_id) return true;
        return value != null;
      },
    ),
  files: Yup.array()
    .of(
      Yup.mixed<File>()
        .test('fileSize', 'File too large (max 5MB)', (value) => !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE)
        .test('fileType', 'Only image files allowed', (value) => !value || !(value instanceof File) || value.type.startsWith('image/'))
    )
    .min(1, 'At least one image is required')
    .max(MAX_FILES_PER_STAGE, `You can upload up to ${MAX_FILES_PER_STAGE} before images`)
    .required('At least one before image is required'),
  afterFiles: Yup.array()
    .of(
      Yup.mixed<File>()
        .test('fileSize', 'File too large (max 5MB)', (value) => !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE)
        .test('fileType', 'Only image files allowed', (value) => !value || !(value instanceof File) || value.type.startsWith('image/'))
    )
    .max(MAX_FILES_PER_STAGE, `You can upload up to ${MAX_FILES_PER_STAGE} after images`),
  is_defective: Yup.boolean().default(false),
  is_preventivemaintenance: Yup.boolean().default(false),
});


const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const STATUS_SELECT_CLASSES: Record<string, string> = {
  pending: 'border-blue-300 bg-blue-50 text-blue-900',
  in_progress: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  waiting_sparepart: 'border-orange-300 bg-orange-50 text-orange-900',
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  cancelled: 'border-red-300 bg-red-50 text-red-900',
};

const STATUS_OPTION_CLASSES: Record<string, string> = {
  pending: 'font-bold text-blue-900 focus:bg-blue-50',
  in_progress: 'font-bold text-indigo-900 focus:bg-indigo-50',
  waiting_sparepart: 'font-bold text-orange-900 focus:bg-orange-50',
  completed: 'font-bold text-emerald-900 focus:bg-emerald-50',
  cancelled: 'font-bold text-red-900 focus:bg-red-50',
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

const CreateJobForm: React.FC<{ onJobCreated?: () => void }> = ({ onJobCreated }) => {
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useT();
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

  const formatApiError = (error: unknown, fallbackMessage: string): string => {
    if (!axios.isAxiosError(error)) {
      if (error instanceof Error && error.message) return error.message;
      return fallbackMessage;
    }

    const data = error.response?.data;
    if (!data) return error.message || fallbackMessage;
    if (typeof data === 'string') return data;
    if (typeof data !== 'object') return fallbackMessage;

    const payload = data as Record<string, unknown>;
    const directMessage = payload.detail || payload.message || payload.error;
    const fieldErrors = Object.entries(payload)
      .filter(([key]) => !['detail', 'message', 'error', 'non_field_errors'].includes(key))
      .map(([key, value]) => {
        if (Array.isArray(value)) return `${key}: ${value.join(', ')}`;
        return `${key}: ${String(value)}`;
      });

    const nonFieldErrors = Array.isArray(payload.non_field_errors)
      ? payload.non_field_errors.join(', ')
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
      title: 'Error',
      description: message,
      variant: 'destructive',
    });
  }, [toast]);

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
      return 'At least one image is required';
    }
    if (files.length > MAX_FILES_PER_STAGE) {
      return `You can upload up to ${MAX_FILES_PER_STAGE} images`;
    }
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return `File ${file.name} is too large (max 5MB)`;
      }
      if (!file.type.startsWith('image/')) {
        return `File ${file.name} is not an image`;
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
        const message = 'Please login first';
        setError(message);
        showErrorToast(message);
        await signIn();
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      if (!selectedProperty) {
        const message = 'Please select a property';
        setError(message);
        showErrorToast(message);
        isSubmittingRef.current = false;
        setSubmitting(false);
        return;
      }

      const hasRoom = Boolean(values.room && values.room.room_id);
      const hasArea = values.area_id != null;
      if (!hasRoom && !hasArea) {
        const message = 'Please select either a room or an area';
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

      const statusLabel = values.status.replace('_', ' ');
      setSuccessMessage(`Maintenance job created successfully with status: ${statusLabel}. Redirecting to Maintenance Jobs...`);

      // Success - reset form and redirect
      resetForm();
      if (onJobCreated) onJobCreated();
      toast({
        title: 'Success',
        description: 'Maintenance job created successfully.',
        variant: 'success',
      });
      setTimeout(() => {
        router.push('/dashboard/my-jobs');
      }, 1500);
      
      // Note: Don't reset isSubmittingRef here because we're navigating away
    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = formatApiError(error, 'Failed to create job. Please try again.');
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
      const errorMessage = formatApiError(error, 'Failed to fetch rooms. Please try again.');
      setError(errorMessage);
      showErrorToast(errorMessage);
      setRooms([]);
    } finally {
      setIsRoomLoading(false);
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId, normalizeRoomsResponse, showErrorToast]);

  const fetchFloorsForArea = useCallback(async (areaId: number | null) => {
    if (!session?.user?.accessToken || !areaId) {
      setFloors([]);
      return;
    }

    const propertyParam = selectedProperty || currentPropertyId || undefined;
    setIsFloorLoading(true);
    try {
      const response = await axios.get(`/api/rooms/`, {
        withCredentials: true,
        params: {
          floors_only: 'true',
          area_id: areaId,
          ...(propertyParam ? { property: propertyParam } : {}),
        },
      });
      setFloors(normalizeFloorsResponse(response.data));
    } catch (error) {
      console.error('Error fetching floors:', error);
      const errorMessage = formatApiError(error, 'Failed to fetch floors. Please try again.');
      setError(errorMessage);
      showErrorToast(errorMessage);
      setFloors([]);
    } finally {
      setIsFloorLoading(false);
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId, normalizeFloorsResponse, showErrorToast]);

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
        axios.get(`/api/topics/`, { withCredentials: true }),
        axios.get(`/api/areas/`, {
          withCredentials: true,
          params: { is_active: 'true', ...(propertyParam ? { property_id: propertyParam } : {}) },
        }),
      ]);
      setRooms(normalizeRoomsResponse(roomsResponse.data));
      setTopics(topicsResponse.data);
      const areasData = areasResponse.data;
      const areasList: Area[] = Array.isArray(areasData) ? areasData : (areasData?.results || []);
      setAreas(areasList);
    } catch (error) {
      console.error('Error fetching data:', error);
      const errorMessage = formatApiError(error, 'Failed to fetch rooms and topics. Please try again.');
      setError(errorMessage);
      showErrorToast(errorMessage);
    } finally {
      clearLoadingAfterMinTime();
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId, clearLoadingAfterMinTime, normalizeRoomsResponse, showErrorToast]);

  useEffect(() => {
    if (session?.user?.accessToken) {
      fetchData();
    }
  }, [fetchData, session?.user?.accessToken, selectedProperty]);

  const STEPS = [
    { num: 1, label: t('createJob.step.status'), bgClass: 'bg-blue-100 text-blue-800 border-blue-400' },
    { num: 2, label: t('createJob.step.location'), bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-400' },
    { num: 3, label: t('createJob.step.details'), bgClass: 'bg-purple-100 text-purple-800 border-purple-400' },
    { num: 4, label: t('createJob.step.evidence'), bgClass: 'bg-amber-100 text-amber-800 border-amber-400' },
  ];

  return (
    <div className="space-y-4 pb-32 sm:space-y-6 sm:pb-32 md:space-y-8 md:pb-6">
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
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
            <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
          </div>
          <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
            Loading create maintenance job form...
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
        {({ values, errors, touched, submitCount, setFieldValue, setFieldTouched, isSubmitting }) => (
                  <Form className="relative space-y-5 sm:space-y-6 md:space-y-8">
          <PageHeader title={t('createJob.title')} description={t('createJob.subtitle')} />

          {/* Completion state per step — drives the stepper and the bottom CTA hint. */}
          {(() => {
            const stepStatus = [
              Boolean(values.description) && Boolean(values.priority) && Boolean(values.status),
              Boolean(values.area_id) || Boolean(values.room?.room_id),
              Boolean(values.topic.title),
              Array.isArray(values.files) && values.files.length > 0,
            ];
            const completedCount = stepStatus.filter(Boolean).length;
            return (
              <>
                {/* Sticky mobile stepper — clickable, completion-aware */}
                <nav
                  aria-label="Form steps"
                  className="sticky top-0 z-10 -mx-3 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 xl:hidden"
                  style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>{completedCount} of {STEPS.length} steps ready</span>
                    <span className="text-blue-700">{Math.round((completedCount / STEPS.length) * 100)}%</span>
                  </div>
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
                    />
                  </div>
                  <ol className="flex items-center justify-between gap-1">
                    {STEPS.map((step, i) => {
                      const done = stepStatus[i];
                      return (
                        <React.Fragment key={step.num}>
                          <li className="flex flex-1 flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof document !== 'undefined') {
                                  document
                                    .getElementById(`cj-step-${step.num}`)
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                              }}
                              aria-current={done ? undefined : 'step'}
                              aria-label={`Go to step ${step.num}: ${step.label}${done ? ' (complete)' : ''}`}
                              className={`flex h-9 w-9 touch-manipulation items-center justify-center rounded-full border-2 text-sm font-bold transition-all active:scale-95 sm:h-10 sm:w-10 ${
                                done
                                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                  : step.bgClass
                              }`}
                            >
                              {done ? <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" /> : step.num}
                            </button>
                            <span className="text-[10px] font-semibold text-slate-700 sm:text-[11px]">{step.label}</span>
                          </li>
                          {i < STEPS.length - 1 && (
                            <div
                              className={`mb-4 h-0.5 flex-1 transition-colors ${
                                stepStatus[i] && stepStatus[i + 1] ? 'bg-emerald-400' : 'bg-slate-200'
                              }`}
                              aria-hidden
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </ol>
                </nav>
              </>
            );
          })()}

          <div className="grid w-full gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5 sm:space-y-6 md:space-y-8">
          {/* Upload loading overlay */}
          {isSubmitting && (
            <div
              className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
              aria-live="polite"
              aria-busy="true"
              role="status"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
                <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
              </div>
              <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
                {t('createJob.creating')}
              </p>
            </div>
          )}
          {/* Step 1: Status & Priority */}
            <div id="cj-step-1" className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6 scroll-mt-24">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white shadow sm:h-9 sm:w-9">1</div>
                <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Status &amp; Priority</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Description */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description" className="text-sm font-semibold text-slate-900 sm:text-base">
                    Job Description <span className="text-red-500">*</span>
                  </Label>
                  <Field
                    as={Textarea}
                    id="description"
                    name="description"
                    placeholder="Describe the maintenance job in detail..."
                    disabled={isSubmitting}
                    className={`w-full min-h-[96px] border-2 p-3 text-sm transition-all duration-200 sm:min-h-[110px] sm:p-4 sm:text-base ${
                      touched.description && errors.description 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                        : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-200'
                    } pcms-textarea resize-none focus:outline-none focus:ring-4`}
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
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    Status <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={values.status}
                    onValueChange={(value) => {
                      setFieldValue('status', value);
                      setFieldTouched('status', true, false);
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 rounded-xl border-2 font-bold shadow-sm transition-all duration-200 sm:h-12 ${
                      (touched.status || submitCount > 0) && errors.status
                        ? 'border-red-400 bg-red-50 text-red-900'
                        : STATUS_SELECT_CLASSES[values.status] || 'border-slate-300 bg-white text-slate-900'
                    }`}>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending" className={STATUS_OPTION_CLASSES.pending}>Pending</SelectItem>
                      <SelectItem value="in_progress" className={STATUS_OPTION_CLASSES.in_progress}>In Progress</SelectItem>
                      <SelectItem value="waiting_sparepart" className={STATUS_OPTION_CLASSES.waiting_sparepart}>Waiting Sparepart</SelectItem>
                      <SelectItem value="completed" className={STATUS_OPTION_CLASSES.completed}>Completed</SelectItem>
                      <SelectItem value="cancelled" className={STATUS_OPTION_CLASSES.cancelled}>Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Selected</span>
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
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    Priority <span className="text-red-500">*</span>
                  </Label>
                  <div
                    className={`grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 ${(touched.priority || submitCount > 0) && errors.priority ? 'ring-2 ring-red-400 rounded-xl p-1' : ''}`}
                    role="radiogroup"
                    aria-label="Priority"
                  >
                    {PRIORITY_OPTIONS.map((option) => {
                      const active = values.priority === option.value;
                      const colorMap: Record<string, string> = {
                        low: active ? 'bg-green-500 text-white border-green-500 shadow-md' : 'border-green-200 text-green-700 hover:bg-green-50',
                        medium: active ? 'bg-yellow-500 text-white border-yellow-500 shadow-md' : 'border-yellow-200 text-yellow-700 hover:bg-yellow-50',
                        high: active ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'border-orange-200 text-orange-700 hover:bg-orange-50',
                        critical: active ? 'bg-red-600 text-white border-red-600 shadow-md' : 'border-red-200 text-red-700 hover:bg-red-50',
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
                          className={`min-h-[44px] touch-manipulation rounded-xl border-2 px-3 py-2 text-sm font-bold transition-all duration-150 active:scale-95 ${colorMap[option.value]}`}
                        >
                          {option.label}
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
              </div>
            </div>

            {/* Step 2: Assignment & Location */}
            <div id="cj-step-2" className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6 scroll-mt-24">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-green-600 text-sm font-black text-white shadow sm:h-9 sm:w-9">2</div>
                <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Location &amp; Room</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Area Selection - required if no room selected */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    Area / Zone {values.room && values.room.room_id ? (
                      <span className="text-xs font-medium text-slate-600">(optional)</span>
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
                        void fetchRooms(null, null);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 border-2 rounded-xl bg-white text-slate-900 sm:h-12 ${
                      (touched.area_id || submitCount > 0) && errors.area_id ? 'border-red-400 bg-red-50' : 'border-slate-300'
                    }`}>
                      <SelectValue placeholder="Select an area (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No area</SelectItem>
                      {areas.length ? areas.map(area => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.name}{area.property_name ? ` · ${area.property_name}` : ''}
                        </SelectItem>
                      )) : (
                        <SelectItem value="empty" disabled>No areas configured</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {values.area_id && (
                    <p className="text-xs font-bold text-cyan-700">
                      Selected area will be saved with the job and shown on Jobs by Area.
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
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    Floor <span className="text-xs font-medium text-slate-600">(select area first)</span>
                  </Label>
                  <Select
                    value={values.floor || 'none'}
                    onValueChange={(value) => {
                      const nextFloor = value === 'none' ? null : value;
                      setFieldValue('floor', nextFloor);
                      setFieldValue('room', null);
                      setFieldTouched('room', false, false);
                      setRooms([]);

                      if (values.area_id && nextFloor) {
                        void fetchRooms(values.area_id, nextFloor);
                      }
                    }}
                    disabled={isSubmitting || isFloorLoading || !values.area_id}
                  >
                    <SelectTrigger className="h-11 border-2 rounded-xl border-slate-300 bg-white text-slate-900 sm:h-12">
                      {isFloorLoading ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader className="h-4 w-4 animate-spin" /> Loading floors...
                        </span>
                      ) : (
                        <SelectValue placeholder="Select a floor" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a floor</SelectItem>
                      {floors.length ? floors.map(floor => (
                        <SelectItem key={floor} value={floor}>
                          Floor {floor}
                        </SelectItem>
                      )) : (
                        <SelectItem value="empty" disabled>No floors found for this area</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {values.area_id && !isFloorLoading && floors.length === 0 && (
                    <p className="text-sm font-medium text-slate-600">No floors found for this area</p>
                  )}
                </div>

                {/* Room Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    Room Number {values.area_id ? (
                      <span className="text-xs font-medium text-slate-600">(optional)</span>
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
                    emptyText={values.area_id && values.floor ? 'No rooms found for this floor' : 'No rooms found'}
                    placeholder={values.area_id && !values.floor ? 'Select floor or pick a room...' : 'Select room number...'}
                  />
                  {values.floor && !isRoomLoading && rooms.length === 0 && (
                    <p className="text-sm font-medium text-slate-600">No rooms found for this floor</p>
                  )}
                  {(touched.room || submitCount > 0) && errors.room && (
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {typeof errors.room === 'string' ? errors.room : (errors.room as FormikErrors<Room>).room_id}
                    </p>
                  )}
                </div>

                {/* Topic Selection */}
                <div className="md:col-span-2 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs font-medium text-slate-600 sm:text-sm">
                      Choose one category. Tap the selected tag again to clear it.
                    </p>
                  </div>

                  {values.topic.title && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">Selected category</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFieldValue('topic', { title: '', description: '' });
                          setFieldTouched('topic.title', true, false);
                        }}
                        disabled={isSubmitting}
                        className={`inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full border-2 border-blue-600 bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 active:scale-[0.98] ${
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
                        placeholder="Search categories..."
                        aria-label="Search categories"
                        className="h-11 rounded-xl border-2 border-slate-300 bg-white pl-10 text-base text-slate-900 placeholder:text-slate-500 sm:h-12"
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
                        aria-label="Choose one maintenance category"
                        aria-multiselectable="false"
                        aria-invalid={hasCategoryError}
                        className={`flex flex-wrap gap-2 rounded-2xl border bg-white p-2 sm:gap-3 sm:p-3 ${
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
                              className={`inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] sm:px-5 ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'
                                  : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800'
                              } ${isSubmitting ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                              {isSelected && <Check className="h-4 w-4" aria-hidden />}
                              <span>{topic.title}</span>
                            </button>
                          );
                        }) : (
                          <div className="flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-500 sm:px-5">
                            Loading topics...
                          </div>
                        )}

                        {topics.length > 0 && visibleTopics.length === 0 && (
                          <div className="flex min-h-11 items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
                            No categories match “{categorySearch}”.
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

            {/* Step 3: Job Details */}
            <div id="cj-step-3" className="w-full rounded-2xl border border-purple-200 bg-purple-50 p-3 shadow-sm sm:p-6 scroll-mt-24">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-sm font-black text-white shadow sm:h-9 sm:w-9">3</div>
                <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Job Details</h3>
              </div>
              
              <div className="space-y-4 sm:space-y-6">
                {/* Remarks */}
                <div className="space-y-2">
                  <Label htmlFor="remarks" className="text-sm font-semibold text-slate-900 sm:text-base">
                    Remarks
                  </Label>
                  <Field
                    as={Textarea}
                    id="remarks"
                    name="remarks"
                    placeholder="Enter any additional remarks or special instructions..."
                    disabled={isSubmitting}
                    className={`w-full min-h-[96px] border-2 p-3 text-sm transition-all duration-200 sm:min-h-[110px] sm:p-4 sm:text-base ${
                      (touched.remarks || submitCount > 0) && errors.remarks 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                        : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-purple-500 focus:ring-purple-200'
                    } pcms-textarea resize-none focus:outline-none focus:ring-4`}
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
                  <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-white/60 p-3 sm:p-4">
                    <Checkbox
                      id="is_defective"
                      checked={values.is_defective}
                      onCheckedChange={(checked) => setFieldValue('is_defective', checked)}
                      disabled={isSubmitting}
                      className="h-5 w-5 text-purple-600 border-2 border-purple-300 rounded"
                    />
                    <Label htmlFor="is_defective" className="cursor-pointer text-sm font-semibold text-slate-900 sm:text-base">
                      Is Defective?
                    </Label>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-white/60 p-3 sm:p-4">
                    <Checkbox
                      id="is_preventivemaintenance"
                      checked={values.is_preventivemaintenance}
                      onCheckedChange={(checked) => setFieldValue('is_preventivemaintenance', checked)}
                      disabled={isSubmitting}
                      className="h-5 w-5 text-purple-600 border-2 border-purple-300 rounded"
                    />
                    <Label htmlFor="is_preventivemaintenance" className="cursor-pointer text-sm font-semibold text-slate-900 sm:text-base">
                      Is Preventive Maintenance?
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Evidence Upload */}
            <div id="cj-step-4" className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6 scroll-mt-24">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-white shadow sm:h-9 sm:w-9">4</div>
                <h3 className="text-lg font-bold text-slate-900 sm:text-xl">Photo Evidence</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    Before Photo / Evidence (up to {MAX_FILES_PER_STAGE}) <span className="text-red-500">*</span>
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
                    Upload up to 2 before photos to document the issue. Max 5MB each.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 sm:text-base">
                    After Photo / Evidence (up to {MAX_FILES_PER_STAGE})
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
                    Optional: upload up to 2 after photos when the job is already fixed. Max 5MB each.
                  </p>
                </div>
              </div>
            </div>

            </div>
            <aside className="hidden xl:block">
              <div className="sticky top-24 space-y-4">
                <SectionCard title="Maintenance job summary" description="Review before creating the job.">
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Property</dt><dd className="font-semibold text-slate-900">{selectedProperty || 'Select property'}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Room / Area</dt><dd className="font-semibold text-slate-900">{values.room?.name || 'Select room'}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Category</dt><dd className="font-semibold text-slate-900">{values.topic.title || 'Select category'}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Status</dt><dd><StatusBadge status={values.status} size="sm" /></dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Priority</dt><dd><PriorityBadge priority={values.priority} /></dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Assigned to</dt><dd className="font-semibold text-slate-900">{[session?.user?.first_name, session?.user?.last_name].filter(Boolean).join(' ') || session?.user?.username || 'Chief Engineer review'}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Before photo count</dt><dd className="font-semibold text-slate-900">{values.files.length}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">After photo count</dt><dd className="font-semibold text-slate-900">{values.afterFiles.length}</dd></div>
                  </dl>
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
                  className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-slate-200 bg-white px-3 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:px-6 md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none"
                  style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
                >
                  <div className="w-full max-w-none md:max-w-none">
                    {!allReady && !isSubmitting && (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 md:hidden">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {completedCount}/{stepStatus.length} steps complete · finish step {firstIncomplete} to continue
                        </span>
                        <button
                          type="button"
                          className="rounded-md bg-amber-200 px-2 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-300"
                          onClick={() => {
                            if (typeof document !== 'undefined') {
                              document
                                .getElementById(`cj-step-${firstIncomplete}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                        >
                          Jump
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
                      className={`h-14 w-full touch-manipulation rounded-xl text-base font-bold text-white shadow-md transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-100 sm:text-lg ${
                        allReady
                          ? 'bg-blue-600 shadow-blue-600/30 hover:bg-blue-700 disabled:bg-blue-400'
                          : 'bg-slate-700 shadow-slate-700/30 hover:bg-slate-800 disabled:bg-slate-400'
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
          </Form>
        )}
      </Formik>
      )}
    </div>
  );
};

export default CreateJobForm;
