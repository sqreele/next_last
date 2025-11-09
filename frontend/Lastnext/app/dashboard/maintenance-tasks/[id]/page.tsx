'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/app/lib/session.client';
import { useAuthStore } from '@/app/lib/stores/useAuthStore';
import apiClient from '@/app/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import {
  ArrowLeft,
  Wrench,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Users,
  FileText,
  Shield,
  History,
  Image as ImageIcon,
  Calendar,
  User
} from 'lucide-react';
import Link from 'next/link';

interface MaintenanceTask {
  id: number;
  equipment: number; // Equipment ID
  equipment_name: string; // Equipment name from serializer
  name: string;
  description: string;
  frequency: string;
  estimated_duration: string;
  responsible_department?: string;
  difficulty_level: string;
  // steps removed - not displayed
  required_tools?: string;
  safety_notes?: string;
  created_at: string;
  updated_at: string;
}

interface MaintenanceHistory {
  pm_id: string;
  pmtitle: string;
  scheduled_date: string;
  completed_date?: string;
  status: string;
  before_image_url?: string;
  after_image_url?: string;
  notes?: string;
  created_by?: {
    id: number;
    username: string;
    email?: string;
  };
  completed_by?: {
    id: number;
    username: string;
  };
  machines?: Array<{
    machine_id: string;
    name: string;
  }>;
  updated_at?: string;
  created_at?: string;
}

export default function MaintenanceTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap params using React.use() for Next.js 15 compatibility
  const unwrappedParams = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedProperty } = useAuthStore();
  const [task, setTask] = useState<MaintenanceTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Debug logging for property changes
  useEffect(() => {
    console.log('=== MAINTENANCE TASK DETAIL - PROPERTY CHANGE DEBUG ===');
    console.log('[Property Change] Selected Property:', selectedProperty);
    console.log('[Property Change] Task ID:', unwrappedParams.id);
    console.log('[Property Change] Current task:', task?.id, task?.name);
  }, [selectedProperty, unwrappedParams.id, task?.id, task?.name]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  // Memoize fetchMaintenanceHistory to prevent infinite loops
  const fetchMaintenanceHistory = useCallback(async (taskTemplateId: number) => {
    setLoadingHistory(true);
    try {
      console.log('=== MAINTENANCE HISTORY DEBUG START ===');
      console.log('[Maintenance History] Fetching for task template ID:', taskTemplateId);
      console.log('[Maintenance History] Task template ID type:', typeof taskTemplateId);
      console.log('[Maintenance History] Selected Property:', selectedProperty);
      
      // Build API params
      const apiParams: any = { page_size: 100 };
      if (selectedProperty) {
        apiParams.property_id = selectedProperty;
        console.log('[Maintenance History] Adding property_id filter:', selectedProperty);
      }
      
      // Fetch preventive maintenance records (filtered by property if selected)
      const response = await apiClient.get('/api/v1/preventive-maintenance/', {
        params: apiParams
      });
      
      console.log('[Maintenance History] API URL:', '/api/v1/preventive-maintenance/', apiParams);
      console.log('[Maintenance History] Raw API response:', response.data);
      console.log('[Maintenance History] Response type:', typeof response.data);
      console.log('[Maintenance History] Is array?', Array.isArray(response.data));
      console.log('[Maintenance History] Has results?', 'results' in (response.data || {}));
      
      // Handle both array and paginated response
      let historyData: MaintenanceHistory[] = [];
      if (Array.isArray(response.data)) {
        historyData = response.data;
        console.log('[Maintenance History] Using direct array');
      } else if (response.data && 'results' in response.data) {
        historyData = response.data.results || [];
        console.log('[Maintenance History] Using paginated results');
        console.log('[Maintenance History] Total count:', response.data.count);
      }
      
      console.log('[Maintenance History] Parsed data:', historyData);
      console.log('[Maintenance History] Number of records:', historyData.length);
      
      if (historyData.length > 0) {
        console.log('[Maintenance History] Sample record structure:', historyData[0]);
        console.log('[Maintenance History] Sample machines data:', historyData[0].machines);
      }
      
      // Filter to show records that use this task template
      const filtered = historyData.filter((record: any) => {
        console.log(`[Maintenance History] Checking record ${record.pm_id}:`, {
          procedure_template: record.procedure_template,
          procedure_template_id: record.procedure_template_id,
          property_id: record.property_id,
          matches_template: record.procedure_template === taskTemplateId || record.procedure_template_id === taskTemplateId
        });
        
        // Match by procedure_template or procedure_template_id
        const matchesTemplate = record.procedure_template === taskTemplateId || record.procedure_template_id === taskTemplateId;
        console.log(`  Record ${record.pm_id} uses task template ${taskTemplateId}: ${matchesTemplate}`);
        return matchesTemplate;
      });
      
      console.log('[Maintenance History] Filtered records:', filtered);
      console.log('[Maintenance History] Filtered count:', filtered.length);
      if (filtered.length > 0) {
        console.log('[Maintenance History] PM IDs found:', filtered.map(r => r.pm_id));
      }
      console.log('=== MAINTENANCE HISTORY DEBUG END ===');
      
      setMaintenanceHistory(filtered);
    } catch (err: any) {
      console.error('[Maintenance History] Error:', err);
      console.error('[Maintenance History] Error details:', err.response?.data);
      // Don't set error, just leave history empty
      setMaintenanceHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedProperty]); // Add selectedProperty to dependencies

  // Memoize fetchTask to prevent infinite loops
  const fetchTask = useCallback(async () => {
    console.log('[Fetch Task] Starting fetch for task ID:', unwrappedParams.id);
    console.log('[Fetch Task] Selected Property:', selectedProperty);
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<MaintenanceTask>(`/api/v1/maintenance-procedures/${unwrappedParams.id}/`);
      console.log('Fetched maintenance task:', response.data);
      console.log('Equipment data:', {
        equipment: response.data.equipment,
        equipment_name: response.data.equipment_name,
      });
      setTask(response.data);
      
      // Fetch maintenance history for this task template
      console.log('[Maintenance History] Will fetch for task template ID:', response.data.id);
      fetchMaintenanceHistory(response.data.id);
    } catch (err: any) {
      console.error('Error fetching task:', err);
      setError(err.message || 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  }, [unwrappedParams.id, selectedProperty, fetchMaintenanceHistory]); // Add selectedProperty

  useEffect(() => {
    console.log('[useEffect - fetchTask] Trigger check:', {
      status,
      id: unwrappedParams.id,
      selectedProperty,
      willFetch: status === 'authenticated' && unwrappedParams.id
    });
    
    if (status === 'authenticated' && unwrappedParams.id) {
      fetchTask();
    }
  }, [status, unwrappedParams.id, selectedProperty, fetchTask]); // Add selectedProperty to trigger refetch

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error || 'Task not found'}</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/maintenance-tasks">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Tasks
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const frequencyColors: Record<string, string> = {
    daily: 'bg-red-100 text-red-800',
    weekly: 'bg-orange-100 text-orange-800',
    monthly: 'bg-blue-100 text-blue-800',
    quarterly: 'bg-green-100 text-green-800',
    semi_annual: 'bg-purple-100 text-purple-800',
    annual: 'bg-indigo-100 text-indigo-800',
    custom: 'bg-gray-100 text-gray-800',
  };

  const difficultyColors: Record<string, string> = {
    beginner: 'bg-green-100 text-green-800',
    intermediate: 'bg-yellow-100 text-yellow-800',
    advanced: 'bg-orange-100 text-orange-800',
    expert: 'bg-red-100 text-red-800',
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/maintenance-tasks">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{task.name}</h1>
          <p className="text-gray-600">Task ID: {task.id}</p>
        </div>
      </div>

      {/* Equipment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Equipment Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Equipment Name</p>
              <p className="font-semibold text-gray-900">{task.equipment_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Equipment ID</p>
              <p className="font-semibold text-gray-900">{task.equipment || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Task Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">Description</p>
            <p className="text-gray-900">{task.description}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600 mb-1">Frequency</p>
              <Badge className={frequencyColors[task.frequency]}>
                {task.frequency.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Difficulty</p>
              <Badge className={difficultyColors[task.difficulty_level]}>
                {task.difficulty_level.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Duration</p>
              <p className="font-semibold text-gray-900 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {task.estimated_duration}
              </p>
            </div>
            {task.responsible_department && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Department</p>
                <p className="font-semibold text-gray-900 flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {task.responsible_department}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Procedure Steps - HIDDEN */}
      {false && (task as any)?.steps && (task as any).steps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Procedure Steps ({(task as any).steps.length})
            </CardTitle>
            <CardDescription>Follow these steps to complete the maintenance task</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {((task as any)?.steps || [])
                .sort((a: any, b: any) => a.step_number - b.step_number)
                .map((step: any, index: number) => (
                  <div key={index} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                        {step.step_number}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{step.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                      {step.estimated_time && (
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Estimated time: {step.estimated_time}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Required Tools */}
      {task.required_tools && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Required Tools & Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-900 whitespace-pre-wrap">{task.required_tools}</p>
          </CardContent>
        </Card>
      )}

      {/* Safety Notes */}
      {task.safety_notes && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <Shield className="h-5 w-5" />
              Safety Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-1" />
              <p className="text-yellow-900 whitespace-pre-wrap">{task.safety_notes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Maintenance History for this Equipment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Maintenance History ({maintenanceHistory.length})
          </CardTitle>
          <CardDescription>
            Past maintenance records using this task template
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="ml-3 text-gray-600">Loading maintenance history...</p>
            </div>
          ) : maintenanceHistory.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No maintenance history found for this task template yet.</p>
              <p className="text-sm text-gray-500 mt-2">Create a preventive maintenance record and link it to this task template to see history here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {maintenanceHistory
                .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
                .map((record, index) => (
                  <div key={record.pm_id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col lg:flex-row gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <Link 
                              href={`/dashboard/preventive-maintenance/${record.pm_id}`}
                              className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors block"
                            >
                              {record.pmtitle || 'Untitled Maintenance'}
                            </Link>
                            {record.pm_id && (
                              <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300 font-mono text-sm font-bold shadow-sm">
                                <span className="text-blue-600">PM ID:</span>
                                <span>{record.pm_id}</span>
                              </div>
                            )}
                          </div>
                          <Badge className={
                            record.status === 'completed' ? 'bg-green-100 text-green-800' :
                            record.status === 'overdue' ? 'bg-red-100 text-red-800' :
                            record.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }>
                            {record.status ? record.status.replace('_', ' ').toUpperCase() : 'SCHEDULED'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            <div>
                              <span className="text-xs text-gray-500">Scheduled:</span>
                              <p className="font-medium text-gray-900">{new Date(record.scheduled_date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          {record.completed_date && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <div>
                                <span className="text-xs text-gray-500">Completed:</span>
                                <p className="font-medium text-green-700">{new Date(record.completed_date).toLocaleDateString()}</p>
                              </div>
                            </div>
                          )}
                          {record.created_by && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Users className="h-4 w-4 text-purple-500" />
                              <div>
                                <span className="text-xs text-gray-500">Created By:</span>
                                <p className="font-medium text-gray-900">
                                  {typeof record.created_by === 'object' ? record.created_by.username : `User ${record.created_by}`}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {record.notes && (
                          <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Notes:</p>
                            <p className="text-sm text-gray-700">{record.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Images section removed - focusing on dates and user info */}
                      {false && (record.before_image_url || record.after_image_url) && (
                        <div className="flex gap-3 lg:w-1/3">
                          {record.before_image_url && (
                            <div className="flex-1">
                              <p className="text-xs text-gray-600 mb-1 font-medium">Before</p>
                              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                <img
                                  src={record.before_image_url}
                                  alt="Before maintenance"
                                  className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                                  onClick={() => window.open(record.before_image_url, '_blank')}
                                />
                                <div className="absolute top-1 right-1">
                                  <Badge variant="secondary" className="text-xs bg-white/80">
                                    <ImageIcon className="h-3 w-3 mr-1" />
                                    Before
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )}
                          {record.after_image_url && (
                            <div className="flex-1">
                              <p className="text-xs text-gray-600 mb-1 font-medium">After</p>
                              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                <img
                                  src={record.after_image_url}
                                  alt="After maintenance"
                                  className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                                  onClick={() => window.open(record.after_image_url, '_blank')}
                                />
                                <div className="absolute top-1 right-1">
                                  <Badge variant="secondary" className="text-xs bg-white/80">
                                    <ImageIcon className="h-3 w-3 mr-1" />
                                    After
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p>Created: {new Date(task.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p>Updated: {new Date(task.updated_at).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

