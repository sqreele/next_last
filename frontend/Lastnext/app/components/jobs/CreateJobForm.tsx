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
import { useSession, signIn } from '@/app/lib/session.client';
import { Label } from "@/app/components/ui/label";
import RoomAutocomplete from '@/app/components/jobs/RoomAutocomplete';
import FileUpload from '@/app/components/jobs/FileUpload';
import { Room, TopicFromAPI } from '@/app/lib/types';
import { useRouter } from 'next/navigation';
import { useUser, useJobs } from '@/app/lib/stores/mainStore';

// Use Next.js API routes for proxying to the backend
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);

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
    if (!session?.user) {
      setError('Please login first');
      await signIn();
      return;
    }

    if (!selectedProperty) {
      setError('Please select a property');
      setSubmitting(false);
      return;
    }

    if (!values.room || !values.room.room_id) {
      setError('Please select a valid room');
      setSubmitting(false);
      return;
    }

    const fileError = validateFiles(values.files);
    if (fileError) {
      setError(fileError);
      setSubmitting(false);
      return;
    }

    setError(null);

    try {
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

      const response = await axios.post(`/api/jobs/`, formData, { withCredentials: true });

      resetForm();
      triggerJobCreation();
      if (onJobCreated) onJobCreated();
      router.push('/dashboard/myJobs');
    } catch (error) {
      console.error('Submission error:', error);
      setError('Failed to create job. Please try again.');
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
      setError('Failed to fetch rooms and topics. Please try again.');
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
    <div className="space-y-8">
      {/* Error Alert */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-blue-600">
            <Loader className="h-6 w-6 animate-spin" />
            <span className="text-lg font-medium">Loading form data...</span>
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
                  <Form className="space-y-8">
          {/* Basic Information Section */}
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-6 rounded-2xl border border-blue-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Plus className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Description */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description" className="font-medium text-gray-700">
                    Job Description <span className="text-red-500">*</span>
                  </Label>
                  <Field
                    as={Textarea}
                    id="description"
                    name="description"
                    placeholder="Describe the maintenance job in detail..."
                    disabled={isSubmitting}
                    className={`w-full min-h-[100px] p-4 text-base border-2 rounded-xl transition-all duration-200 ${
                      touched.description && errors.description 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                        : 'border-gray-200 focus:border-blue-500 focus:ring-blue-200'
                    } focus:ring-4 focus:outline-none resize-none`}
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
                  <Label className="font-medium text-gray-700">
                    Status <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={values.status}
                    onValueChange={(value) => setFieldValue('status', value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-12 border-2 rounded-xl transition-all duration-200 ${
                      touched.status && errors.status ? 'border-red-300' : 'border-gray-200'
                    }`}>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
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
                  <Label className="font-medium text-gray-700">
                    Priority <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={values.priority}
                    onValueChange={(value) => setFieldValue('priority', value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className={`h-12 border-2 rounded-xl transition-all duration-200 ${
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
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Building className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Assignment & Location</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Room Selection */}
                <div className="md:col-span-2 space-y-2">
                  <Label className="font-medium text-gray-700">
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
                  <Label className="font-medium text-gray-700">
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
                    <SelectTrigger className={`h-12 border-2 rounded-xl transition-all duration-200 ${
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
            <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-6 rounded-2xl border border-purple-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Plus className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Additional Details</h3>
              </div>
              
              <div className="space-y-6">
                {/* Remarks */}
                <div className="space-y-2">
                  <Label htmlFor="remarks" className="font-medium text-gray-700">
                    Remarks
                  </Label>
                  <Field
                    as={Textarea}
                    id="remarks"
                    name="remarks"
                    placeholder="Enter any additional remarks or special instructions..."
                    disabled={isSubmitting}
                    className={`w-full min-h-[100px] p-4 text-base border-2 rounded-xl transition-all duration-200 ${
                      touched.remarks && errors.remarks 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                        : 'border-gray-200 focus:border-purple-500 focus:ring-purple-200'
                    } focus:ring-4 focus:outline-none resize-none`}
                  />
                  {touched.remarks && errors.remarks && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.remarks}
                    </p>
                  )}
                </div>

                {/* Checkboxes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-white/60 rounded-xl border border-purple-200">
                    <Checkbox
                      id="is_defective"
                      checked={values.is_defective}
                      onCheckedChange={(checked) => setFieldValue('is_defective', checked)}
                      disabled={isSubmitting}
                      className="h-5 w-5 text-purple-600 border-2 border-purple-300 rounded"
                    />
                    <Label htmlFor="is_defective" className="text-gray-700 font-medium cursor-pointer">
                      Is Defective?
                    </Label>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-white/60 rounded-xl border border-purple-200">
                    <Checkbox
                      id="is_preventivemaintenance"
                      checked={values.is_preventivemaintenance}
                      onCheckedChange={(checked) => setFieldValue('is_preventivemaintenance', checked)}
                      disabled={isSubmitting}
                      className="h-5 w-5 text-purple-600 border-2 border-purple-300 rounded"
                    />
                    <Label htmlFor="is_preventivemaintenance" className="text-gray-700 font-medium cursor-pointer">
                      Is Preventive Maintenance?
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-2xl border border-amber-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Upload className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Images & Documentation</h3>
              </div>
              
              <div className="space-y-2">
                <Label className="font-medium text-gray-700">
                  Images <span className="text-red-500">*</span>
                </Label>
                <FileUpload
                  onFileSelect={(selectedFiles) => setFieldValue('files', selectedFiles)}
                  error={touched.files && typeof errors.files === 'string' ? errors.files : undefined}
                  disabled={isSubmitting}
                />
                <p className="text-sm text-gray-500">
                  Upload images to document the current condition or issue. Maximum file size: 5MB per image.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center">
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="w-full max-w-md h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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