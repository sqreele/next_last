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
import { Loader } from 'lucide-react';

const MIN_LOADER_MS = 400; // Minimum time to show loader to avoid flash
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
];

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
  status: string;
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

  // Set access token on service when available
  React.useEffect(() => {
    if (accessToken) {
      setPreventiveMaintenanceServiceToken(accessToken);
    }
  }, [accessToken]);

  const formatDateForInput = useCallback((date: Date): string => {
    // Use local methods to match the user's timezone for datetime-local inputs
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const result = `${year}-${month}-${day}T${hours}:${minutes}`;
    return result;
  }, []);

  // Helper function to calculate next scheduled date based on frequency
  const calculateNextScheduledDate = useCallback((frequency: string, customDays?: number, baseDate?: Date): Date => {
    const now = baseDate ?? new Date();
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

    if (!dateTimeLocal) {
      return '';
    }

    try {
      // Create a Date object from the datetime-local value
      // This assumes the datetime-local value is in the user's local timezone
      const date = new Date(dateTimeLocal);

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
      return isoString;
    } catch (error) {
      console.error('[convertToISO8601] Error converting datetime-local to ISO 8601:', error, 'Input:', dateTimeLocal);

      // If it's already in ISO format, return as is
      if (dateTimeLocal.includes('T') && (dateTimeLocal.includes('Z') || dateTimeLocal.includes('+'))) {
        return dateTimeLocal;
      }

      // If it's in YYYY-MM-DDTHH:mm format, add seconds and convert to ISO
      if (dateTimeLocal.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        const fallbackDate = new Date(dateTimeLocal + ':00');
        if (!isNaN(fallbackDate.getTime())) {
          // Use the same format: YYYY-MM-DDThh:mm
          const year = fallbackDate.getFullYear();
          const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
          const day = String(fallbackDate.getDate()).padStart(2, '0');
          const hours = String(fallbackDate.getHours()).padStart(2, '0');
          const minutes = String(fallbackDate.getMinutes()).padStart(2, '0');

          const fallbackISO = `${year}-${month}-${day}T${hours}:${minutes}`;
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
    return isValid;
  }, []);

  // Helper function to ensure datetime-local input format
  const ensureDateTimeLocalFormat = useCallback((dateString: string): string => {

    if (!dateString) {
      return '';
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
    } catch (error) {
      console.error('[ensureDateTimeLocalFormat] Error ensuring datetime-local format:', error);
    }
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
    if (!values.status) errors.status = 'Status is required';

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
    if (values.procedure_template === '') {
      errors.procedure_template = 'Maintenance Task Template is required';
    }
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
        status: currentData.status || (completedDate ? 'completed' : 'pending'),
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

    return {
      pmtitle: '',
      scheduled_date: defaultScheduledDate,
      completed_date: '',
      frequency: 'monthly',
      custom_days: '',
      status: 'pending',
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
  }, [accessToken]);

  // Fetch available maintenance tasks (templates) - filtered by selected machines
  const fetchAvailableMaintenanceTasks = useCallback(async (machineIds?: string[]) => {

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
        // Fetch procedures for each selected machine
        const allProcedureIds = new Set<number>();
        const machineGroupIdsRaw = new Set<string>();
        const machineGroupIdsNormalized = new Set<string>();

        // Fetch machine details to get their maintenance procedures and group_id
        for (const machineId of machineIds) {
          try {
            const response = await apiClient.get(`/api/v1/machines/${machineId}/`);
            const machine = response.data as any;

            // Collect machine's group_id if it exists (check for null, undefined, and empty string)
            const normalizedMachineGroupId = normalizeGroupId(machine.group_id);
            if (normalizedMachineGroupId) {
              machineGroupIdsRaw.add(String(machine.group_id));
              machineGroupIdsNormalized.add(normalizedMachineGroupId);
            } else {
            }

            // Check if machine has maintenance_procedures field
            if (machine.maintenance_procedures && Array.isArray(machine.maintenance_procedures)) {
              machine.maintenance_procedures.forEach((proc: any) => {
                if (proc.id) {
                  allProcedureIds.add(proc.id);
                }
              });
            }
          } catch (err) {
            console.error(`[PreventiveMaintenanceForm] Failed to fetch machine ${machineId}:`, err);
          }
        }

        // Fetch all available tasks
        const allTasks = await fetchAllMaintenanceProcedures({ pageSize: 100 });

        // Log all tasks to show their group_ids for debugging
        const taskGroupIds = allTasks.map(t => ({ id: t.id, name: t.name, group_id: t.group_id }));

        // Filter tasks based on:
        // 1. If machine has group_id, ONLY show tasks with matching group_id (strict match: machine.group_id === task.group_id)
        // 2. Otherwise, show tasks linked to the machine via maintenance_procedures
        // 3. If no group_id and no linked procedures, show all tasks (fallback)
        const tasksMatchedByGroupId = machineGroupIdsNormalized.size > 0
          ? allTasks.filter(task => {
              const normalizedTaskGroupId = normalizeGroupId(task.group_id);
              const matches = normalizedTaskGroupId ? machineGroupIdsNormalized.has(normalizedTaskGroupId) : false;
              if (matches) {
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
        } else if (machineGroupIdsNormalized.size === 0 && allProcedureIds.size === 0) {
          // No filtering clues available - show everything
          tasks = allTasks;
        } else {
          // Filtering clues existed but nothing matched
          tasks = [];
          console.warn('[PreventiveMaintenanceForm] ⚠️ No maintenance templates matched the selected machines via group_id or linked procedures.');
        }
      } else {
        // No machines selected, show all tasks
        tasks = await fetchAllMaintenanceProcedures({ pageSize: 100 });
      }

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
      loaderShownAtRef.current = Date.now();
      setIsLoading(true);
      clearError();
      preventiveMaintenanceService
        .getPreventiveMaintenanceById(pmId)
        .then((response) => {
          if (!mounted) return;

          if (response.success && response.data) {
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
          clearLoadingAfterMinTime();
        });
    } else if (initialDataProp) {
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
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
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
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
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
      if (!pmId && values.completed_date && values.completed_date.trim() !== '' && values.status !== 'completed') {
        setSubmitError('Completed date should be empty when creating new maintenance records unless status is completed.');
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
      // Include completed_date when editing or when status is completed.
      // If status is completed and no completed_date provided, default to now.
      const completedDateISO = (values.completed_date && values.completed_date.trim() !== '')
        ? convertToISO8601(values.completed_date)
        : (values.status === 'completed' ? new Date().toISOString() : undefined);

      const assignedToValue = values.assigned_to;
      const assignedToNumber = assignedToValue && !isNaN(Number(assignedToValue)) && Number(assignedToValue) > 0
        ? Number(assignedToValue)
        : undefined;

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
        }
      }

      const nextDueDate = (() => {
        const baseDate = values.scheduled_date ? new Date(values.scheduled_date) : new Date();
        const safeBaseDate = isNaN(baseDate.getTime()) ? new Date() : baseDate;
        return calculateNextScheduledDate(
          values.frequency,
          values.frequency === 'custom' && values.custom_days ? Number(values.custom_days) : undefined,
          safeBaseDate
        );
      })();

      const nextDueDateFormatted = formatDateForInput(nextDueDate);
      const nextDueDateISO = convertToISO8601(nextDueDateFormatted);

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
        status: values.status,
        next_due_date: values.status === 'completed' ? nextDueDateISO : undefined,
      };
      // Additional validation before sending to backend

      // Validate required fields

      if (!dataForService.scheduled_date) {
        throw new Error('Scheduled date is required');
      }
      // Frequency validation removed - defaults to 'monthly' if not provided
      // if (!dataForService.frequency) {
      //   throw new Error('Frequency is required');
      // }
      // if (dataForService.frequency === 'custom' && !dataForService.custom_days) {
      //   throw new Error('Custom days is required when frequency is custom');
      // }
      const maintenanceIdToUpdate = pmId || (actualInitialData?.pm_id ?? null);
      let response: ServiceResponse<PreventiveMaintenance>;

      try {
        if (maintenanceIdToUpdate) {
          response = await preventiveMaintenanceService.updatePreventiveMaintenance(
            maintenanceIdToUpdate,
            dataForService as UpdatePreventiveMaintenanceData
          );
        } else {
          // FINAL CHECK: Ensure machineId is included if prop was provided
          if (machineId && !pmId && (!dataForService.machine_ids || dataForService.machine_ids.length === 0)) {
            const machineIdStr = String(machineId);
            console.error('[PreventiveMaintenanceForm] 🚨 CRITICAL: machineId prop provided but machine_ids is empty! Adding it now:', machineIdStr);
            dataForService.machine_ids = [machineIdStr];
          }

          response = await preventiveMaintenanceService.createPreventiveMaintenance(dataForService);
        }
      } catch (apiError: any) {
        // Re-throw to be caught by outer catch block
        throw apiError;
      }

      if (!isMounted) return;

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
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
        aria-live="polite"
        aria-busy="true"
        role="status"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
          <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
        <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
          Loading form, please wait…
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-3 sm:p-4 md:p-6 pb-28 md:pb-6">
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
          }
          return errors;
        }}
        enableReinitialize
        onSubmit={(values, formikHelpers) => {
          return handleSubmit(values, formikHelpers);
        }}
      >
          {({ values, errors, touched, isSubmitting, setFieldValue }) => {
          // Debug form values changes
          React.useEffect(() => {
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
                return;
              }

              // If machines are loaded, validate and select the machine
              if (availableMachines.length > 0) {
                const machineExists = availableMachines.some(m => m.machine_id === machineIdStr);

                if (machineExists) {
                  // Machine exists - select it if not already selected
                  if (!isAlreadySelected) {

                    const newMachineIds = [machineIdStr, ...values.selected_machine_ids.filter(id => id !== machineIdStr)];
                    setFieldValue('selected_machine_ids', newMachineIds, false);
                  } else {
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
                    const newMachineIds = [machineIdStr, ...values.selected_machine_ids.filter(id => id !== machineIdStr)];
                    setFieldValue('selected_machine_ids', newMachineIds, false);
                  }
                }
              } else if (values.property_id) {
                // Property is set but no machines loaded - might be loading or empty
                // Still try to select the machine ID (will be validated on submit)
                if (!isAlreadySelected) {
                  const newMachineIds = [machineIdStr, ...values.selected_machine_ids.filter(id => id !== machineIdStr)];
                  setFieldValue('selected_machine_ids', newMachineIds, false);
                }
              }
            }, [machineId, pmId, availableMachines, loadingMachines, values.selected_machine_ids, values.property_id, setFieldValue]);

            // Refetch maintenance tasks from preselected machines only until a template is chosen.
            React.useEffect(() => {
              if (pmId || values.procedure_template !== '') return;

              if (values.selected_machine_ids.length > 0) {
                fetchAvailableMaintenanceTasks(values.selected_machine_ids);
              } else {
                fetchAvailableMaintenanceTasks();
              }
            }, [values.selected_machine_ids, values.procedure_template, pmId, fetchAvailableMaintenanceTasks]);


            React.useEffect(() => {
              if (values.procedure_template === '') {
                if (values.selected_machine_ids.length > 0 && !machineId) {
                  setFieldValue('selected_machine_ids', [], false);
                }
                return;
              }

              const selectedTask = availableMaintenanceTasks.find(t => t.id === Number(values.procedure_template));
              const selectedTaskGroupId = selectedTask?.group_id?.trim().toLowerCase();
              if (!selectedTaskGroupId) return;

              const allowedMachineIds = new Set(
                availableMachines
                  .filter((machine) => machine.group_id?.trim().toLowerCase() === selectedTaskGroupId)
                  .map((machine) => machine.machine_id)
              );
              const nextMachineIds = values.selected_machine_ids.filter((id) => allowedMachineIds.has(id) || id === machineId);
              if (nextMachineIds.length !== values.selected_machine_ids.length) {
                setFieldValue('selected_machine_ids', nextMachineIds, false);
              }
            }, [availableMachines, availableMaintenanceTasks, machineId, values.procedure_template, values.selected_machine_ids, setFieldValue]);

            const nextDueDate = React.useMemo(() => {
              if (!values.frequency) {
                return null;
              }

              const baseDate = values.scheduled_date ? new Date(values.scheduled_date) : new Date();
              const safeBaseDate = isNaN(baseDate.getTime()) ? new Date() : baseDate;
              return calculateNextScheduledDate(
                values.frequency,
                values.frequency === 'custom' && values.custom_days ? Number(values.custom_days) : undefined,
                safeBaseDate
              );
            }, [values.frequency, values.custom_days, values.scheduled_date, calculateNextScheduledDate]);

            const nextDueLabel = nextDueDate ? nextDueDate.toLocaleString() : 'Not available';

            return (
            <Form aria-label="Preventive Maintenance Form" className="relative space-y-4 sm:space-y-6">
              {/* Full-screen saving/uploading overlay */}
              {(isSubmitting || isLoading) && (
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
                    Saving, please wait…
                  </p>
                </div>
              )}
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

            {/* Status */}
            <div className="mb-4 sm:mb-6">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Status <span className="text-red-500">*</span>
              </label>
              <Field
                as="select"
                id="status"
                name="status"
                className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.status && touched.status ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
              {errors.status && touched.status && (
                <p className="mt-1 text-xs sm:text-sm text-red-500">{errors.status}</p>
              )}
              <div
                className={`mt-2 rounded-md border px-3 py-2 text-xs sm:text-sm ${
                  values.status === 'completed'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {values.status === 'completed' ? (
                  <p>
                    Next due date will be created automatically: <span className="font-semibold">{nextDueLabel}</span>.
                  </p>
                ) : (
                  <p>
                    Next due date will be set after completion. Expected next due: <span className="font-semibold">{nextDueLabel}</span>.
                  </p>
                )}
              </div>
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

            {/* Maintenance Task Template Selection */}
            <div className="mb-4 sm:mb-6">
              <label htmlFor="procedure_template" className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Maintenance Task Template <span className="text-red-500">*</span>
                {loadingMaintenanceTasks && <span className="text-xs text-gray-500 ml-2">(Loading...)</span>}
                {!loadingMaintenanceTasks && availableMaintenanceTasks.length === 0 && (
                  <span className="text-xs text-amber-600 ml-2">(No tasks available)</span>
                )}
              </label>
              <Field
                as="select"
                id="procedure_template"
                name="procedure_template"
                className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target ${
                  errors.procedure_template && touched.procedure_template ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loadingMaintenanceTasks}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const taskId = e.target.value ? Number(e.target.value) : '';
                  setFieldValue('procedure_template', taskId);

                  // If a task is selected, auto-populate fields based on template
                  if (taskId) {
                    const selectedTask = availableMaintenanceTasks.find(t => t.id === Number(taskId));
                    if (selectedTask) {

                      // Auto-populate title if empty
                      if (!values.pmtitle || values.pmtitle.trim() === '') {
                        setFieldValue('pmtitle', selectedTask.name);
                      }

                      // CRITICAL: Auto-set frequency and calculate scheduled_date based on template frequency
                      if (selectedTask.frequency && selectedTask.frequency.trim() !== '' && selectedTask.frequency !== 'N/A') {
                        const templateFrequency = selectedTask.frequency.toLowerCase().trim();
                        const validFrequencies: FrequencyType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'];

                        if (validFrequencies.includes(templateFrequency as FrequencyType)) {
                          // Set frequency from template
                          setFieldValue('frequency', templateFrequency as FrequencyType);

                          // Calculate next scheduled date based on template frequency
                          const customDays = templateFrequency === 'custom' ? (selectedTask.custom_days ?? undefined) : undefined;
                          const nextDate = calculateNextScheduledDate(templateFrequency, customDays);
                          const formattedDate = formatDateForInput(nextDate);

                          // Always update scheduled_date when template is selected
                          setFieldValue('scheduled_date', formattedDate);

                          // Set custom_days if frequency is custom
                          if (templateFrequency === 'custom' && selectedTask.custom_days) {
                            setFieldValue('custom_days', selectedTask.custom_days);
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
                    setFieldValue('frequency', 'monthly');
                    setFieldValue('custom_days', '');
                  }
                }}
              >
                <option value="">Select a maintenance task template</option>
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
                  ? 'No task templates available for the current selection.'
                  : 'Select a task template first. Machine choices will appear after a template is selected.'}
              </p>

              {errors.procedure_template && touched.procedure_template && (
                <p className="mt-1 text-xs sm:text-sm text-red-500">{errors.procedure_template}</p>
              )}
              {!loadingMaintenanceTasks && availableMaintenanceTasks.length === 0 && values.selected_machine_ids && values.selected_machine_ids.length > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No tasks match the selected machine(s). Tasks are filtered by machine group_id or linked procedures.
                </p>
              )}
            </div>


            {/* Machines Selection */}
            {values.procedure_template === '' ? (
              <div className="mb-4 sm:mb-6 rounded-md border border-blue-200 bg-blue-50 p-3 sm:p-4 text-sm text-blue-800">
                Select a Maintenance Task Template first to see related machine concerns.
              </div>
            ) : (
            <div className="mb-4 sm:mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Machine Concerns (Optional) {loadingMachines && <span className="text-xs text-gray-500">(Loading...)</span>}
              </label>
              <div
                className={`border rounded-md p-3 sm:p-4 max-h-60 overflow-y-auto bg-white scroll-momentum ${
                  errors.selected_machine_ids && touched.selected_machine_ids ? 'border-red-500' : 'border-gray-300'
                }`}
                role="group"
                aria-label="Select machine concerns"
              >
                {!values.property_id ? (
                  <p className="text-sm text-gray-500">Please select a property to see available machines.</p>
                ) : loadingMachines ? (
                  <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="ml-2 text-sm text-gray-500">Loading machines...</p>
                  </div>
                ) : (() => {
                  const selectedTask = availableMaintenanceTasks.find(t => t.id === Number(values.procedure_template));
                  const selectedTaskGroupId = selectedTask?.group_id?.trim().toLowerCase();
                  const machinesMatchingTemplate = selectedTaskGroupId
                    ? availableMachines.filter((m) => m.group_id?.trim().toLowerCase() === selectedTaskGroupId)
                    : availableMachines;
                  const machinesToShow = machineId
                    ? machinesMatchingTemplate.filter(m => m.machine_id === machineId)
                    : machinesMatchingTemplate;

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
                          <p className="text-sm text-gray-500 mb-3">No machine concerns are available for the selected template and property.</p>
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
            )}

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

            {/* Action Buttons — sticky to bottom on mobile so the primary CTA
                is always reachable without scrolling through every section. */}
            <div
              className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:mt-8"
              style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
            >
              <div className="mx-auto flex max-w-lg flex-col-reverse gap-3 md:max-w-none md:flex-row md:justify-between md:gap-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="w-full sm:w-auto h-12 sm:h-11 px-6 bg-gray-100 text-gray-700 font-medium rounded-md shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors touch-target"
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
                  className={`w-full sm:w-auto h-12 sm:h-11 px-6 ${
                    isSubmitting || isLoading
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/30'
                  } text-white font-bold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors touch-target`}
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
            </div>
          </Form>
        );
        }}
      </Formik>
    </div>
  );
};

export default PreventiveMaintenanceForm;
