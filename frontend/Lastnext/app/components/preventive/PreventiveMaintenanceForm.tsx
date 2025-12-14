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
import FileUpload from '@/app/components/jobs/FileUpload';
import { useToast } from '@/app/lib/hooks/use-toast';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';
import { useSession } from '@/app/lib/session.client';
import { PreviewImage } from '@/app/components/ui/UniversalImage';
import { preventiveMaintenanceService, 
  type CreatePreventiveMaintenanceData,
  type UpdatePreventiveMaintenanceData,
  setPreventiveMaintenanceServiceToken,
} from '@/app/lib/PreventiveMaintenanceService';
import TopicService from '@/app/lib/TopicService';
import MachineService from '@/app/lib/MachineService';
import { fetchAllMaintenanceProcedures, type MaintenanceProcedureTemplate } from '@/app/lib/maintenanceProcedures';
import apiClient from '@/app/lib/api-client';
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
  procedure_template: number | ''; // Maintenance task template ID (empty string for "none")
  assigned_to: string;
}

type MaintenanceTaskOption = {
  id: number;
  name: string;
  group_id?: string | null;
  category?: string;
  frequency: string;
  difficulty_level: string;
  responsible_department?: string;
  custom_days?: number | null;
};

const PreventiveMaintenanceForm: React.FC<PreventiveMaintenanceFormProps> = ({
  pmId,
  onSuccessAction,
  initialData: initialDataProp,
  onCancel,
  machineId,
}) => {
  const { toast } = useToast();
  const { accessToken: auth0AccessToken, user: auth0User } = useClientAuth0();
  const { data: session } = useSession();
  const accessToken = auth0AccessToken || session?.user?.accessToken || null;
  const user = session?.user || auth0User || null;
  
  const {
    properties: userProperties,
  } = useProperties();
  const { selectedPropertyId: selectedProperty } = useUser();
  const hasProperties = userProperties && userProperties.length > 0;

  const [fetchedInitialData, setFetchedInitialData] = useState<PreventiveMaintenance | null>(null);
  const actualInitialData = initialDataProp || fetchedInitialData;

  const createdMaintenanceIdRef = useRef<string | null>(null);

  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [availableMachines, setAvailableMachines] = useState<MachineDetails[]>([]);
  const [availableMaintenanceTasks, setAvailableMaintenanceTasks] = useState<MaintenanceTaskOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImageUploading, setIsImageUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [beforeImagePreview, setBeforeImagePreview] = useState<string | null>(null);
  const [afterImagePreview, setAfterImagePreview] = useState<string | null>(null);
  const [loadingTopics, setLoadingTopics] = useState<boolean>(true);
  const [loadingMachines, setLoadingMachines] = useState<boolean>(true);
  const [loadingMaintenanceTasks, setLoadingMaintenanceTasks] = useState<boolean>(true);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<Array<{timestamp: string, level: string, message: string, data?: any}>>([]);

  // Debug logging function - defined early so it can be used in useEffect hooks
  const addDebugLog = useCallback((level: 'info' | 'warn' | 'error' | 'success', message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    setDebugLogs(prev => [...prev, { timestamp, level, message, data }]);
    console.log(`[DEBUG ${level.toUpperCase()}] ${message}`, data || '');
  }, []);

  // Debug: Log user info
  React.useEffect(() => {
    const userInfo = {
      hasUser: !!user,
      userId: user?.id,
      userIdType: typeof user?.id,
      username: user?.username
    };
    console.log('[PreventiveMaintenanceForm] User info:', userInfo);
    addDebugLog('info', 'Component initialized - User info', userInfo);
  }, [user, addDebugLog]);

  // Set access token on service when available
  React.useEffect(() => {
    if (accessToken) {
      console.log('[PreventiveMaintenanceForm] Setting access token on service');
      addDebugLog('info', 'Access token set on service', {
        hasToken: !!accessToken,
        tokenLength: accessToken.length,
        tokenPreview: accessToken.substring(0, 20) + '...'
      });
      setPreventiveMaintenanceServiceToken(accessToken);
    } else {
      addDebugLog('warn', 'No access token available');
    }
  }, [accessToken, addDebugLog]);

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

  // Helper function to calculate next scheduled date based on frequency
  const calculateNextScheduledDate = useCallback((frequency: string, customDays?: number): Date => {
    const now = new Date();
    let nextDate: Date;

    switch (frequency) {
      case 'daily':
        nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate = new Date(now);
        nextDate.setMonth(nextDate.getMonth() + 1);
        // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28/29)
        if (nextDate.getDate() !== now.getDate()) {
          nextDate.setDate(0); // Set to last day of previous month
        }
        break;
      case 'quarterly':
        nextDate = new Date(now);
        nextDate.setMonth(nextDate.getMonth() + 3);
        if (nextDate.getDate() !== now.getDate()) {
          nextDate.setDate(0);
        }
        break;
      case 'semi_annual':
        nextDate = new Date(now);
        nextDate.setMonth(nextDate.getMonth() + 6);
        if (nextDate.getDate() !== now.getDate()) {
          nextDate.setDate(0);
        }
        break;
      case 'annual':
        nextDate = new Date(now);
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        // Handle leap year edge case (Feb 29)
        if (nextDate.getDate() !== now.getDate()) {
          nextDate.setDate(0);
        }
        break;
      case 'custom':
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
    
    // Only validate completed_date if it's provided (for edit mode)
    // For new records, completed_date should be empty
    if (values.completed_date && values.completed_date.trim() !== '') {
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
    
    // For new records, ensure completed_date is empty
    if (!pmId && values.completed_date && values.completed_date.trim() !== '') {
      errors.completed_date = 'Completed date should be empty for new maintenance records';
    }
    
    // Frequency validation removed - field is hidden, defaults to 'monthly'
    // if (!values.frequency) errors.frequency = 'Frequency is required';
    // if (values.frequency === 'custom' && (!values.custom_days || values.custom_days < 1)) {
    //   errors.custom_days = 'Custom days must be at least 1';
    // }
    // if (values.frequency === 'custom' && values.custom_days && values.custom_days > 365) {
    //   errors.custom_days = 'Custom days cannot exceed 365';
    // }
    if (!values.property_id) errors.property_id = 'Property is required';
    // Machines are now optional - maintenance tasks can exist without specific machine assignments
    // if (!values.selected_machine_ids || values.selected_machine_ids.length === 0) {
    //   errors.selected_machine_ids = 'At least one machine must be selected';
    // }
    // assigned_to is optional - defaults to current user if not provided
    // if (!values.assigned_to) {
    //   errors.assigned_to = 'Assigned user is required';
    // }
    // Topics are now optional
    // if (!values.selected_topics || values.selected_topics.length === 0) {
    //   errors.selected_topics = 'At least one topic must be selected';
    // }

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

        let assignedToId = '';
        if (currentData.assigned_to_details?.id) {
          assignedToId = String(currentData.assigned_to_details.id);
        } else if (
          currentData.assigned_to &&
          typeof currentData.assigned_to === 'object' &&
          currentData.assigned_to !== null &&
          'id' in currentData.assigned_to
        ) {
          assignedToId = String((currentData.assigned_to as any).id);
        } else if (typeof currentData.assigned_to === 'number') {
          assignedToId = String(currentData.assigned_to);
        }

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
        procedure_template: (currentData as any).procedure_template || '',
          assigned_to: assignedToId,
      };
    }

    // For new records, assign to the current user
    const currentUserId = user?.id;
    console.log('[getInitialValues] Current user ID for new record:', {
      userId: currentUserId,
      type: typeof currentUserId,
      hasUser: !!user
    });
    
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
      procedure_template: '',
        assigned_to: currentUserId ? String(currentUserId) : '',
    };
  }, [actualInitialData, selectedProperty, machineId, formatDateForInput, defaultScheduledDate, getPropertyDetails, user]);

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

  // Fetch available maintenance tasks (templates) - filtered by selected machines
  const fetchAvailableMaintenanceTasks = useCallback(async (machineIds?: string[]) => {
    console.log('[PreventiveMaintenanceForm] ===== fetchAvailableMaintenanceTasks CALLED =====');
    console.log('[PreventiveMaintenanceForm] machineIds parameter:', machineIds);
    console.log('[PreventiveMaintenanceForm] machineIds type:', typeof machineIds);
    console.log('[PreventiveMaintenanceForm] machineIds is array?', Array.isArray(machineIds));
    console.log('[PreventiveMaintenanceForm] machineIds length:', machineIds?.length);
    
    const normalizeGroupId = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }
      const normalized = String(value).trim().toLowerCase();
      return normalized.length > 0 ? normalized : null;
    };

    const mergeTemplatesById = (templates: MaintenanceProcedureTemplate[]): MaintenanceProcedureTemplate[] => {
      const uniqueTemplates = new Map<number, MaintenanceProcedureTemplate>();
      templates.forEach((template) => {
        if (template && typeof template.id === 'number' && !uniqueTemplates.has(template.id)) {
          uniqueTemplates.set(template.id, template);
        }
      });
      return Array.from(uniqueTemplates.values());
    };

    setLoadingMaintenanceTasks(true);
    try {
      let tasks: MaintenanceProcedureTemplate[] = [];
      
      if (machineIds && machineIds.length > 0) {
        console.log('[PreventiveMaintenanceForm] ✓ Processing', machineIds.length, 'machine(s) for filtering:', machineIds);
        // Fetch procedures for each selected machine
        const allProcedureIds = new Set<number>();
        const machineGroupIdsRaw = new Set<string>();
        const machineGroupIdsNormalized = new Set<string>();
        
        // Fetch machine details to get their maintenance procedures and group_id
        for (const machineId of machineIds) {
          try {
            console.log(`[PreventiveMaintenanceForm] Fetching machine ${machineId}...`);
            const response = await apiClient.get(`/api/v1/machines/${machineId}/`);
            const machine = response.data as any;
            
            console.log(`[PreventiveMaintenanceForm] Machine ${machineId} full response:`, JSON.stringify(machine, null, 2));
            console.log(`[PreventiveMaintenanceForm] Machine ${machineId} details:`, {
              group_id: machine.group_id,
              group_id_type: typeof machine.group_id,
              group_id_value: machine.group_id,
              group_id_is_null: machine.group_id === null,
              group_id_is_undefined: machine.group_id === undefined,
              group_id_is_empty_string: machine.group_id === '',
              has_maintenance_procedures: !!machine.maintenance_procedures,
              maintenance_procedures_count: machine.maintenance_procedures?.length || 0,
              all_keys: Object.keys(machine)
            });
            
            // Collect machine's group_id if it exists (check for null, undefined, and empty string)
            const normalizedMachineGroupId = normalizeGroupId(machine.group_id);
            if (normalizedMachineGroupId) {
              machineGroupIdsRaw.add(String(machine.group_id));
              machineGroupIdsNormalized.add(normalizedMachineGroupId);
              console.log(`[PreventiveMaintenanceForm] ✓ Machine ${machineId} has group_id: "${machine.group_id}" (normalized: "${normalizedMachineGroupId}")`);
            } else {
              console.log(`[PreventiveMaintenanceForm] ✗ Machine ${machineId} has NO group_id (value: ${machine.group_id}, type: ${typeof machine.group_id})`);
            }
            
            // Check if machine has maintenance_procedures field
            if (machine.maintenance_procedures && Array.isArray(machine.maintenance_procedures)) {
              machine.maintenance_procedures.forEach((proc: any) => {
                if (proc.id) {
                  allProcedureIds.add(proc.id);
                }
              });
              console.log(`[PreventiveMaintenanceForm] Machine ${machineId} has ${machine.maintenance_procedures.length} linked procedures`);
            }
          } catch (err) {
            console.error(`[PreventiveMaintenanceForm] Failed to fetch machine ${machineId}:`, err);
          }
        }
        
        console.log(`[PreventiveMaintenanceForm] Collected group_ids:`, {
          raw: Array.from(machineGroupIdsRaw),
          normalized: Array.from(machineGroupIdsNormalized),
          count: machineGroupIdsNormalized.size,
        });
        console.log(`[PreventiveMaintenanceForm] Collected procedure_ids:`, Array.from(allProcedureIds), `(count: ${allProcedureIds.size})`);
        
        // Fetch all available tasks
        const allTasks = await fetchAllMaintenanceProcedures({ pageSize: 100 });
        console.log(`[PreventiveMaintenanceForm] Total available tasks: ${allTasks.length}`);
        
        // Log all tasks to show their group_ids for debugging
        const taskGroupIds = allTasks.map(t => ({ id: t.id, name: t.name, group_id: t.group_id }));
        console.log(`[PreventiveMaintenanceForm] All tasks with group_ids:`, taskGroupIds);
        
        // Filter tasks based on:
        // 1. If machine has group_id, ONLY show tasks with matching group_id (strict match: machine.group_id === task.group_id)
        // 2. Otherwise, show tasks linked to the machine via maintenance_procedures
        // 3. If no group_id and no linked procedures, show all tasks (fallback)
        const tasksMatchedByGroupId = machineGroupIdsNormalized.size > 0
          ? allTasks.filter(task => {
              const normalizedTaskGroupId = normalizeGroupId(task.group_id);
              const matches = normalizedTaskGroupId ? machineGroupIdsNormalized.has(normalizedTaskGroupId) : false;
              if (matches) {
                console.log(`[PreventiveMaintenanceForm] ✓ Task "${task.name}" (id: ${task.id}) matches group_id "${task.group_id}" (normalized "${normalizedTaskGroupId}")`);
              }
              return matches;
            })
          : [];

        const tasksMatchedByProcedures = allProcedureIds.size > 0
          ? allTasks.filter(task => allProcedureIds.has(task.id))
          : [];

        const combinedMatches = mergeTemplatesById([...tasksMatchedByGroupId, ...tasksMatchedByProcedures]);

        if (combinedMatches.length > 0) {
          tasks = combinedMatches;
          console.log(`[PreventiveMaintenanceForm] Filtered tasks by machine linkage`, {
            viaGroupId: tasksMatchedByGroupId.length,
            viaProcedures: tasksMatchedByProcedures.length,
            combined: combinedMatches.length,
            machine_group_ids_raw: Array.from(machineGroupIdsRaw),
            machine_group_ids_normalized: Array.from(machineGroupIdsNormalized),
            linked_procedure_ids: Array.from(allProcedureIds),
          });
        } else if (machineGroupIdsNormalized.size === 0 && allProcedureIds.size === 0) {
          // No filtering clues available - show everything
          tasks = allTasks;
          console.log(`[PreventiveMaintenanceForm] No group_id or linked procedures found, showing all ${tasks.length} tasks`);
        } else {
          // Filtering clues existed but nothing matched
          tasks = [];
          console.warn('[PreventiveMaintenanceForm] ⚠️ No maintenance templates matched the selected machines via group_id or linked procedures.');
        }
      } else {
        // No machines selected, show all tasks
        tasks = await fetchAllMaintenanceProcedures({ pageSize: 100 });
        console.log(`[PreventiveMaintenanceForm] No machines selected, showing all ${tasks.length} tasks`);
      }
      
      console.log(`[PreventiveMaintenanceForm] Final tasks to display: ${tasks.length}`);
      
      setAvailableMaintenanceTasks(
        tasks.map<MaintenanceTaskOption>((task: MaintenanceProcedureTemplate) => ({
          id: task.id,
          name: task.name,
          group_id: task.group_id ?? undefined,
          category: task.category ?? undefined,
          frequency: task.frequency || 'N/A',
          difficulty_level: task.difficulty_level || 'N/A',
          responsible_department: task.responsible_department ?? undefined,
          custom_days: (task as any).custom_days ?? undefined, // Include custom_days if available from API
        }))
      );
    } catch (err: any) {
      console.error('Error fetching maintenance tasks:', err);
      setAvailableMaintenanceTasks([]);
    } finally {
      setLoadingMaintenanceTasks(false);
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

  // Fetch maintenance tasks when machines are selected or on mount
  useEffect(() => {
    if (accessToken) {
      // Initial load - fetch all tasks if no machines selected yet
      fetchAvailableMaintenanceTasks();
    }
  }, [accessToken, fetchAvailableMaintenanceTasks]);

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

    addDebugLog('info', 'Form submission started', {
      formValues: {
        ...values,
        scheduled_date: values.scheduled_date,
        scheduled_date_type: typeof values.scheduled_date,
        completed_date: values.completed_date,
        completed_date_type: typeof values.completed_date,
      },
      hasAccessToken: !!accessToken,
      hasUser: !!user,
      userId: user?.id,
      selectedProperty: values.property_id,
      machineId_prop: machineId,
      pmId_prop: pmId,
    });

    console.log('[FORM] handleSubmit called with values:', {
      ...values,
      scheduled_date: values.scheduled_date,
      scheduled_date_type: typeof values.scheduled_date,
      scheduled_date_length: values.scheduled_date?.length,
      completed_date: values.completed_date,
      completed_date_type: typeof values.completed_date,
      completed_date_length: values.completed_date?.length,
      machineId_prop: machineId,
      pmId_prop: pmId,
      selected_machine_ids: values.selected_machine_ids,
      selected_machine_ids_type: typeof values.selected_machine_ids,
      selected_machine_ids_isArray: Array.isArray(values.selected_machine_ids),
      selected_machine_ids_length: values.selected_machine_ids?.length,
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
      // Validate dates before submission (only for edit mode)
      // For new records, completed_date should be empty
      if (!pmId && values.completed_date && values.completed_date.trim() !== '') {
        setSubmitError('Completed date should be empty when creating new maintenance records');
        setIsLoading(false);
        setIsImageUploading(false);
        setSubmitting(false);
        return;
      }
      
      // Validate completed_date is after scheduled_date (only when editing)
      if (pmId && values.completed_date && values.completed_date.trim() !== '' && values.scheduled_date) {
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
      // For new records, always set completed_date to undefined (don't send it)
      // Only include completed_date when editing existing records
      const completedDateISO = (pmId && values.completed_date && values.completed_date.trim() !== '')
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

      // Debug assigned_to before conversion
      // Note: user.id from Auth0 is an OAuth2 string (e.g., 'google-oauth2_...')
      // Backend expects numeric database primary key, so we only send it if it's numeric
      const assignedToValue = values.assigned_to;
      const assignedToNumber = assignedToValue && !isNaN(Number(assignedToValue)) && Number(assignedToValue) > 0 
        ? Number(assignedToValue) 
        : undefined;
      
      console.log('[FORM] assigned_to debug:', {
        raw: assignedToValue,
        type: typeof assignedToValue,
        isEmpty: assignedToValue === '',
        isNumeric: assignedToNumber !== undefined,
        converted: assignedToNumber,
        note: assignedToNumber === undefined ? 'Will not send assigned_to - backend will use created_by' : 'Will send assigned_to'
      });

      addDebugLog('info', 'Processing assigned_to field', {
        rawValue: assignedToValue,
        isNumeric: assignedToNumber !== undefined,
        finalValue: assignedToNumber,
        willSend: assignedToNumber !== undefined
      });

      // Ensure machineId from prop is included if provided (defensive check)
      let finalMachineIds = Array.isArray(values.selected_machine_ids) && values.selected_machine_ids.length > 0 
        ? values.selected_machine_ids.map(id => String(id))
        : [];
      
      // CRITICAL: If machineId prop was provided but not in selected_machine_ids, add it
      // This ensures the machine is always included when creating from machine detail page
      if (machineId && !pmId) {
        const machineIdStr = String(machineId);
        if (!finalMachineIds.includes(machineIdStr)) {
          console.warn('[PreventiveMaintenanceForm] ⚠️ machineId prop not in selected_machine_ids, adding it:', {
            machineId,
            machineIdStr,
            currentSelected: values.selected_machine_ids,
            finalMachineIdsBefore: finalMachineIds
          });
          finalMachineIds = [machineIdStr, ...finalMachineIds];
        } else {
          console.log('[PreventiveMaintenanceForm] ✅ machineId already in selected_machine_ids:', machineId);
        }
      }
      
      console.log('[PreventiveMaintenanceForm] Final machine_ids being sent:', {
        machineId,
        pmId,
        valuesSelected: values.selected_machine_ids,
        finalMachineIds,
        finalMachineIdsLength: finalMachineIds.length
      });

      const dataForService: CreatePreventiveMaintenanceData = {
        pmtitle: values.pmtitle.trim() || 'Untitled Maintenance',
        scheduled_date: scheduledDateISO,
        frequency: values.frequency,
        custom_days: values.frequency === 'custom' && values.custom_days ? Number(values.custom_days) : undefined,
        notes: values.notes?.trim() || '',
        // Note: property_id is not sent to backend - it's determined by the machines assigned
        topic_ids: Array.isArray(values.selected_topics) && values.selected_topics.length > 0 ? values.selected_topics : [],
        // CRITICAL: Ensure machine_ids is always an array of strings
        machine_ids: finalMachineIds,
        completed_date: completedDateISO,
        // CRITICAL: Only include images if they are actual File objects with size > 0
        // Do NOT send null, undefined, empty objects, or empty files
        // Backend will reject non-file data for ImageField
        before_image: (values.before_image_file instanceof File && values.before_image_file.size > 0) 
          ? values.before_image_file 
          : undefined,
        after_image: (values.after_image_file instanceof File && values.after_image_file.size > 0) 
          ? values.after_image_file 
          : undefined,
        procedure: values.procedure?.trim() || '',
        procedure_template: values.procedure_template !== '' ? Number(values.procedure_template) : undefined,
        // Only send assigned_to if it's a valid numeric ID
        // If not provided, backend will automatically use created_by (from request.user)
        assigned_to: assignedToNumber,
      };

      console.log('[FORM] handleSubmit - Data prepared for service:', JSON.stringify(dataForService, (key, value) => {
        if (value instanceof File) {
          return { name: value.name, size: value.size, type: value.type, _isAFile: true };
        }
        return value;
      }, 2));
      console.log('[FORM] procedure_template value:', {
        original: values.procedure_template,
        type: typeof values.procedure_template,
        isEmpty: values.procedure_template === '',
        converted: dataForService.procedure_template
      });

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
      addDebugLog('info', 'Validating required fields', {
        hasScheduledDate: !!dataForService.scheduled_date,
        scheduledDate: dataForService.scheduled_date,
        hasMachineIds: !!dataForService.machine_ids && dataForService.machine_ids.length > 0,
        machineIdsCount: dataForService.machine_ids?.length || 0,
        machineIds: dataForService.machine_ids,
      });

      if (!dataForService.scheduled_date) {
        addDebugLog('error', 'Validation failed: Scheduled date is required');
        throw new Error('Scheduled date is required');
      }
      // Frequency validation removed - defaults to 'monthly' if not provided
      // if (!dataForService.frequency) {
      //   throw new Error('Frequency is required');
      // }
      // if (dataForService.frequency === 'custom' && !dataForService.custom_days) {
      //   throw new Error('Custom days is required when frequency is custom');
      // }
      // Note: property_id validation removed - it's determined by the machines assigned
      // Topics are now optional
      // if (!dataForService.topic_ids || dataForService.topic_ids.length === 0) {
      //   throw new Error('At least one topic is required');
      // }
      // Machines are now optional - maintenance tasks can exist without specific machine assignments
      // if (!dataForService.machine_ids || dataForService.machine_ids.length === 0) {
      //   addDebugLog('error', 'Validation failed: At least one machine is required');
      //   throw new Error('At least one machine is required');
      // }

      addDebugLog('success', 'All validations passed');

      const maintenanceIdToUpdate = pmId || (actualInitialData?.pm_id ?? null);
      let response: ServiceResponse<PreventiveMaintenance>;

      addDebugLog('info', 'Preparing API call', {
        isUpdate: !!maintenanceIdToUpdate,
        maintenanceId: maintenanceIdToUpdate,
        hasAccessToken: !!accessToken,
        accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : 'none',
        dataSummary: {
          pmtitle: dataForService.pmtitle,
          scheduled_date: dataForService.scheduled_date,
          machine_ids_count: dataForService.machine_ids.length,
          topic_ids_count: dataForService.topic_ids.length,
          has_before_image: !!dataForService.before_image,
          has_after_image: !!dataForService.after_image,
          procedure_template: dataForService.procedure_template,
        }
      });

      console.log('[FORM] About to call service:', {
        isUpdate: !!maintenanceIdToUpdate,
        maintenanceId: maintenanceIdToUpdate,
        hasAccessToken: !!accessToken,
        dataForService: {
          ...dataForService,
          before_image: dataForService.before_image ? 'File present' : 'No file',
          after_image: dataForService.after_image ? 'File present' : 'No file',
        }
      });

      try {
        if (maintenanceIdToUpdate) {
          addDebugLog('info', 'Calling updatePreventiveMaintenance API');
          console.log('[FORM] Calling updatePreventiveMaintenance');
          response = await preventiveMaintenanceService.updatePreventiveMaintenance(
            maintenanceIdToUpdate,
            dataForService as UpdatePreventiveMaintenanceData
          );
        } else {
          addDebugLog('info', 'Calling createPreventiveMaintenance API');
          console.log('[FORM] Calling createPreventiveMaintenance');
          // FINAL CHECK: Ensure machineId is included if prop was provided
          if (machineId && !pmId && (!dataForService.machine_ids || dataForService.machine_ids.length === 0)) {
            const machineIdStr = String(machineId);
            console.error('[PreventiveMaintenanceForm] 🚨 CRITICAL: machineId prop provided but machine_ids is empty! Adding it now:', machineIdStr);
            dataForService.machine_ids = [machineIdStr];
          }
          
          console.log('[PreventiveMaintenanceForm] 🚀 About to call API with final data:', {
            machine_ids: dataForService.machine_ids,
            machine_ids_length: dataForService.machine_ids?.length,
            machineId_prop: machineId,
            pmId_prop: pmId
          });
          
          response = await preventiveMaintenanceService.createPreventiveMaintenance(dataForService);
        }
      } catch (apiError: any) {
        addDebugLog('error', 'API call failed', {
          errorType: apiError.constructor?.name,
          errorMessage: apiError.message,
          hasResponse: !!apiError.response,
          status: apiError.response?.status,
          responseData: apiError.response?.data,
        });
        // Re-throw to be caught by outer catch block
        throw apiError;
      }

      if (!isMounted) return;

      addDebugLog('info', 'API call completed', {
        success: response.success,
        hasData: !!response.data,
        message: response.message,
        responseData: response.data ? {
          pm_id: response.data.pm_id,
          pmtitle: response.data.pmtitle,
          scheduled_date: response.data.scheduled_date,
        } : null,
      });

      console.log('[FORM] handleSubmit - Service response:', response);

      if (response.success && response.data) {
        addDebugLog('success', 'Form submission successful', {
          pm_id: response.data.pm_id,
          pmtitle: response.data.pmtitle,
        });
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
      
      addDebugLog('error', 'Form submission failed', errorDetails);
      
      console.error('[FORM] handleSubmit - Error submitting form:', error);
      console.error('[FORM] Error details:', errorDetails);
      
      // Handle different error types
      let errorMessage = 'An unexpected error occurred.';
      
      // Check if it's a network error
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.response?.data) {
        // HTTP error response from backend
        const responseData = error.response.data;
        console.log('[FORM] Backend error response data:', responseData);
        
        if (typeof responseData === 'string') {
          errorMessage = responseData;
        } else if (responseData.detail) {
          errorMessage = responseData.detail;
        } else if (responseData.message) {
          errorMessage = responseData.message;
        } else if (typeof responseData === 'object') {
          const fieldErrors = Object.entries(responseData)
            .filter(([key]) => key !== 'detail' && key !== 'message')
            .map(([field, errs]) => {
              const errorText = Array.isArray(errs) ? errs.join(', ') : String(errs);
              return `${field}: ${errorText}`;
            })
            .join('; ');
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
      
      addDebugLog('error', 'Final error message', { errorMessage });
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
    <div className="bg-white shadow-md rounded-lg p-3 sm:p-4 md:p-6">
      {/* Debug Panel Toggle */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 rounded-md text-gray-700 font-mono"
        >
          {showDebugPanel ? '▼ Hide Debug' : '▶ Show Debug'}
        </button>
      </div>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="mb-4 p-4 bg-gray-900 text-green-400 rounded-md font-mono text-xs max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-white">Debug Logs</h3>
            <button
              type="button"
              onClick={() => setDebugLogs([])}
              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
            >
              Clear
            </button>
          </div>
          {debugLogs.length === 0 ? (
            <p className="text-gray-500">No debug logs yet. Submit the form to see logs.</p>
          ) : (
            <div className="space-y-1">
              {debugLogs.map((log, index) => (
                <div key={index} className={`border-l-2 pl-2 ${
                  log.level === 'error' ? 'border-red-500 text-red-400' :
                  log.level === 'warn' ? 'border-yellow-500 text-yellow-400' :
                  log.level === 'success' ? 'border-green-500 text-green-400' :
                  'border-blue-500 text-blue-400'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="font-bold">[{log.level.toUpperCase()}]</span>
                    <span>{log.message}</span>
                  </div>
                  {log.data && (
                    <pre className="mt-1 ml-4 text-xs overflow-x-auto bg-gray-800 p-2 rounded">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(error || submitError) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded mb-3 sm:mb-4">
          <div className="flex justify-between items-start gap-2">
            <p className="whitespace-pre-wrap text-sm sm:text-base flex-1">{error || submitError}</p>
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
          const errors = validateForm(values);
          if (Object.keys(errors).length > 0) {
            addDebugLog('warn', 'Form validation errors', { errors, values });
          }
          return errors;
        }}
        enableReinitialize
        onSubmit={(values, formikHelpers) => {
          addDebugLog('info', 'Formik onSubmit triggered', {
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
              completed_date_length: values.completed_date?.length,
              selected_machine_ids: values.selected_machine_ids,
              selected_machine_ids_length: values.selected_machine_ids?.length,
              machineId_prop: machineId,
              pmId_prop: pmId
            });
          }, [values.scheduled_date, values.completed_date, values.selected_machine_ids, machineId, pmId]);

            React.useEffect(() => {
              if (pmId) return;
              const nextPropertyId = selectedProperty || '';
              const currentValue = values.property_id || '';
              if (nextPropertyId !== currentValue) {
                setFieldValue('property_id', nextPropertyId, false);
              }
            }, [pmId, selectedProperty, values.property_id, setFieldValue]);

            // Auto-select machine when machineId prop is provided
            React.useEffect(() => {
              if (!machineId || pmId) return; // Only for new records with machineId prop
              
              const machineIdStr = String(machineId);
              const isAlreadySelected = values.selected_machine_ids.includes(machineIdStr);
              
              // Wait for machines to finish loading before auto-selecting
              if (loadingMachines) {
                console.log('[PreventiveMaintenanceForm] ⏳ Waiting for machines to load before auto-selecting:', {
                  machineId: machineIdStr,
                  loadingMachines
                });
                return;
              }
              
              // If machines are loaded, validate and select the machine
              if (availableMachines.length > 0) {
                const machineExists = availableMachines.some(m => m.machine_id === machineIdStr);
                
                if (machineExists) {
                  // Machine exists - select it if not already selected
                  if (!isAlreadySelected) {
                    console.log('[PreventiveMaintenanceForm] ✅ Auto-selecting machine from prop:', {
                      machineId,
                      machineIdStr,
                      currentSelected: values.selected_machine_ids,
                      availableMachinesCount: availableMachines.length
                    });
                    
                    const newMachineIds = [machineIdStr, ...values.selected_machine_ids.filter(id => id !== machineIdStr)];
                    setFieldValue('selected_machine_ids', newMachineIds, false);
                  } else {
                    console.log('[PreventiveMaintenanceForm] ✅ Machine already selected:', machineIdStr);
                  }
                } else {
                  // Machine doesn't exist in available machines - show warning
                  console.warn('[PreventiveMaintenanceForm] ⚠️ Machine not found in available machines:', {
                    machineId,
                    machineIdStr,
                    availableMachineIds: availableMachines.map(m => m.machine_id),
                    selectedProperty: values.property_id,
                    availableMachinesCount: availableMachines.length
                  });
                  
                  // Still try to select it (might be valid but not loaded yet, or might be from different property)
                  if (!isAlreadySelected) {
                    console.log('[PreventiveMaintenanceForm] ⚠️ Machine not in available list, but selecting anyway:', machineIdStr);
                    const newMachineIds = [machineIdStr, ...values.selected_machine_ids.filter(id => id !== machineIdStr)];
                    setFieldValue('selected_machine_ids', newMachineIds, false);
                  }
                }
              } else if (values.property_id) {
                // Property is set but no machines loaded - might be loading or empty
                // Still try to select the machine ID (will be validated on submit)
                if (!isAlreadySelected) {
                  console.log('[PreventiveMaintenanceForm] ⚠️ No machines loaded yet, but selecting machine ID anyway:', {
                    machineId: machineIdStr,
                    property_id: values.property_id,
                    note: 'Will be validated when machines load or on submit'
                  });
                  const newMachineIds = [machineIdStr, ...values.selected_machine_ids.filter(id => id !== machineIdStr)];
                  setFieldValue('selected_machine_ids', newMachineIds, false);
                }
              }
            }, [machineId, pmId, availableMachines, loadingMachines, values.selected_machine_ids, values.property_id, setFieldValue]);

            // Refetch maintenance tasks when selected machines change
            React.useEffect(() => {
              console.log('[PreventiveMaintenanceForm] useEffect triggered:', {
                pmId,
                selected_machine_ids: values.selected_machine_ids,
                length: values.selected_machine_ids.length
              });
              
              if (!pmId && values.selected_machine_ids.length > 0) {
                console.log('[PreventiveMaintenanceForm] Selected machines changed, refetching tasks:', values.selected_machine_ids);
                fetchAvailableMaintenanceTasks(values.selected_machine_ids);
              } else if (!pmId && values.selected_machine_ids.length === 0) {
                // No machines selected, show all tasks
                console.log('[PreventiveMaintenanceForm] No machines selected, showing all tasks');
                fetchAvailableMaintenanceTasks();
              }
            }, [values.selected_machine_ids, pmId, fetchAvailableMaintenanceTasks]);

            return (
            <Form aria-label="Preventive Maintenance Form" className="space-y-4 sm:space-y-6">
              {!values.property_id && !pmId && (
                <div className="mb-4 sm:mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 sm:p-4 text-xs sm:text-sm text-amber-800">
                  Please select a property using the header dropdown before creating preventive maintenance tasks.
                </div>
              )}

              <Field type="hidden" name="property_id" />

              {/* Assigned User - Hidden, auto-assigned to current user */}
              <Field type="hidden" name="assigned_to" />

            {/* Maintenance Title */}
            <div className="mb-4 sm:mb-6">
              <label htmlFor="pmtitle" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Maintenance Title <span className="text-red-500">*</span>
              </label>
              <Field
                type="text"
                id="pmtitle"
                name="pmtitle"
                className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.pmtitle && touched.pmtitle ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter maintenance title"
              />
              {errors.pmtitle && touched.pmtitle && <p className="mt-1 text-xs sm:text-sm text-red-500">{errors.pmtitle}</p>}
            </div>

            {/* Scheduled Date */}
            <div className="mb-4 sm:mb-6">
              <label htmlFor="scheduled_date" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Scheduled Date & Time <span className="text-red-500">*</span>
              </label>
              <Field
                type="datetime-local"
                id="scheduled_date"
                name="scheduled_date"
                className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.scheduled_date && touched.scheduled_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.scheduled_date && touched.scheduled_date && (
                <p className="mt-1 text-xs sm:text-sm text-red-500">{errors.scheduled_date}</p>
              )}
            </div>

            {/* Completed Date - Only show when editing existing records */}
            {pmId && (
              <div className="mb-4 sm:mb-6">
                <label htmlFor="completed_date" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Completed Date & Time
                </label>
                <Field
                  type="datetime-local"
                  id="completed_date"
                  name="completed_date"
                  className="w-full p-2.5 sm:p-3 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.completed_date && touched.completed_date && (
                  <p className="mt-1 text-xs sm:text-sm text-red-500">{errors.completed_date}</p>
                )}
              </div>
            )}


            {/* Maintenance Frequency - HIDDEN (defaults to 'monthly') */}
            {false && (
            <>
            <div className="mb-6">
              <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 mb-1">
                Maintenance Frequency
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
                  Custom Days Interval
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
            </>
            )}

            {/* Notes */}
            <div className="mb-4 sm:mb-6">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Notes
              </label>
              <Field
                as="textarea"
                id="notes"
                name="notes"
                rows={4}
                className="w-full p-2.5 sm:p-3 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                placeholder="Enter any notes for this maintenance task"
              />
            </div>

            {/* Procedure - HIDDEN (linked via maintenance task template) */}
            {false && (
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
            )}

            {/* Machines Selection */}
            <div className="mb-4 sm:mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Machines (Optional) {loadingMachines && <span className="text-xs text-gray-500">(Loading...)</span>}
              </label>
              <div
                className={`border rounded-md p-3 sm:p-4 max-h-60 overflow-y-auto bg-white scroll-momentum ${
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
                ) : (() => {
                  // Filter machines to show only the specified machine if machineId prop is provided
                  const machinesToShow = machineId 
                    ? availableMachines.filter(m => m.machine_id === machineId)
                    : availableMachines;
                  
                  return machinesToShow.length > 0 ? (
                  <div className="space-y-2 sm:space-y-3">
                    {machinesToShow.map((machineItem) => {
                      const isPreSelected = !!machineId && machineItem.machine_id === machineId;
                      return (
                      <div key={machineItem.machine_id} className="relative">
                        <label className={`flex items-start sm:items-center gap-2 sm:gap-3 py-2 ${isPreSelected ? 'cursor-default' : 'cursor-pointer touch-feedback'}`}>
                          <Field name="selected_machine_ids">
                            {({ field: { value: selectedMachinesValue }, form: { setFieldValue: setMachineFieldValue } }: any) => (
                              <input
                                type="checkbox"
                                className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5 sm:mt-0 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                                id={`machine-${machineItem.machine_id}`}
                                checked={selectedMachinesValue.includes(machineItem.machine_id)}
                                disabled={isPreSelected}
                                onChange={(e) => {
                                  if (isPreSelected) return; // Prevent unchecking if pre-selected
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
                          <span className={`text-sm sm:text-base flex-1 break-words ${isPreSelected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                            <span className="block sm:inline">{machineItem.name}</span>
                            <span className="block sm:inline text-xs sm:text-sm text-gray-500 font-mono">({machineItem.machine_id})</span>
                            {isPreSelected && <span className="block sm:inline ml-0 sm:ml-2 mt-1 sm:mt-0 text-xs text-blue-600">(Pre-selected)</span>}
                          </span>
                        </label>
                        {values.selected_machine_ids.includes(machineItem.machine_id) && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  ) : (
                    <div className="text-center py-6">
                      {machineId ? (
                        <p className="text-sm text-gray-500 mb-3">
                          Machine {machineId} not found for this property.
                        </p>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
              {errors.selected_machine_ids && touched.selected_machine_ids && (
                <p className="mt-1 text-sm text-red-500">{errors.selected_machine_ids}</p>
              )}
            </div>

            {/* Maintenance Task Template Selection */}
            <div className="mb-4 sm:mb-6">
              <label htmlFor="procedure_template" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Maintenance Task Template (Optional)
                {loadingMaintenanceTasks && <span className="text-xs text-gray-500 ml-2">(Loading...)</span>}
                {!loadingMaintenanceTasks && availableMaintenanceTasks.length === 0 && (
                  <span className="text-xs text-amber-600 ml-2">(No tasks available)</span>
                )}
              </label>
              <Field
                as="select"
                id="procedure_template"
                name="procedure_template"
                className="w-full p-2.5 sm:p-3 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                disabled={loadingMaintenanceTasks}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const taskId = e.target.value ? Number(e.target.value) : '';
                  setFieldValue('procedure_template', taskId);
                  
                  // If a task is selected, auto-populate fields based on template
                  if (taskId) {
                    const selectedTask = availableMaintenanceTasks.find(t => t.id === Number(taskId));
                    if (selectedTask) {
                      console.log(`[Template Selection] Selected template:`, {
                        id: selectedTask.id,
                        name: selectedTask.name,
                        frequency: selectedTask.frequency,
                        custom_days: selectedTask.custom_days
                      });
                      
                      // Auto-populate title if empty
                      if (!values.pmtitle || values.pmtitle.trim() === '') {
                        setFieldValue('pmtitle', selectedTask.name);
                        console.log(`[Template Selection] Auto-filled title: ${selectedTask.name}`);
                      }
                      
                      // CRITICAL: Auto-set frequency and calculate scheduled_date based on template frequency
                      if (selectedTask.frequency && selectedTask.frequency.trim() !== '' && selectedTask.frequency !== 'N/A') {
                        const templateFrequency = selectedTask.frequency.toLowerCase().trim();
                        const validFrequencies: FrequencyType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'];
                        
                        if (validFrequencies.includes(templateFrequency as FrequencyType)) {
                          // Set frequency from template
                          setFieldValue('frequency', templateFrequency as FrequencyType);
                          console.log(`[Template Selection] Set frequency to: ${templateFrequency}`);
                          
                          // Calculate next scheduled date based on template frequency
                          const customDays = templateFrequency === 'custom' ? (selectedTask.custom_days ?? undefined) : undefined;
                          const nextDate = calculateNextScheduledDate(templateFrequency, customDays);
                          const formattedDate = formatDateForInput(nextDate);
                          
                          // Always update scheduled_date when template is selected
                          setFieldValue('scheduled_date', formattedDate);
                          console.log(`[Template Selection] Calculated scheduled_date for ${templateFrequency} frequency:`, {
                            nextDate: nextDate.toISOString(),
                            formattedDate: formattedDate,
                            customDays: customDays
                          });
                          
                          // Set custom_days if frequency is custom
                          if (templateFrequency === 'custom' && selectedTask.custom_days) {
                            setFieldValue('custom_days', selectedTask.custom_days);
                            console.log(`[Template Selection] Set custom_days to: ${selectedTask.custom_days}`);
                          } else if (templateFrequency !== 'custom') {
                            // Clear custom_days if not custom frequency
                            setFieldValue('custom_days', '');
                          }
                        } else {
                          console.warn(`[Template Selection] Invalid frequency "${selectedTask.frequency}" from template, using default`);
                        }
                      } else {
                        console.warn(`[Template Selection] Template has no valid frequency, keeping current values`);
                      }
                    } else {
                      console.warn(`[Template Selection] Template with ID ${taskId} not found in available tasks`);
                    }
                  } else {
                    // Template deselected - reset to defaults
                    console.log(`[Template Selection] Template deselected, resetting to defaults`);
                    setFieldValue('frequency', 'monthly');
                    setFieldValue('custom_days', '');
                  }
                }}
              >
                <option value="">No template (Custom)</option>
                {loadingMaintenanceTasks ? (
                  <option disabled>Loading tasks...</option>
                ) : availableMaintenanceTasks.length === 0 ? (
                  <option disabled>No tasks available</option>
                ) : (
                  availableMaintenanceTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}{task.category ? ` - ${task.category}` : ''} [{task.frequency.toUpperCase()}] - {task.difficulty_level}
                    </option>
                  ))
                )}
              </Field>
              <p className="mt-1 text-xs text-gray-500">
                {loadingMaintenanceTasks 
                  ? 'Loading available task templates...'
                  : availableMaintenanceTasks.length === 0
                  ? 'No task templates available. You can still create a custom maintenance task.'
                  : 'Select a task template to use as a reference for this maintenance'}
              </p>
              {!loadingMaintenanceTasks && availableMaintenanceTasks.length === 0 && values.selected_machine_ids && values.selected_machine_ids.length > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No tasks match the selected machine(s). Tasks are filtered by machine group_id or linked procedures.
                </p>
              )}
            </div>


            {/* Image Uploads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Before Image</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">After Image</label>
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
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between mt-6 sm:mt-8 gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-gray-100 text-gray-700 font-medium rounded-md shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors touch-target min-h-[44px]"
                    disabled={isSubmitting || isLoading}
                  >
                    Cancel
                  </button>
                )}
                {isImageUploading && (
                  <div className="flex items-center justify-center sm:justify-start space-x-2 text-blue-600 py-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                    <span className="text-sm">Uploading images...</span>
                  </div>
                )}
              </div>
              <button
                type="submit"
                className={`w-full sm:w-auto px-6 py-3 sm:py-2.5 ${
                  isSubmitting || isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                } text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors touch-target min-h-[44px]`}
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    <span>{pmId || actualInitialData ? 'Updating...' : 'Creating...'}</span>
                  </div>
                ) : (
                  <span>{pmId || actualInitialData ? 'Update Maintenance' : 'Create Maintenance'}</span>
                )}
              </button>
            </div>
          </Form>
        );
        }}
      </Formik>
    </div>
  );
};

export default PreventiveMaintenanceForm;