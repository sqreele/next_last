'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useClientAuth0 } from '../../lib/auth0';
import { Formik, Form, Field, FormikErrors, useFormikContext, FormikHelpers } from 'formik';
import Link from 'next/link';
import {
  PreventiveMaintenance,
  FREQUENCY_OPTIONS,
  validateFrequency,
  FrequencyType,
  Topic,
  ServiceResponse,
  getPropertyDetails,
  MachineDetails, // Import MachineDetails
} from '@/app/lib/preventiveMaintenanceModels';
import apiClient from '@/app/lib/api-client';
import FileUpload from '@/app/components/jobs/FileUpload';
import { useToast } from '@/app/lib/hooks/use-toast';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';
import { PreviewImage } from '@/app/components/ui/UniversalImage';
import { preventiveMaintenanceService, 
  type CreatePreventiveMaintenanceData,
  type UpdatePreventiveMaintenanceData,
} from '@/app/lib/PreventiveMaintenanceService';
import TopicService from '@/app/lib/TopicService';
import MachineService from '@/app/lib/MachineService';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface PreventiveMaintenanceFormProps {
  pmId?: string | null;
  onSuccessAction: (data: PreventiveMaintenance) => void;
  initialData?: PreventiveMaintenance | null;
  onCancel?: () => void;
  machineId?: string; // Pre-select a machine if provided
}

interface FormValues {
  pmtitle: string;
  scheduled_date: string;
  completed_date: string;
  frequency: FrequencyType;
  custom_days: number | '' | null;
  notes: string;
  before_image_file: File | null;
  after_image_file: File | null;
  selected_topics: number[];
  selected_machine_ids: string[];
  property_id: string | null;
  procedure: string;
}

const PreventiveMaintenanceForm: React.FC<PreventiveMaintenanceFormProps> = ({
  pmId,
  onSuccessAction,
  initialData: initialDataProp,
  onCancel,
  machineId,
}) => {
  const { toast } = useToast();
  const { accessToken, user } = useClientAuth0();
  const {
    properties: userProperties,
  } = useProperties();
  const { selectedPropertyId: selectedProperty, setSelectedPropertyId: setContextSelectedProperty } = useUser();
  const hasProperties = userProperties && userProperties.length > 0;

  const [fetchedInitialData, setFetchedInitialData] = useState<PreventiveMaintenance | null>(null);
  const actualInitialData = initialDataProp || fetchedInitialData;

  const createdMaintenanceIdRef = useRef<string | null>(null);

  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [availableMachines, setAvailableMachines] = useState<MachineDetails[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImageUploading, setIsImageUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [beforeImagePreview, setBeforeImagePreview] = useState<string | null>(null);
  const [afterImagePreview, setAfterImagePreview] = useState<string | null>(null);
  const [loadingTopics, setLoadingTopics] = useState<boolean>(true);
  const [loadingMachines, setLoadingMachines] = useState<boolean>(true);

  const formatDateForInput = useCallback((date: Date): string => {
    // Use local methods to match the user's timezone for datetime-local inputs
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const result = `${year}-${month}-${day}T${hours}:${minutes}`;
    console.log('[formatDateForInput] Input Date:', date, 'Output:', result);
    return result;
  }, []);

  // Helper function to convert datetime-local values to ISO 8601 format
  const convertToISO8601 = useCallback((dateTimeLocal: string): string => {
    console.log('[convertToISO8601] Input:', dateTimeLocal, 'Type:', typeof dateTimeLocal);
    
    if (!dateTimeLocal) {
      console.log('[convertToISO8601] Empty input, returning empty string');
      return '';
    }
    
    try {
      // Create a Date object from the datetime-local value
      // This assumes the datetime-local value is in the user's local timezone
      const date = new Date(dateTimeLocal);
      console.log('[convertToISO8601] Created Date object:', date, 'Valid:', !isNaN(date.getTime()));
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      
      // Create a format that Django can parse: YYYY-MM-DDThh:mm
      // This matches Django's expected format without seconds
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      const isoString = `${year}-${month}-${day}T${hours}:${minutes}`;
      
      console.log('[convertToISO8601] Successfully converted to ISO 8601:', { 
        input: dateTimeLocal, 
        output: isoString,
        localDate: date.toString(),
        utcDate: date.toUTCString()
      });
      return isoString;
    } catch (error) {
      console.error('[convertToISO8601] Error converting datetime-local to ISO 8601:', error, 'Input:', dateTimeLocal);
      
      // If it's already in ISO format, return as is
      if (dateTimeLocal.includes('T') && (dateTimeLocal.includes('Z') || dateTimeLocal.includes('+'))) {
        console.log('[convertToISO8601] Input already in ISO format, returning as is:', dateTimeLocal);
        return dateTimeLocal;
      }
      
      // If it's in YYYY-MM-DDTHH:mm format, add seconds and convert to ISO
      if (dateTimeLocal.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        console.log('[convertToISO8601] Input in YYYY-MM-DDTHH:mm format, adding seconds and converting to ISO');
        const fallbackDate = new Date(dateTimeLocal + ':00');
        if (!isNaN(fallbackDate.getTime())) {
          // Use the same format: YYYY-MM-DDThh:mm
          const year = fallbackDate.getFullYear();
          const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
          const day = String(fallbackDate.getDate()).padStart(2, '0');
          const hours = String(fallbackDate.getHours()).padStart(2, '0');
          const minutes = String(fallbackDate.getMinutes()).padStart(2, '0');
          
          const fallbackISO = `${year}-${month}-${day}T${hours}:${minutes}`;
          console.log('[convertToISO8601] Fallback conversion successful:', fallbackISO);
          return fallbackISO;
        }
      }
      
      // Last resort: try to construct ISO string manually
      const fallback = `${dateTimeLocal}:00`;
      console.warn('[convertToISO8601] Using last resort fallback format:', fallback);
      return fallback;
    }
  }, []);

  // Helper function to validate ISO 8601 datetime format
  const validateISO8601Format = useCallback((isoString: string): boolean => {
    // Django expects: YYYY-MM-DDThh:mm[:ss[.uuuuuu]][+HH:MM|-HH:MM|Z]
    // Our format: YYYY-MM-DDThh:mm (local time, no timezone, no seconds)
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const isValid = isoRegex.test(isoString);
    console.log('[validateISO8601Format]', { isoString, isValid });
    return isValid;
  }, []);

  // Helper function to ensure datetime-local input format
  const ensureDateTimeLocalFormat = useCallback((dateString: string): string => {
    console.log('[ensureDateTimeLocalFormat] Input:', dateString, 'Type:', typeof dateString);
    
    if (!dateString) {
      console.log('[ensureDateTimeLocalFormat] Empty input, returning empty string');
      return '';
    }
    
    // If it's already in datetime-local format, return as is
    if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
      console.log('[ensureDateTimeLocalFormat] Input already in datetime-local format, returning as is:', dateString);
      return dateString;
    }
    
    // If it's a Date object or ISO string, convert to datetime-local format
    try {
      const date = new Date(dateString);
      console.log('[ensureDateTimeLocalFormat] Created Date object:', date, 'Valid:', !isNaN(date.getTime()));
      
      if (!isNaN(date.getTime())) {
        const formattedDate = formatDateForInput(date);
        console.log('[ensureDateTimeLocalFormat] Successfully formatted to datetime-local:', formattedDate);
        return formattedDate;
      }
    } catch (error) {
      console.error('[ensureDateTimeLocalFormat] Error ensuring datetime-local format:', error);
    }
    
    console.log('[ensureDateTimeLocalFormat] Could not convert, returning original:', dateString);
    return dateString;
  }, [formatDateForInput]);

  // Use a static default date to avoid hydration issues
  const [defaultScheduledDate, setDefaultScheduledDate] = useState<string>('');

  // Set the default date after component mounts to avoid hydration issues
  useEffect(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const defaultDate = `${year}-${month}-${day}T09:00`;
    console.log('[useEffect] Setting default scheduled date:', defaultDate);
    setDefaultScheduledDate(defaultDate);
  }, []);



  const getPropertyName = useCallback(
    (propertyId: string | null): string => {
      if (!propertyId) return 'No Property Selected';
      const foundProperty = userProperties?.find((p) => p.property_id === propertyId);
      return foundProperty?.name || `Property ${propertyId}`;
    },
    [userProperties]
  );

  // Form validation
  const validateForm = (values: FormValues): FormikErrors<FormValues> => {
    const errors: FormikErrors<FormValues> = {};

    if (!values.pmtitle?.trim()) errors.pmtitle = 'Title is required';
    if (!values.scheduled_date) errors.scheduled_date = 'Scheduled date is required';
    
    // Validate date formats
    if (values.scheduled_date) {
      try {
        const scheduledDate = new Date(values.scheduled_date);
        if (isNaN(scheduledDate.getTime())) {
          errors.scheduled_date = 'Invalid scheduled date format';
        } else {
          // Allow scheduling for current day and past dates for record-keeping
          // Only show warning for dates more than 1 day in the past
          if (!pmId) {
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            
            if (scheduledDate < oneDayAgo) {
              // Allow but show a warning - this could be for record-keeping
              console.warn('Scheduled date is more than 1 day in the past:', scheduledDate);
            }
          }
        }
      } catch (error) {
        errors.scheduled_date = 'Invalid scheduled date format';
      }
    }
    
    if (values.completed_date) {
      try {
        const completedDate = new Date(values.completed_date);
        if (isNaN(completedDate.getTime())) {
          errors.completed_date = 'Invalid completed date format';
        } else if (values.scheduled_date) {
          // Ensure completed date is not before scheduled date
          const scheduledDate = new Date(values.scheduled_date);
          if (completedDate < scheduledDate) {
            errors.completed_date = 'Completed date cannot be before scheduled date';
          }
        }
      } catch (error) {
        errors.completed_date = 'Invalid completed date format';
      }
    }
    
    if (!values.frequency) errors.frequency = 'Frequency is required';
    if (values.frequency === 'custom' && (!values.custom_days || values.custom_days < 1)) {
      errors.custom_days = 'Custom days must be at least 1';
    }
    if (values.frequency === 'custom' && values.custom_days && values.custom_days > 365) {
      errors.custom_days = 'Custom days cannot exceed 365';
    }
    if (!values.property_id) errors.property_id = 'Property is required';
    if (!values.selected_machine_ids || values.selected_machine_ids.length === 0) {
      errors.selected_machine_ids = 'At least one machine must be selected';
    }
    if (!values.selected_topics || values.selected_topics.length === 0) {
      errors.selected_topics = 'At least one topic must be selected';
    }

    return errors;
  };

  const getInitialValues = useCallback((): FormValues => {
    const currentData = actualInitialData;

    if (currentData) {
      console.log('[getInitialValues] currentData:', currentData);
      console.log('[getInitialValues] Date fields from currentData:', {
        scheduled_date: currentData.scheduled_date,
        scheduled_date_type: typeof currentData.scheduled_date,
        completed_date: currentData.completed_date,
        completed_date_type: typeof currentData.completed_date
      });
      
      const topicIds: number[] = currentData.topics
        ?.map((topic: Topic | number) =>
          typeof topic === 'object' && 'id' in topic ? topic.id : typeof topic === 'number' ? topic : null
        )
        .filter((id): id is number => id !== null) || [];

      let machineIdsFromData: string[] = [];
      if (currentData.machines) {
        machineIdsFromData = currentData.machines
          .map((machine: MachineDetails | string) =>
            typeof machine === 'object' && 'machine_id' in machine
              ? machine.machine_id
              : typeof machine === 'string'
              ? machine
              : null
          )
          .filter((id): id is string => id !== null);
      } else if (currentData.machine_id) {
        machineIdsFromData = [currentData.machine_id];
      }

      const finalMachineIds = machineId
        ? Array.from(new Set([machineId, ...machineIdsFromData]))
        : machineIdsFromData;

      const propertyDetails = getPropertyDetails(currentData.property_id);
      const propertyId = propertyDetails.id || selectedProperty || '';

      const customDays = currentData.custom_days === null || currentData.custom_days === undefined ? '' : currentData.custom_days;
      const selectedTopics = topicIds || [];
      const selectedMachineIds = finalMachineIds || [];

      const scheduledDate = currentData.scheduled_date
        ? ensureDateTimeLocalFormat(currentData.scheduled_date)
        : defaultScheduledDate;
      const completedDate = currentData.completed_date
        ? ensureDateTimeLocalFormat(currentData.completed_date)
        : '';

      console.log('[getInitialValues] Processed date fields:', {
        scheduled_date: scheduledDate,
        scheduled_date_type: typeof scheduledDate,
        completed_date: completedDate,
        completed_date_type: typeof completedDate
      });

      return {
        pmtitle: currentData.pmtitle || '',
        scheduled_date: scheduledDate,
        completed_date: completedDate,
        frequency: validateFrequency(currentData.frequency || 'monthly'),
        custom_days: customDays,
        notes: currentData.notes || '',
        before_image_file: null,
        after_image_file: null,
        selected_topics: selectedTopics,
        selected_machine_ids: selectedMachineIds,
        property_id: propertyId,
        procedure: currentData.procedure || '',
      };
    }

    return {
      pmtitle: '',
      scheduled_date: defaultScheduledDate,
      completed_date: '',
      frequency: 'monthly',
      custom_days: '',
      notes: '',
      before_image_file: null,
      after_image_file: null,
      selected_topics: [],
      selected_machine_ids: machineId ? [machineId] : [],
      property_id: selectedProperty,
      procedure: '',
    };
  }, [actualInitialData, selectedProperty, machineId, formatDateForInput, defaultScheduledDate, getPropertyDetails]);

  const clearError = useCallback(() => {
    setError(null);
    setSubmitError(null);
  }, []);

  const fetchAvailableTopics = useCallback(async () => {
    setLoadingTopics(true);
    try {
      const topicService = new TopicService();
      // Get access token from Auth0 hook
      const response = await topicService.getTopics(accessToken || undefined);
      if (response.success && response.data) {
        // Map the topics to ensure description is always a string
        const mappedTopics: Topic[] = response.data.map(topic => ({
          id: topic.id,
          title: topic.title,
          description: topic.description || '' // Provide empty string as default
        }));
        setAvailableTopics(mappedTopics);
      } else {
        throw new Error(response.message || 'Failed to fetch topics');
      }
    } catch (err: any) {
      console.error('Error fetching available topics:', err);
      setError('Failed to load topics. Please try again.');
    } finally {
      setLoadingTopics(false);
    }
  }, [accessToken]);

  const fetchAvailableMachines = useCallback(async (propertyId: string | null | undefined) => {
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
      const accessTokenForApi: string | undefined = accessToken || undefined;
      const response = await machineService.getMachines(propertyIdForApi, accessTokenForApi);
      if (response.success && response.data) {
        setAvailableMachines(response.data);
      } else {
        throw new Error(response.message || 'Failed to fetch machines');
      }
    } catch (err: any) {
      console.error('❌ Error fetching available machines:', err);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to load machines for the selected property.';
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        errorMessage = 'Authentication failed. Please refresh the page and try again.';
      } else if (err.message?.includes('404')) {
        errorMessage = 'No machines found for this property.';
      } else if (err.message?.includes('500')) {
        errorMessage = 'Server error. Please try again later.';
      }
      
      setError(errorMessage);
      setAvailableMachines([]);
    } finally {
      setLoadingMachines(false);
    }
  }, []);

  // Handle property ID changes and fetch machines
  useEffect(() => {
    if (selectedProperty) {
      fetchAvailableMachines(selectedProperty);
    } else {
      setAvailableMachines([]); // Clear machines if no property is selected
    }
  }, [selectedProperty, fetchAvailableMachines]);

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
          console.error('Error loading topics:', err);
          setError('Failed to load topics. Please try again.');
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
      setIsLoading(true);
      clearError();
      preventiveMaintenanceService
        .getPreventiveMaintenanceById(pmId)
        .then((response) => {
          if (!mounted) return;
          
          if (response.success && response.data) {
            console.log('[PreventiveMaintenanceForm] Fetched maintenance data:', response.data);
            setFetchedInitialData(response.data);
            if (response.data.before_image_url) setBeforeImagePreview(response.data.before_image_url);
            if (response.data.after_image_url) setAfterImagePreview(response.data.after_image_url);
            if (!response.data.property_id) {
              console.warn('[PreventiveMaintenanceForm] Missing property_id in maintenance data');
              setError('Warning: No property associated with this maintenance record. Please select one.');
            }
            if (!response.data.machine_id && !response.data.machines?.length) {
              console.warn('[PreventiveMaintenanceForm] Missing machine_id/machines in maintenance data');
            }
          } else {
            throw new Error(response.message || 'Failed to fetch maintenance data');
          }
        })
        .catch((err) => {
          if (!mounted) return;
          console.error('Error fetching maintenance data:', err);
          setError(err.message || 'Failed to fetch maintenance data');
          setFetchedInitialData(null);
        })
        .finally(() => {
          if (!mounted) return;
          setIsLoading(false);
        });
    } else if (initialDataProp) {
      console.log('[PreventiveMaintenanceForm] Using initialDataProp:', initialDataProp);
      if (initialDataProp.before_image_url) setBeforeImagePreview(initialDataProp.before_image_url);
      if (initialDataProp.after_image_url) setAfterImagePreview(initialDataProp.after_image_url);
      if (!initialDataProp.property_id) {
        console.warn('[PreventiveMaintenanceForm] Missing property_id in initialDataProp');
        setError('Warning: No property associated with this maintenance record. Please select one.');
      }
      if (!initialDataProp.machine_id && !initialDataProp.machines?.length) {
        console.warn('[PreventiveMaintenanceForm] Missing machine_id/machines in initialDataProp');
      }
    }

    return () => {
      mounted = false;
    };
  }, [pmId, initialDataProp]);

  // Now check for early return conditions after all hooks are defined
  if (!hasProperties) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <h2 className="font-semibold mb-2">No Properties Available</h2>
          <p>You need to have at least one property assigned to create preventive maintenance records.</p>
          <p className="mt-2 text-sm">Please contact your administrator to assign properties to your account.</p>
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
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          <h2 className="font-semibold mb-2">Loading Properties...</h2>
          <p>Please wait while we load your property information.</p>
        </div>
      </div>
    );
  }

  const handleFileSelection = (
    files: File[],
    type: 'before' | 'after',
    setFieldValue: (field: string, value: any) => void
  ) => {
    if (files.length === 0) {
      if (type === 'before') {
        setBeforeImagePreview(null);
        setFieldValue('before_image_file', null);
      } else {
        setAfterImagePreview(null);
        setFieldValue('after_image_file', null);
      }
      return;
    }
    const file = files[0];
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!validImageTypes.includes(file.type)) {
      toast.error(`Please upload an image file (JPEG, PNG, or GIF) for ${type === 'before' ? 'Before' : 'After'} image.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${type === 'before' ? 'Before' : 'After'} image must be less than 5MB`);
      return;
    }
    setFieldValue(type === 'before' ? 'before_image_file' : 'after_image_file', file);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'before') setBeforeImagePreview(reader.result as string);
      else setAfterImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (values: FormValues, formikHelpers: FormikHelpers<FormValues>) => {
    const { setSubmitting, resetForm } = formikHelpers;
    let isMounted = true;

    console.log('[FORM] handleSubmit called with values:', {
      ...values,
      scheduled_date: values.scheduled_date,
      scheduled_date_type: typeof values.scheduled_date,
      scheduled_date_length: values.scheduled_date?.length,
      completed_date: values.completed_date,
      completed_date_type: typeof values.completed_date,
      completed_date_length: values.completed_date?.length
    });

    clearError();
    setSubmitError(null);
    setIsLoading(true);

    const hasBeforeImageFile = values.before_image_file instanceof File;
    const hasAfterImageFile = values.after_image_file instanceof File;

    if (hasBeforeImageFile || hasAfterImageFile) {
      setIsImageUploading(true);
    }

    try {
      // Validate dates before submission
      if (values.completed_date && values.scheduled_date) {
        const scheduledDate = new Date(values.scheduled_date);
        const completedDate = new Date(values.completed_date);
        
        if (completedDate < scheduledDate) {
          setSubmitError('Completion date cannot be earlier than scheduled date');
          setIsLoading(false);
          setIsImageUploading(false);
          setSubmitting(false);
          return;
        }
      }

      // Ensure property_id is set when machines are selected
      if (values.selected_machine_ids && values.selected_machine_ids.length > 0 && !values.property_id) {
        setSubmitError('Property must be selected when machines are specified');
        setIsLoading(false);
        setIsImageUploading(false);
        setSubmitting(false);
        return;
      }

      // Prepare ISO 8601 strings for dates
      const scheduledDateISO = convertToISO8601(values.scheduled_date);
      const completedDateISO = values.completed_date
        ? convertToISO8601(values.completed_date)
        : undefined;

      // Debug: Log the exact date conversion process
      console.log('[FORM] Date conversion debug:', {
        original_scheduled_date: values.scheduled_date,
        converted_scheduled_date: scheduledDateISO,
        original_completed_date: values.completed_date,
        converted_completed_date: completedDateISO,
        scheduled_date_type: typeof scheduledDateISO,
        completed_date_type: typeof completedDateISO
      });

      const dataForService: CreatePreventiveMaintenanceData = {
        pmtitle: values.pmtitle.trim() || 'Untitled Maintenance',
        scheduled_date: scheduledDateISO,
        frequency: values.frequency,
        custom_days: values.frequency === 'custom' && values.custom_days ? Number(values.custom_days) : undefined,
        notes: values.notes?.trim() || '',
        // Note: property_id is not sent to backend - it's determined by the machines assigned
        topic_ids: values.selected_topics && values.selected_topics.length > 0 ? values.selected_topics : [],
        machine_ids: values.selected_machine_ids && values.selected_machine_ids.length > 0 ? values.selected_machine_ids : [],
        completed_date: completedDateISO,
        before_image: hasBeforeImageFile ? values.before_image_file! : undefined,
        after_image: hasAfterImageFile ? values.after_image_file! : undefined,
        procedure: values.procedure?.trim() || '',
      };

      console.log('[FORM] handleSubmit - Data prepared for service:', JSON.stringify(dataForService, (key, value) => {
        if (value instanceof File) {
          return { name: value.name, size: value.size, type: value.type, _isAFile: true };
        }
        return value;
      }, 2));

      // Log the final date formats being sent
      console.log('[FORM] Final date formats:', {
        scheduled_date: dataForService.scheduled_date,
        completed_date: dataForService.completed_date,
        scheduled_date_type: typeof dataForService.scheduled_date,
        completed_date_type: typeof dataForService.completed_date
      });

      // Log the complete data being sent to the backend
      console.log('[FORM] Complete data being sent to backend:', {
        ...dataForService,
        scheduled_date: dataForService.scheduled_date,
        completed_date: dataForService.completed_date,
        before_image: dataForService.before_image ? 'File present' : 'No file',
        after_image: dataForService.after_image ? 'File present' : 'No file'
      });

      // Additional debugging: Check the exact string values being sent
      console.log('[FORM] Raw date string values:', {
        scheduled_date_raw: JSON.stringify(dataForService.scheduled_date),
        completed_date_raw: JSON.stringify(dataForService.completed_date),
        scheduled_date_length: dataForService.scheduled_date?.length,
        completed_date_length: dataForService.completed_date?.length
      });

      // Additional validation before sending to backend
      console.log('[FORM] Data validation before sending:', {
        pmtitle: dataForService.pmtitle,
        scheduled_date: dataForService.scheduled_date,
        frequency: dataForService.frequency,
        custom_days: dataForService.custom_days,
        // property_id not sent to backend - determined by machines
        topic_ids: dataForService.topic_ids,
        machine_ids: dataForService.machine_ids,
        completed_date: dataForService.completed_date,
        has_before_image: !!dataForService.before_image,
        has_after_image: !!dataForService.after_image
      });

      // Validate required fields
      if (!dataForService.scheduled_date) {
        throw new Error('Scheduled date is required');
      }
      if (!dataForService.frequency) {
        throw new Error('Frequency is required');
      }
      if (dataForService.frequency === 'custom' && !dataForService.custom_days) {
        throw new Error('Custom days is required when frequency is custom');
      }
      // Note: property_id validation removed - it's determined by the machines assigned
      if (!dataForService.topic_ids || dataForService.topic_ids.length === 0) {
        throw new Error('At least one topic is required');
      }
      if (!dataForService.machine_ids || dataForService.machine_ids.length === 0) {
        throw new Error('At least one machine is required');
      }

      const maintenanceIdToUpdate = pmId || (actualInitialData?.pm_id ?? null);
      let response: ServiceResponse<PreventiveMaintenance>;

      if (maintenanceIdToUpdate) {
        response = await preventiveMaintenanceService.updatePreventiveMaintenance(
          maintenanceIdToUpdate,
          dataForService as UpdatePreventiveMaintenanceData
        );
      } else {
        response = await preventiveMaintenanceService.createPreventiveMaintenance(dataForService);
      }

      if (!isMounted) return;

      console.log('[FORM] handleSubmit - Service response:', response);

      if (response.success && response.data) {
        toast.success(maintenanceIdToUpdate ? 'Maintenance record updated successfully' : 'Maintenance record created successfully');
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
        const errMsg = response.message || (response.error ? JSON.stringify(response.error) : 'Failed to save maintenance record');
        throw new Error(errMsg);
      }
    } catch (error: any) {
      if (!isMounted) return;
      
      console.error('[FORM] handleSubmit - Error submitting form:', error);
      console.error('[FORM] Error response details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
      
      let errorMessage = 'An unexpected error occurred.';
      if (error.response?.data) {
        const responseData = error.response.data;
        console.log('[FORM] Backend error response data:', responseData);
        
        if (typeof responseData === 'string') errorMessage = responseData;
        else if (responseData.detail) errorMessage = responseData.detail;
        else if (responseData.message) errorMessage = responseData.message;
        else if (typeof responseData === 'object') {
          const fieldErrors = Object.entries(responseData)
            .map(([field, errs]) => `${field}: ${(Array.isArray(errs) ? errs.join(', ') : errs)}`)
            .join('; ');
          if (fieldErrors) errorMessage = `Validation errors: ${fieldErrors}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (isMounted) {
        setSubmitting(false);
        setIsLoading(false);
        setIsImageUploading(false);
      }
    }
  };

  if (isLoading && pmId && !actualInitialData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      {(error || submitError) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <div className="flex justify-between">
            <p className="whitespace-pre-wrap">{error || submitError}</p>
            <button onClick={clearError} className="text-red-700" type="button" aria-label="Close error message">
              ×
            </button>
          </div>
        </div>
      )}

      <Formik
        initialValues={getInitialValues()}
        validate={validateForm}
        enableReinitialize
        onSubmit={(values, formikHelpers) => {
          console.log('[Formik] onSubmit called with values:', {
            ...values,
            scheduled_date: values.scheduled_date,
            scheduled_date_type: typeof values.scheduled_date,
            scheduled_date_length: values.scheduled_date?.length,
            completed_date: values.completed_date,
            completed_date_type: typeof values.completed_date,
            completed_date_length: values.completed_date?.length
          });
          return handleSubmit(values, formikHelpers);
        }}
      >
        {({ values, errors, touched, isSubmitting, setFieldValue }) => {
          // Debug form values changes
          React.useEffect(() => {
            console.log('[Formik] Form values changed:', {
              scheduled_date: values.scheduled_date,
              scheduled_date_type: typeof values.scheduled_date,
              scheduled_date_length: values.scheduled_date?.length,
              completed_date: values.completed_date,
              completed_date_type: typeof values.completed_date,
              completed_date_length: values.completed_date?.length
            });
          }, [values.scheduled_date, values.completed_date]);

          return (
          <Form aria-label="Preventive Maintenance Form">
            <div className="mb-6">
              <label htmlFor="property_id" className="block text-sm font-medium text-gray-700 mb-1">
                Property <span className="text-red-500">*</span>
              </label>
              <Field
                as="select"
                id="property_id"
                name="property_id"
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const newPropertyId = e.target.value || '';
                  setFieldValue('property_id', newPropertyId);
                  if (newPropertyId && setContextSelectedProperty) {
                    setContextSelectedProperty(newPropertyId);
                  }
                  setFieldValue('selected_machine_ids', []);
                }}
                className={`w-full p-2 border rounded-md ${
                  errors.property_id && touched.property_id ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select a Property</option>
                {userProperties?.map((property) => (
                  <option key={property.property_id} value={property.property_id}>
                    {property.name}
                  </option>
                ))}
              </Field>
              {errors.property_id && touched.property_id && (
                <p className="mt-1 text-sm text-red-500">{errors.property_id}</p>
              )}
            </div>

            {/* Maintenance Title */}
            <div className="mb-6">
              <label htmlFor="pmtitle" className="block text-sm font-medium text-gray-700 mb-1">
                Maintenance Title <span className="text-red-500">*</span>
              </label>
              <Field
                type="text"
                id="pmtitle"
                name="pmtitle"
                className={`w-full p-2 border rounded-md ${
                  errors.pmtitle && touched.pmtitle ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter maintenance title"
              />
              {errors.pmtitle && touched.pmtitle && <p className="mt-1 text-sm text-red-500">{errors.pmtitle}</p>}
            </div>

            {/* Scheduled Date */}
            <div className="mb-6">
              <label htmlFor="scheduled_date" className="block text-sm font-medium text-gray-700 mb-1">
                Scheduled Date & Time <span className="text-red-500">*</span>
              </label>
              <Field
                type="datetime-local"
                id="scheduled_date"
                name="scheduled_date"
                className={`w-full p-2 border rounded-md ${
                  errors.scheduled_date && touched.scheduled_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.scheduled_date && touched.scheduled_date && (
                <p className="mt-1 text-sm text-red-500">{errors.scheduled_date}</p>
              )}
            </div>

            {/* Completed Date */}
            <div className="mb-6">
              <label htmlFor="completed_date" className="block text-sm font-medium text-gray-700 mb-1">
                Completed Date & Time
              </label>
              <Field
                type="datetime-local"
                id="completed_date"
                name="completed_date"
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* Maintenance Frequency */}
            <div className="mb-6">
              <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 mb-1">
                Maintenance Frequency <span className="text-red-500">*</span>
              </label>
              <Field
                as="select"
                id="frequency"
                name="frequency"
                className={`w-full p-2 border rounded-md ${
                  errors.frequency && touched.frequency ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
              {errors.frequency && touched.frequency && <p className="mt-1 text-sm text-red-500">{errors.frequency}</p>}
            </div>

            {/* Custom Days Interval */}
            {values.frequency === 'custom' && (
              <div className="mb-6">
                <label htmlFor="custom_days" className="block text-sm font-medium text-gray-700 mb-1">
                  Custom Days Interval <span className="text-red-500">*</span>
                </label>
                <Field
                  type="number"
                  id="custom_days"
                  name="custom_days"
                  min="1"
                  max="365"
                  className={`w-full p-2 border rounded-md ${
                    errors.custom_days && touched.custom_days ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.custom_days && touched.custom_days && (
                  <p className="mt-1 text-sm text-red-500">{errors.custom_days}</p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="mb-6">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <Field
                as="textarea"
                id="notes"
                name="notes"
                rows={4}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Enter any notes for this maintenance task"
              />
            </div>

            {/* Procedure */}
            <div className="mb-6">
              <label htmlFor="procedure" className="block text-sm font-medium text-gray-700 mb-1">
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

            {/* Machines Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Machines {loadingMachines && <span className="text-xs text-gray-500">(Loading...)</span>}
              </label>
              <div
                className={`border rounded-md p-4 max-h-60 overflow-y-auto bg-white ${
                  errors.selected_machine_ids && touched.selected_machine_ids ? 'border-red-500' : 'border-gray-300'
                }`}
                role="group"
                aria-label="Select machines"
              >
                {!values.property_id ? (
                  <p className="text-sm text-gray-500">Please select a property to see available machines.</p>
                ) : loadingMachines ? (
                  <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="ml-2 text-sm text-gray-500">Loading machines...</p>
                  </div>
                ) : availableMachines.length > 0 ? (
                  <div className="space-y-3">
                    {availableMachines.map((machineItem) => (
                      <div key={machineItem.machine_id} className="relative">
                        <label className="flex items-center cursor-pointer">
                          <Field name="selected_machine_ids">
                            {({ field: { value: selectedMachinesValue }, form: { setFieldValue: setMachineFieldValue } }: any) => (
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                id={`machine-${machineItem.machine_id}`}
                                checked={selectedMachinesValue.includes(machineItem.machine_id)}
                                onChange={(e) => {
                                  const currentSelection = selectedMachinesValue || [];
                                  if (e.target.checked) {
                                    setMachineFieldValue('selected_machine_ids', [
                                      ...currentSelection,
                                      machineItem.machine_id,
                                    ]);
                                  } else {
                                    setMachineFieldValue(
                                      'selected_machine_ids',
                                      currentSelection.filter((id: string) => id !== machineItem.machine_id)
                                    );
                                  }
                                }}
                              />
                            )}
                          </Field>
                          <span className="ml-3 text-sm text-gray-700 flex-1">
                            {machineItem.name} ({machineItem.machine_id})
                          </span>
                        </label>
                        {values.selected_machine_ids.includes(machineItem.machine_id) && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">No machines available for this property.</p>
                    {values.property_id && !error && (
                      <button
                        type="button"
                        onClick={() => fetchAvailableMachines(values.property_id ?? undefined)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Refresh Machines
                      </button>
                    )}
                  </div>
                )}
              </div>
              {errors.selected_machine_ids && touched.selected_machine_ids && (
                <p className="mt-1 text-sm text-red-500">{errors.selected_machine_ids}</p>
              )}
            </div>

            {/* Topics Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topics <span className="text-red-500">*</span>{' '}
                {loadingTopics && <span className="text-xs text-gray-500">(Loading...)</span>}
              </label>
              <div
                className={`border rounded-md p-4 max-h-60 overflow-y-auto bg-white ${
                  errors.selected_topics && touched.selected_topics ? 'border-red-500' : 'border-gray-300'
                }`}
                role="group"
                aria-label="Select topics"
              >
                {loadingTopics ? (
                  <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="ml-2 text-sm text-gray-500">Loading topics...</p>
                  </div>
                ) : availableTopics.length > 0 ? (
                  <div className="space-y-3">
                    {availableTopics.map((topic) => (
                      <div key={topic.id} className="relative">
                        <label className="flex items-center cursor-pointer">
                          <Field name="selected_topics">
                            {({ field: { value: selectedTopicsValue }, form: { setFieldValue: setTopicFieldValue } }: any) => (
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                id={`topic-${topic.id}`}
                                checked={selectedTopicsValue.includes(topic.id)}
                                onChange={(e) => {
                                  const currentSelection = selectedTopicsValue || [];
                                  if (e.target.checked) {
                                    setTopicFieldValue('selected_topics', [...currentSelection, topic.id]);
                                  } else {
                                    setTopicFieldValue('selected_topics', currentSelection.filter((id: number) => id !== topic.id));
                                  }
                                }}
                              />
                            )}
                          </Field>
                          <span className="ml-3 text-sm text-gray-700 flex-1">{topic.title}</span>
                        </label>
                        {values.selected_topics.includes(topic.id) && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">No topics available.</p>
                    {!error && (
                      <button
                        type="button"
                        onClick={fetchAvailableTopics}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Refresh Topics
                      </button>
                    )}
                  </div>
                )}
              </div>
              {errors.selected_topics && touched.selected_topics && (
                <p className="mt-1 text-sm text-red-500">{errors.selected_topics}</p>
              )}
              {values.selected_topics.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-gray-600 mb-2">
                    {values.selected_topics.length} topic{values.selected_topics.length > 1 ? 's' : ''} selected:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {values.selected_topics.map((topicId) => {
                      const topic = availableTopics.find((t) => t.id === topicId);
                      return topic ? (
                        <span
                          key={topic.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                        >
                          {topic.title}
                          <button
                            type="button"
                            onClick={() => {
                              setFieldValue('selected_topics', values.selected_topics.filter((id) => id !== topic.id));
                            }}
                            className="ml-1 text-blue-600 hover:text-blue-800"
                            aria-label={`Remove ${topic.title}`}
                          >
                            ×
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Image Uploads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Before Image</label>
                <FileUpload
                  onFileSelect={(files) => handleFileSelection(files, 'before', setFieldValue)}
                  maxFiles={1}
                  maxSize={5}
                  error={errors.before_image_file as string}
                  touched={touched.before_image_file}
                  disabled={isSubmitting || isLoading}
                />
                {beforeImagePreview && (
                  <div className="mt-3 relative w-full h-40 bg-gray-100 rounded-md overflow-hidden">
                    <PreviewImage
                      src={beforeImagePreview}
                      alt="Before Maintenance Preview"
                      className="w-full h-full object-contain"
                      width={400}
                      height={160}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBeforeImagePreview(null);
                        setFieldValue('before_image_file', null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center shadow-md"
                      aria-label="Remove before image"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">After Image</label>
                <FileUpload
                  onFileSelect={(files) => handleFileSelection(files, 'after', setFieldValue)}
                  maxFiles={1}
                  maxSize={5}
                  error={errors.after_image_file as string}
                  touched={touched.after_image_file}
                  disabled={isSubmitting || isLoading}
                />
                {afterImagePreview && (
                  <div className="mt-3 relative w-full h-40 bg-gray-100 rounded-md overflow-hidden">
                    <PreviewImage
                      src={afterImagePreview}
                      alt="After Maintenance Preview"
                      className="w-full h-full object-contain"
                      width={400}
                      height={160}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAfterImagePreview(null);
                        setFieldValue('after_image_file', null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center shadow-md"
                      aria-label="Remove after image"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-between mt-8 gap-4">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-md shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors"
                  disabled={isSubmitting || isLoading}
                >
                  Cancel
                </button>
              )}
              <div className="flex space-x-4">
                {isImageUploading && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                    <span className="text-sm">Uploading images...</span>
                  </div>
                )}
                <button
                  type="submit"
                  className={`px-6 py-2.5 ${
                    isSubmitting || isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  } text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors`}
                  disabled={isSubmitting || isLoading}
                >
                  {isSubmitting || isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      <span>{pmId || actualInitialData ? 'Updating...' : 'Creating...'}</span>
                    </div>
                  ) : (
                    <span>{pmId || actualInitialData ? 'Update Maintenance' : 'Create Maintenance'}</span>
                  )}
                </button>
              </div>
            </div>
          </Form>
        );
        }}
      </Formik>
    </div>
  );
};

export default PreventiveMaintenanceForm;