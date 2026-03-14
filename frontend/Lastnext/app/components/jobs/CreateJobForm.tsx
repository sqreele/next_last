'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Formik, Form, Field, FormikErrors } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { Button } from "@/app/components/ui/button";
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
import { Room, TopicFromAPI } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { useUser, useJobs } from '@/app/lib/stores/mainStore';

// Use Next.js API routes for proxying to the backend
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

const initialValues: FormValues = {
  description: '',
  status: 'pending',
  priority: 'medium',
  remarks: '',
  topic: { title: '', description: '' },
  room: null,
  files: [],
  is_defective: false,
  is_preventivemaintenance: false,
};

const CreateJobForm: React.FC<{ onJobCreated?: () => void }> = ({ onJobCreated }) => {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isSubmittingRef = React.useRef(false); // Prevent double submission
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
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);

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

  const showErrorToast = (message: string) => {
    toast({
      title: 'Error',
      description: message,
      variant: 'destructive',
    });
  };

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
      console.log('🔧 Auto-selected property:', propertyId);
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
      console.log('⚠️ Submission already in progress, ignoring duplicate submit');
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
      values.files.forEach(file => {
        formData.append('images', file);
      });

      await axios.post(`/api/jobs/`, formData, { withCredentials: true });

      const statusLabel = values.status.replace('_', ' ');
      setSuccessMessage(`Job created successfully with status: ${statusLabel}. Redirecting to My Jobs...`);

      // Success - reset form and redirect
      resetForm();
      triggerJobCreation();
      if (onJobCreated) onJobCreated();
      toast({
        title: 'Success',
        description: 'Job created successfully.',
      });
      setTimeout(() => {
        router.push('/dashboard/myJobs');
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

  const fetchData = useCallback(async () => {
    if (!session?.user?.accessToken) {
      console.log('No session or access token available');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const propertyParam = selectedProperty || currentPropertyId || undefined;
      const [roomsResponse, topicsResponse] = await Promise.all([
        axios.get(`/api/rooms/`, { withCredentials: true, params: propertyParam ? { property: propertyParam } : undefined }),
        axios.get(`/api/topics/`, { withCredentials: true })
      ]);
      setRooms(roomsResponse.data);
      setTopics(topicsResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      const errorMessage = formatApiError(error, 'Failed to fetch rooms and topics. Please try again.');
      setError(errorMessage);
      showErrorToast(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.accessToken, selectedProperty, currentPropertyId]);

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

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center p-6 sm:p-8">
          <div className="flex items-center gap-3 text-blue-600">
            <Loader className="h-6 w-6 animate-spin" />
            <span className="text-base font-medium sm:text-lg">Loading form data...</span>
          </div>
        </div>
      )}

      {/* Form - only show when not loading */}
      {!isLoading && (
        <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, setFieldValue, isSubmitting }) => (
                  <Form className="space-y-5 sm:space-y-6 md:space-y-8">
          {/* Basic Information Section */}
            <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 sm:rounded-2xl sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-blue-100 p-1.5 sm:p-2">
                  <Plus className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">Basic Information</h3>
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
                    } resize-none rounded-xl focus:outline-none focus:ring-4`}
                  />
                  {touched.description && errors.description && (
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
                    onValueChange={(value) => setFieldValue('status', value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 border-2 rounded-xl transition-all duration-200 sm:h-12 ${
                      touched.status && errors.status ? 'border-red-300' : 'border-gray-200'
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
                  {touched.status && errors.status && (
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
                  <Select
                    value={values.priority}
                    onValueChange={(value) => setFieldValue('priority', value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 border-2 rounded-xl transition-all duration-200 sm:h-12 ${
                      touched.priority && errors.priority ? 'border-red-300' : 'border-gray-200'
                    }`}>
                      <SelectValue placeholder="Select Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  {touched.priority && errors.priority && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.priority}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Assignment Section */}
            <div className="rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:rounded-2xl sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-green-100 p-1.5 sm:p-2">
                  <Building className="h-4 w-4 text-green-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">Assignment & Location</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {/* Room Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Room <span className="text-red-500">*</span>
                  </Label>
                  <RoomAutocomplete
                    rooms={rooms}
                    selectedRoom={values.room}
                    onSelect={(selectedRoom) => setFieldValue('room', selectedRoom)}
                    disabled={isSubmitting}
                  />
                  {touched.room && errors.room && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {typeof errors.room === 'string' ? errors.room : (errors.room as FormikErrors<Room>).room_id}
                    </p>
                  )}
                </div>

                {/* Topic Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-gray-700 sm:text-base">
                    Topic <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={values.topic.title}
                    onValueChange={(value) => {
                      const topic = topics.find(t => t.title === value);
                      if (topic) setFieldValue('topic', { title: topic.title, description: topic.description || '' });
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-11 border-2 rounded-xl transition-all duration-200 sm:h-12 ${
                      touched.topic?.title && errors.topic?.title ? 'border-red-300' : 'border-gray-200'
                    }`}>
                      <SelectValue placeholder="Select a maintenance topic" />
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
                  {touched.topic?.title && errors.topic?.title && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.topic.title}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Details Section */}
            <div className="rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-violet-50 p-4 sm:rounded-2xl sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-purple-100 p-1.5 sm:p-2">
                  <Plus className="h-4 w-4 text-purple-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">Additional Details</h3>
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
                      touched.remarks && errors.remarks 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                        : 'border-gray-200 focus:border-purple-500 focus:ring-purple-200'
                    } resize-none rounded-xl focus:outline-none focus:ring-4`}
                  />
                  {touched.remarks && errors.remarks && (
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
            <div className="rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-4 sm:rounded-2xl sm:p-6">
              <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
                <div className="rounded-lg bg-amber-100 p-1.5 sm:p-2">
                  <Upload className="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">Images & Documentation</h3>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 sm:text-base">
                  Images (up to {MAX_FILES}) <span className="text-red-500">*</span>
                </Label>
                <FileUpload
                  onFileSelect={(selectedFiles) => setFieldValue('files', selectedFiles)}
                  error={touched.files && typeof errors.files === 'string' ? errors.files : undefined}
                  disabled={isSubmitting}
                  maxFiles={MAX_FILES}
                />
                <p className="text-xs text-gray-500 sm:text-sm">
                  Upload up to {MAX_FILES} images to document the issue. Max 5MB each.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="sticky bottom-0 z-20 -mx-2 border-t bg-white/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:text-lg md:mx-auto md:max-w-md md:rounded-2xl"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-3">
                    <Loader className="h-5 w-5 animate-spin" />
                    <span>Creating Job...</span>
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
