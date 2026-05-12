'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Formik, Form, Field, FormikErrors } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { Button } from "@/app/components/ui/button";
import { PageHeader, PriorityBadge, SectionCard } from '@/app/components/pcms-ui';
import { Textarea } from "@/app/components/ui/textarea";
import { Plus, ChevronDown, ChevronUp, Loader, AlertCircle, CheckCircle, Upload, X, Building } from 'lucide-react';
import { Checkbox } from "@/app/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession, signIn } from '@/app/lib/session.client';
import { Label } from "@/app/components/ui/label";
import RoomAutocomplete from '@/app/components/jobs/RoomAutocomplete';
import FileUpload from '@/app/components/jobs/FileUpload';
import { Room, TopicFromAPI, Area } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { useUser, useJobs } from '@/app/lib/stores/mainStore';

// Use Next.js API routes for proxying to the backend
const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 2; // Maximum number of images allowed

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
  is_defective: boolean;
  is_preventivemaintenance: boolean;
}

const validationSchema = Yup.object().shape({
  description: Yup.string().required('Description is required'),
  status: Yup.string().required('Status is required'),
  priority: Yup.string().required('Priority is required'),
  remarks: Yup.string().optional(),
  topic: Yup.object().shape({
    title: Yup.string().required('Topic is required'),
    description: Yup.string(),
  }).required(),
  room: Yup.object()
    .nullable()
    .required('Room selection is required')
    .shape({
      room_id: Yup.number().typeError('Invalid Room ID').required('Room ID missing').min(1, 'Room must be selected'),
      name: Yup.string().required('Room name missing'),
    }),
  files: Yup.array()
    .of(
      Yup.mixed<File>()
        .test('fileSize', 'File too large (max 5MB)', (value) => !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE)
        .test('fileType', 'Only image files allowed', (value) => !value || !(value instanceof File) || value.type.startsWith('image/'))
    )
    .min(1, 'At least one image is required')
    .max(MAX_FILES, `You can upload up to ${MAX_FILES} images`)
    .required('At least one image is required'),
  is_defective: Yup.boolean().default(false),
  is_preventivemaintenance: Yup.boolean().default(false),
});


const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

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
  is_defective: false,
  is_preventivemaintenance: false,
};

const CreateJobForm: React.FC<{ onJobCreated?: () => void }> = ({ onJobCreated }) => {
  const { data: session } = useSession();
  const { toast } = useToast();
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
  const { addJob } = useJobs();
  
  // Since we don't have triggerJobCreation in the new store, we'll create a simple counter
  const [jobCreationCount, setJobCreationCount] = useState(0);
  const triggerJobCreation = () => {
    setJobCreationCount(prev => prev + 1);
  };
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [topics, setTopics] = useState<TopicFromAPI[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [isFloorLoading, setIsFloorLoading] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);

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
    if (files.length > MAX_FILES) {
      return `You can upload up to ${MAX_FILES} images`;
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

      if (!values.room || !values.room.room_id) {
        const message = 'Please select a valid room';
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

      // All validations passed, proceed with submission
      const formData = new FormData();
      formData.append('description', values.description.trim());
      formData.append('status', values.status);
      formData.append('priority', values.priority);
      formData.append('room_id', values.room.room_id.toString());
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
      values.files.forEach(file => {
        formData.append('images', file);
      });

      await axios.post(`/api/jobs/`, formData, { withCredentials: true });

      const statusLabel = values.status.replace('_', ' ');
      setSuccessMessage(`Maintenance job created successfully with status: ${statusLabel}. Redirecting to Maintenance Jobs...`);

      // Success - reset form and redirect
      resetForm();
      triggerJobCreation();
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

  return (
    <div className="space-y-4 pb-24 sm:space-y-6 sm:pb-24 md:space-y-8 md:pb-0">
      {/* Error Alert */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="break-words text-sm text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-sm text-green-800">{successMessage}</AlertDescription>
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
          <PageHeader title="Create Maintenance Job" description="Use the 3-step hotel workflow: Location, Job Details, then Assignment & Evidence." />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                Creating maintenance job...
              </p>
            </div>
          )}
          {/* 1. Location Section */}
            <div className="rounded-[2rem] border border-[var(--pcms-border)] bg-white/88 p-4 shadow-[var(--pcms-shadow-card)] sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-blue-100 p-1.5 sm:p-2">
                  <Plus className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">1. Location</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Description */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium text-gray-700 sm:text-base">
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
                        : 'border-gray-200 focus:border-blue-500 focus:ring-blue-200'
                    } pcms-textarea resize-none focus:outline-none focus:ring-4`}
                  />
                  {(touched.description || submitCount > 0) && errors.description && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.description}
                    </p>
                  )}
                </div>

                {/* Status and Priority */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
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
                    <SelectTrigger className={`h-11 border-2 rounded-xl transition-all duration-200 sm:h-12 ${
                      (touched.status || submitCount > 0) && errors.status ? 'border-red-300' : 'border-gray-200'
                    }`}>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="waiting_sparepart">Waiting Sparepart</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  {(touched.status || submitCount > 0) && errors.status && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.status}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Priority <span className="text-red-500">*</span>
                  </Label>
                  <div
                    className={`pcms-priority-picker ${(touched.priority || submitCount > 0) && errors.priority ? 'pcms-priority-picker--error' : ''}`}
                    role="radiogroup"
                    aria-label="Priority"
                  >
                    {PRIORITY_OPTIONS.map((option) => {
                      const active = values.priority === option.value;
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
                          className={`pcms-priority-picker__option pcms-priority-picker__option--${option.value} ${active ? 'is-active' : ''}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {(touched.priority || submitCount > 0) && errors.priority && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.priority}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Assignment Section */}
            <div className="rounded-[2rem] border border-[var(--pcms-border)] bg-white/88 p-4 shadow-[var(--pcms-shadow-card)] sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-green-100 p-1.5 sm:p-2">
                  <Building className="h-4 w-4 text-green-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">Assignment & Location</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Area Selection (optional) */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Area / Zone <span className="text-xs text-gray-400">(optional)</span>
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
                      } else {
                        void fetchRooms(null, null);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="h-11 border-2 rounded-xl border-gray-200 sm:h-12">
                      <SelectValue placeholder="Select an area (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No area</SelectItem>
                      {areas.length ? areas.map(area => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.name}
                        </SelectItem>
                      )) : (
                        <SelectItem value="empty" disabled>No areas configured</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Floor Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Floor <span className="text-xs text-gray-400">(select area first)</span>
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
                    <SelectTrigger className="h-11 border-2 rounded-xl border-gray-200 sm:h-12">
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
                    <p className="text-sm text-gray-500">No floors found for this area</p>
                  )}
                </div>

                {/* Room Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Room Number <span className="text-red-500">*</span>
                  </Label>
                  <RoomAutocomplete
                    rooms={rooms}
                    selectedRoom={values.room}
                    onSelect={(selectedRoom) => {
                      setFieldValue('room', selectedRoom);
                      setFieldTouched('room', true, false);
                    }}
                    disabled={isSubmitting || Boolean(values.area_id && !values.floor)}
                    loading={isRoomLoading}
                    emptyText="No rooms found for this floor"
                    placeholder={values.area_id && !values.floor ? 'Select floor first...' : 'Select room number...'}
                  />
                  {values.floor && !isRoomLoading && rooms.length === 0 && (
                    <p className="text-sm text-gray-500">No rooms found for this floor</p>
                  )}
                  {(touched.room || submitCount > 0) && errors.room && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {typeof errors.room === 'string' ? errors.room : (errors.room as FormikErrors<Room>).room_id}
                    </p>
                  )}
                </div>

                {/* Topic Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={values.topic.title}
                    onValueChange={(value) => {
                      const topic = topics.find(t => t.title === value);
                      if (topic) {
                        setFieldValue('topic', { title: topic.title, description: topic.description || '' });
                        setFieldTouched('topic.title', true, false);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 border-2 rounded-xl transition-all duration-200 sm:h-12 ${
                      (touched.topic?.title || submitCount > 0) && errors.topic?.title ? 'border-red-300' : 'border-gray-200'
                    }`}>
                      <SelectValue placeholder="Select a maintenance category" />
                    </SelectTrigger>
                    <SelectContent>
                      {topics.length ? topics.map(topic => (
                        <SelectItem key={topic.id} value={topic.title}>
                          {topic.title}
                        </SelectItem>
                      )) : (
                        <SelectItem value="loading" disabled>Loading topics...</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {(touched.topic?.title || submitCount > 0) && errors.topic?.title && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.topic.title}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Job Details Section */}
            <div className="rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-violet-50 p-4 sm:rounded-2xl sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-purple-100 p-1.5 sm:p-2">
                  <Plus className="h-4 w-4 text-purple-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">2. Job Details</h3>
              </div>
              
              <div className="space-y-4 sm:space-y-6">
                {/* Remarks */}
                <div className="space-y-2">
                  <Label htmlFor="remarks" className="text-sm font-medium text-gray-700 sm:text-base">
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
                        : 'border-gray-200 focus:border-purple-500 focus:ring-purple-200'
                    } pcms-textarea resize-none focus:outline-none focus:ring-4`}
                  />
                  {(touched.remarks || submitCount > 0) && errors.remarks && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
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
                    <Label htmlFor="is_defective" className="cursor-pointer text-sm font-medium text-gray-700 sm:text-base">
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
                    <Label htmlFor="is_preventivemaintenance" className="cursor-pointer text-sm font-medium text-gray-700 sm:text-base">
                      Is Preventive Maintenance?
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="rounded-[2rem] border border-[var(--pcms-border)] bg-white/88 p-4 shadow-[var(--pcms-shadow-card)] sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-amber-100 p-1.5 sm:p-2">
                  <Upload className="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">3. Assignment & Evidence</h3>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 sm:text-base">
                  Before Photo / Evidence (up to {MAX_FILES}) <span className="text-red-500">*</span>
                </Label>
                <FileUpload
                  onFileSelect={(selectedFiles) => {
                    setFieldValue('files', selectedFiles);
                    setFieldTouched('files', true, false);
                  }}
                  error={(touched.files || submitCount > 0) && typeof errors.files === 'string' ? errors.files : undefined}
                  disabled={isSubmitting}
                  maxFiles={MAX_FILES}
                />
                <p className="text-xs text-gray-500 sm:text-sm">
                  Upload before photos or evidence to document the issue. Max 5MB each.
                </p>
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
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Priority</dt><dd><PriorityBadge priority={values.priority} /></dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Technician</dt><dd className="font-semibold text-slate-900">Chief Engineer review</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Before photo count</dt><dd className="font-semibold text-slate-900">{values.files.length}</dd></div>
                  </dl>
                </SectionCard>
              </div>
            </aside>
            </div>

            {/* Submit Button */}
            <div className="sticky bottom-24 z-20 -mx-2 border-t border-[var(--pcms-border)] bg-white/90 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="h-14 w-full rounded-full bg-[var(--pcms-accent-gradient)] text-base font-black text-white shadow-[var(--pcms-button-shadow)] transition-all duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg md:mx-auto md:max-w-md"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-3">
                    <Loader className="h-5 w-5 animate-spin" />
                    <span>Creating maintenance job...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Plus className="h-5 w-5" />
                    <span>Create Maintenance Job</span>
                  </div>
                )}
              </Button>
            </div>
          </Form>
        )}
      </Formik>
      )}
    </div>
  );
};

export default CreateJobForm;
