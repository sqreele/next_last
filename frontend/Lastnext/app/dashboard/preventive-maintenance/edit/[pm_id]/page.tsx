// app/dashboard/preventive-maintenance/edit/[pm_id]/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePreventiveMaintenanceActions } from '@/app/lib/hooks/usePreventiveMaintenanceActions';
import { PreventiveMaintenance, FrequencyType } from '@/app/lib/preventiveMaintenanceModels';
import { UpdatePreventiveMaintenanceData } from '@/app/lib/PreventiveMaintenanceService';
import { PreviewImage } from '@/app/components/ui/UniversalImage';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { 
  Calendar, 
  Save, 
  X, 
  Upload, 
  AlertCircle, 
  Clock,
  Settings,
  Image as ImageIcon,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { fetchAllMaintenanceProcedures, type MaintenanceProcedureTemplate } from '@/app/lib/maintenanceProcedures';

interface FormState {
  pmtitle: string;
  scheduled_date: string;
  frequency: FrequencyType;
  custom_days: number | null;  // Changed from number | null to ensure no undefined
  notes: string;
  completed_date: string;
  topic_ids: number[];
  machine_ids: string[];
  procedure_template: number | '';
  before_image_file: File | null;
  after_image_file: File | null;
  before_image_preview: string | null;
  after_image_preview: string | null;
}

interface FormErrors {
  pmtitle?: string;
  scheduled_date?: string;
  frequency?: string;
  custom_days?: string;
  general?: string;
}

type MaintenanceTaskOption = {
  id: number;
  name: string;
  category?: string;
  frequency: string;
  difficulty_level: string;
  responsible_department?: string;
};

export default function EditPreventiveMaintenancePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pmId = params.pm_id as string;
  const completeRequested = searchParams.get('complete') === 'true';
  
  const {
    fetchMaintenanceById,
    updateMaintenance,
    topics,
    isLoading,
    error: contextError,
    clearError
  } = usePreventiveMaintenanceActions();

  // State
  const [maintenance, setMaintenance] = useState<PreventiveMaintenance | null>(null);
  const hasAppliedCompletionRef = useRef(false);
  const [formState, setFormState] = useState<FormState>({
    pmtitle: '',
    scheduled_date: '',
    frequency: 'monthly',
    custom_days: null,
    notes: '',
    completed_date: '',
    topic_ids: [],
    machine_ids: [],
    procedure_template: '',
    before_image_file: null,
    after_image_file: null,
    before_image_preview: null,
    after_image_preview: null
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [availableMaintenanceTasks, setAvailableMaintenanceTasks] = useState<MaintenanceTaskOption[]>([]);
  const [loadingMaintenanceTasks, setLoadingMaintenanceTasks] = useState(false);

  // Load available maintenance tasks
    useEffect(() => {
      const fetchAvailableMaintenanceTasks = async () => {
        setLoadingMaintenanceTasks(true);
        try {
          const tasks = await fetchAllMaintenanceProcedures({ pageSize: 100 });
          setAvailableMaintenanceTasks(
            tasks.map<MaintenanceTaskOption>((task: MaintenanceProcedureTemplate) => ({
              id: task.id,
              name: task.name,
              category: task.category ?? undefined,
              frequency: task.frequency || 'N/A',
              difficulty_level: task.difficulty_level || 'N/A',
              responsible_department: task.responsible_department ?? undefined,
            }))
          );
        } catch (err: any) {
          console.error('Error fetching maintenance tasks:', err);
          setAvailableMaintenanceTasks([]);
        } finally {
          setLoadingMaintenanceTasks(false);
        }
      };
      fetchAvailableMaintenanceTasks();
    }, []);

  // Load maintenance data
  useEffect(() => {
    const loadMaintenance = async () => {
      if (pmId) {
        console.log('[EDIT FORM] Loading maintenance data for PM ID:', pmId);
        console.log('[EDIT FORM] PM ID case:', {
          original: pmId,
          uppercase: pmId.toUpperCase(),
          lowercase: pmId.toLowerCase()
        });
        
        try {
          // Try with original case
          let data = await fetchMaintenanceById(pmId);
          console.log('[EDIT FORM] Fetched maintenance data (attempt 1):', data);
          
          // If failed and starts with lowercase 'pm', try uppercase
          if (!data && pmId.toLowerCase().startsWith('pm')) {
            const upperPmId = pmId.toUpperCase();
            console.log('[EDIT FORM] Retrying with uppercase PM ID:', upperPmId);
            data = await fetchMaintenanceById(upperPmId);
            console.log('[EDIT FORM] Fetched maintenance data (attempt 2):', data);
          }
          
          if (data) {
            setMaintenance(data);
            populateForm(data);
          } else {
            console.error('[EDIT FORM] No maintenance data returned for PM ID:', pmId);
            setErrors({ 
              general: `Could not find maintenance record with ID: ${pmId}. 
              
              Troubleshooting:
              - Verify this PM ID exists in the database
              - Check Django Admin: http://localhost:8000/admin/myappLubd/preventivemaintenance/
              - Try accessing from the list page instead`
            });
          }
        } catch (err: any) {
          console.error('[EDIT FORM] Error loading maintenance:', err);
          console.error('[EDIT FORM] Error details:', {
            message: err.message,
            status: err.status,
            response: err.response
          });
          setErrors({ general: err.message || 'Failed to load maintenance data' });
        }
      }
    };

    loadMaintenance();
  }, [pmId, fetchMaintenanceById]);

  // Debug: Monitor form state changes
  useEffect(() => {
    console.log('[EDIT FORM] Form state changed:', {
      ...formState,
      machine_ids_detail: {
        count: formState.machine_ids.length,
        ids: formState.machine_ids,
        note: formState.machine_ids.length === 0 ? 'No machines assigned' : `${formState.machine_ids.length} machine(s) assigned`
      }
    });
  }, [formState]);

  // Helper to convert Date to datetime-local format
  const formatDateTimeLocal = (date: Date): string => {
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Populate form with existing data
  const populateForm = (data: PreventiveMaintenance) => {
    // Helper function to convert ISO datetime to datetime-local format
    const convertToDateTimeLocal = (isoString: string | null | undefined): string => {
      if (!isoString) return '';
      try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      } catch (error) {
        console.error('Error converting date:', error);
        return '';
      }
    };

    console.log('[EDIT FORM] populateForm debug:', {
      incoming_data: data,
      pmtitle_from_data: data.pmtitle,
      pmtitle_type: typeof data.pmtitle,
      pmtitle_length: data.pmtitle?.length || 0,
      before_image_url: data.before_image_url,
      after_image_url: data.after_image_url,
      has_before_image: !!data.before_image_url,
      has_after_image: !!data.after_image_url,
      machines: data.machines,
      machines_type: typeof data.machines,
      machines_is_array: Array.isArray(data.machines),
      machines_length: Array.isArray(data.machines) ? data.machines.length : 'N/A',
      machines_details: Array.isArray(data.machines) ? data.machines.map((m, idx) => ({
        index: idx,
        machine: m,
        machine_type: typeof m,
        machine_id: typeof m === 'object' ? m.machine_id : m,
        machine_name: typeof m === 'object' ? m.name : 'N/A'
      })) : 'N/A'
    });

    // Fix image URLs before setting them
    const fixedBeforeImageUrl = data.before_image_url ? fixImageUrl(data.before_image_url) : null;
    const fixedAfterImageUrl = data.after_image_url ? fixImageUrl(data.after_image_url) : null;
    
    console.log('[EDIT FORM] Image URL fixing:', {
      original_before_url: data.before_image_url,
      fixed_before_url: fixedBeforeImageUrl,
      original_after_url: data.after_image_url,
      fixed_after_url: fixedAfterImageUrl
    });

    // Extract machine IDs with detailed logging
    const extractedMachineIds = data.machines 
      ? data.machines.map(m => {
          const machineId = typeof m === 'object' ? m.machine_id : m;
          console.log('[EDIT FORM] Extracting machine ID:', {
            machine_object: m,
            machine_type: typeof m,
            extracted_id: machineId,
            machine_name: typeof m === 'object' ? m.name : 'N/A'
          });
          return machineId;
        })
      : [];
    
    console.log('[EDIT FORM] Machine IDs extraction result:', {
      original_machines: data.machines,
      extracted_machine_ids: extractedMachineIds,
      count: extractedMachineIds.length,
      note: extractedMachineIds.length === 0 ? 'No machines assigned to this maintenance task' : `${extractedMachineIds.length} machine(s) found`
    });

    setFormState({
      pmtitle: data.pmtitle || '',
      scheduled_date: convertToDateTimeLocal(data.scheduled_date),
      frequency: data.frequency as FrequencyType,
      custom_days: data.custom_days ?? null,  // Ensure null instead of undefined
      notes: data.notes || '',
      completed_date: convertToDateTimeLocal(data.completed_date),
      topic_ids: data.topics ? data.topics.map(t => typeof t === 'object' ? t.id : t) : [],
      procedure_template: data.procedure_template || data.procedure_template_id || '',
      machine_ids: extractedMachineIds,
      before_image_file: null,
      after_image_file: null,
      before_image_preview: fixedBeforeImageUrl,
      after_image_preview: fixedAfterImageUrl
    });
  };

  useEffect(() => {
    if (!completeRequested || !maintenance || hasAppliedCompletionRef.current) {
      return;
    }

    if (maintenance.completed_date) {
      hasAppliedCompletionRef.current = true;
      return;
    }

    if (formState.completed_date) {
      hasAppliedCompletionRef.current = true;
      return;
    }

    const completionValue = formatDateTimeLocal(new Date());
    if (!completionValue) {
      return;
    }

    setFormState((prev) => ({ ...prev, completed_date: completionValue }));
    setIsDirty(true);
    hasAppliedCompletionRef.current = true;
  }, [completeRequested, maintenance, formState.completed_date, formatDateTimeLocal]);

  // Handle form input changes
  const handleInputChange = (field: keyof FormState, value: any) => {
    console.log('[EDIT FORM] handleInputChange:', { field, value, currentFormState: formState });
    setFormState(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    
    // Clear field error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Handle file upload
  const handleFileUpload = (field: 'before_image_file' | 'after_image_file', file: File | null) => {
    console.log('[EDIT FORM] handleFileUpload called:', { field, file: file?.name, size: file?.size, type: file?.type });
    
    if (file) {
      // Validate file size (5MB max)
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_SIZE) {
        setErrors(prev => ({ ...prev, general: 'Image file size must be less than 5MB' }));
        console.error('[EDIT FORM] File too large:', file.size);
        return;
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, general: 'Please select a valid image file' }));
        console.error('[EDIT FORM] Invalid file type:', file.type);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log('[EDIT FORM] File loaded successfully');
        const previewField = field === 'before_image_file' ? 'before_image_preview' : 'after_image_preview';
        setFormState(prev => ({
          ...prev,
          [field]: file,
          [previewField]: e.target?.result as string
        }));
      };
      reader.onerror = (e) => {
        console.error('[EDIT FORM] FileReader error:', e);
        setErrors(prev => ({ ...prev, general: 'Failed to read image file' }));
      };
      reader.readAsDataURL(file);
    } else {
      const previewField = field === 'before_image_file' ? 'before_image_preview' : 'after_image_preview';
      setFormState(prev => ({
        ...prev,
        [field]: null,
        [previewField]: null
      }));
    }
    setIsDirty(true);
  };

  // Remove image
  const removeImage = (type: 'before' | 'after') => {
    if (type === 'before') {
      setFormState(prev => ({
        ...prev,
        before_image_file: null,
        before_image_preview: null
      }));
    } else {
      setFormState(prev => ({
        ...prev,
        after_image_file: null,
        after_image_preview: null
      }));
    }
    setIsDirty(true);
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formState.pmtitle.trim()) {
      newErrors.pmtitle = 'Title is required';
    }

    if (!formState.scheduled_date) {
      newErrors.scheduled_date = 'Scheduled date is required';
    }

    if (formState.frequency === 'custom' && (formState.custom_days === null || formState.custom_days <= 0)) {
      newErrors.custom_days = 'Custom days must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Helper function to convert datetime-local to Django-compatible format
  const convertDateTimeForBackend = (dateTimeLocal: string): string => {
    if (!dateTimeLocal) return '';
    
    try {
      // If it's already in the right format (YYYY-MM-DDTHH:mm), return as is
      if (dateTimeLocal.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        return dateTimeLocal;
      }
      
      // If it's a date only (YYYY-MM-DD), add default time
      if (dateTimeLocal.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return `${dateTimeLocal}T09:00`;
      }
      
      // Try to parse and convert
      const date = new Date(dateTimeLocal);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      
      return dateTimeLocal;
    } catch (error) {
      console.error('Error converting date:', error);
      return dateTimeLocal;
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    clearError();

    try {
      // Convert dates to proper format for backend
      const scheduledDate = convertDateTimeForBackend(formState.scheduled_date);
      const completedDate = formState.completed_date ? convertDateTimeForBackend(formState.completed_date) : undefined;
      
      console.log('[EDIT FORM] Date conversion debug:', {
        original_scheduled_date: formState.scheduled_date,
        converted_scheduled_date: scheduledDate,
        original_completed_date: formState.completed_date,
        converted_completed_date: completedDate
      });

      console.log('[EDIT FORM] Title debug:', {
        original_pmtitle: formState.pmtitle,
        trimmed_pmtitle: formState.pmtitle.trim(),
        pmtitle_length: formState.pmtitle.length,
        pmtitle_type: typeof formState.pmtitle
      });

      const updateData: UpdatePreventiveMaintenanceData = {
        pmtitle: formState.pmtitle.trim(),
        scheduled_date: scheduledDate,
        frequency: formState.frequency,
        custom_days: formState.frequency === 'custom' ? (formState.custom_days === null ? undefined : formState.custom_days) : undefined,
        notes: formState.notes.trim(),
        completed_date: completedDate,
        topic_ids: formState.topic_ids,
        machine_ids: formState.machine_ids,
        procedure_template: typeof formState.procedure_template === 'number' ? formState.procedure_template : (formState.procedure_template !== '' ? Number(formState.procedure_template) : undefined),
        before_image: formState.before_image_file || undefined,
        after_image: formState.after_image_file || undefined
      };

      console.log('[EDIT FORM] Submitting update data:', {
        ...updateData,
        before_image: formState.before_image_file ? { name: formState.before_image_file.name, size: formState.before_image_file.size } : 'none',
        after_image: formState.after_image_file ? { name: formState.after_image_file.name, size: formState.after_image_file.size } : 'none'
      });

      const result = await updateMaintenance(pmId, updateData);
      
      if (result) {
        setIsDirty(false);
        router.push(`/dashboard/preventive-maintenance/${pmId}`);
      }
    } catch (error) {
      console.error('Error updating maintenance:', error);
      setErrors({ general: 'Failed to update maintenance record. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle navigation with unsaved changes
  const handleNavigation = (path: string) => {
    if (isDirty && !window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
      return;
    }
    router.push(path);
  };

  // Get frequency display text
  const getFrequencyText = (freq: string) => {
    const frequencyMap: { [key: string]: string } = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      semi_annual: 'Semi-Annual',
      annual: 'Annual',
      custom: 'Custom'
    };
    return frequencyMap[freq] || freq;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
          <span className="text-sm sm:text-base text-gray-600">Loading maintenance record...</span>
        </div>
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Maintenance Record Not Found</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-6">The maintenance record you're looking for doesn't exist or you don't have permission to edit it.</p>
          <Link
            href="/dashboard/preventive-maintenance"
            className="inline-flex items-center justify-center px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 touch-target min-h-[44px] text-sm sm:text-base"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex-1">
          <button
            onClick={() => handleNavigation(`/dashboard/preventive-maintenance/${pmId}`)}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-2 text-sm sm:text-base touch-target min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Details
          </button>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Edit Maintenance</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">ID: {pmId}</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {isDirty && (
            <span className="text-xs sm:text-sm text-orange-600 flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* Error Display */}
      {(contextError || errors.general) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-start gap-2 sm:gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-red-700 font-medium text-sm sm:text-base break-words">{contextError || errors.general}</p>
              <p className="text-red-600 text-xs sm:text-sm mt-2">
                Troubleshooting:
              </p>
              <ul className="text-red-600 text-xs sm:text-sm mt-1 ml-4 list-disc space-y-1">
                <li>Check if the PM ID exists in the database</li>
                <li>Verify the PM ID is correct (should start with "PM")</li>
                <li>Make sure you have permission to edit this record</li>
                <li>Try accessing from the <Link href="/dashboard/preventive-maintenance" className="underline">main list page</Link></li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 md:p-6">
          {/* Basic Information */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Basic Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formState.pmtitle}
                  onChange={(e) => handleInputChange('pmtitle', e.target.value)}
                  className={`w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.pmtitle ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Enter maintenance title"
                />
                {errors.pmtitle && (
                  <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.pmtitle}</p>
                )}
              </div>

              {/* Scheduled Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Scheduled Date *
                </label>
                <input
                  type="datetime-local"
                  value={formState.scheduled_date}
                  onChange={(e) => handleInputChange('scheduled_date', e.target.value)}
                  className={`w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target ${
                    errors.scheduled_date ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.scheduled_date && (
                  <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.scheduled_date}</p>
                )}
              </div>

              {/* Frequency - HIDDEN (defaults to monthly) */}
              {false && (
              <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency
                </label>
                <select
                  value={formState.frequency}
                  onChange={(e) => handleInputChange('frequency', e.target.value as FrequencyType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi_annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Custom Days */}
              {formState.frequency === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Days *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formState.custom_days?.toString() || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (value === '') {
                        handleInputChange('custom_days', null);
                      } else {
                        const numValue = parseInt(value, 10);
                        handleInputChange('custom_days', isNaN(numValue) ? null : numValue);
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.custom_days ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter number of days"
                  />
                  {errors.custom_days && (
                    <p className="mt-1 text-sm text-red-600">{errors.custom_days}</p>
                  )}
                </div>
              )}
              </>
              )}

              {/* Completed Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Completed Date
                </label>
                <input
                  type="datetime-local"
                  value={formState.completed_date}
                  onChange={(e) => handleInputChange('completed_date', e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty if not completed yet
                </p>
              </div>

              {/* Maintenance Task Template */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2 flex items-center gap-2">
                  <Settings className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">Maintenance Task Template</span>
                  {loadingMaintenanceTasks && <span className="text-xs text-gray-500">(Loading...)</span>}
                </label>
                <select
                  value={formState.procedure_template}
                  onChange={(e) => {
                    const value = e.target.value;
                    handleInputChange('procedure_template', value === '' ? '' : Number(value));
                  }}
                  className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-target"
                >
                  <option value="">No Template (Optional)</option>
                  {availableMaintenanceTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}{task.category ? ` - ${task.category}` : ''} [{task.frequency?.toUpperCase() || 'N/A'}] - {task.difficulty_level || 'N/A'}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Link this maintenance to a reusable task template (optional)
                </p>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4 sm:mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                Notes
              </label>
              <textarea
                value={formState.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                placeholder="Enter maintenance notes..."
              />
            </div>
          </div>

          {/* Topics Selection - HIDDEN (topics removed from system) */}
          {false && topics.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Topics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {topics.map((topic) => (
                  <label key={topic.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.topic_ids.includes(topic.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleInputChange('topic_ids', [...formState.topic_ids, topic.id]);
                        } else {
                          handleInputChange('topic_ids', formState.topic_ids.filter(id => id !== topic.id));
                        }
                      }}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{topic.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Images</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Before Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Before Image
                </label>
                
                {formState.before_image_preview ? (
                  <div className="relative">
                    <PreviewImage
                      src={formState.before_image_preview}
                      alt="Before maintenance"
                      className="w-full h-40 sm:h-48 object-cover rounded-lg border border-gray-300"
                      width={400}
                      height={192}
                      onLoad={() => console.log('[EDIT FORM] Before image loaded successfully')}
                      onError={() => {
                        console.error('[EDIT FORM] Before image failed to load');
                        console.error('[EDIT FORM] Failed URL:', formState.before_image_preview);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage('before')}
                      className="absolute top-2 right-2 p-2 sm:p-1 bg-red-600 text-white rounded-full hover:bg-red-700 touch-target min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                      aria-label="Remove before image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
                    <ImageIcon className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                    <div className="mt-2">
                      <label className="cursor-pointer touch-feedback">
                        <span className="text-blue-600 hover:text-blue-700 text-sm sm:text-base inline-block py-2 px-4 rounded-md hover:bg-blue-50 touch-target min-h-[44px] flex items-center justify-center">Upload image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileUpload('before_image_file', e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    
                  </div>
                )}
              </div>

              {/* After Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  After Image
                </label>
                
                {formState.after_image_preview ? (
                  <div className="relative">
                    <PreviewImage
                      src={formState.after_image_preview}
                      alt="After maintenance"
                      className="w-full h-40 sm:h-48 object-cover rounded-lg border border-gray-300"
                      width={400}
                      height={192}
                      onLoad={() => console.log('[EDIT FORM] After image loaded successfully')}
                      onError={() => {
                        console.error('[EDIT FORM] After image failed to load');
                        console.error('[EDIT FORM] Failed URL:', formState.after_image_preview);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage('after')}
                      className="absolute top-2 right-2 p-2 sm:p-1 bg-red-600 text-white rounded-full hover:bg-red-700 touch-target min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                      aria-label="Remove after image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
                    <ImageIcon className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                    <div className="mt-2">
                      <label className="cursor-pointer touch-feedback">
                        <span className="text-blue-600 hover:text-blue-700 text-sm sm:text-base inline-block py-2 px-4 rounded-md hover:bg-blue-50 touch-target min-h-[44px] flex items-center justify-center">Upload image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileUpload('after_image_file', e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 sm:gap-4 pt-4 sm:pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => handleNavigation('/dashboard/preventive-maintenance')}
              className="w-full sm:w-auto px-6 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 touch-target min-h-[44px]"
            >
              Cancel
            </button>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleNavigation(`/dashboard/preventive-maintenance/${pmId}`)}
                className="w-full sm:w-auto px-6 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 touch-target min-h-[44px]"
              >
                View Details
              </button>
              
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className={`flex items-center justify-center w-full sm:w-auto px-6 py-3 sm:py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-target min-h-[44px] ${
                  isSubmitting || !isDirty
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
