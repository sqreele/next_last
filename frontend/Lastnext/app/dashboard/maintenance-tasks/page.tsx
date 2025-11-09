'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from '@/app/lib/session.client';
import { useRouter } from 'next/navigation';
import apiClient from '@/app/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import {
  Settings,
  Plus,
  Search,
  Wrench,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Filter,
  RefreshCw,
  Users,
  FileText,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';

interface MaintenanceTask {
  id: number;
  equipment: number; // Equipment ID (from backend serializer)
  equipment_name: string; // Equipment name (from backend serializer)
  name: string;
  description: string;
  frequency: string;
  estimated_duration: string;
  responsible_department?: string;
  difficulty_level: string;
  // steps removed - not displayed
  schedule_count?: number;
  required_tools?: string;
  safety_notes?: string;
  created_at: string;
  updated_at: string;
}

const frequencyColors: Record<string, string> = {
  daily: 'bg-red-100 text-red-800 border-red-200',
  weekly: 'bg-orange-100 text-orange-800 border-orange-200',
  monthly: 'bg-blue-100 text-blue-800 border-blue-200',
  quarterly: 'bg-green-100 text-green-800 border-green-200',
  semi_annual: 'bg-purple-100 text-purple-800 border-purple-200',
  annual: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  custom: 'bg-gray-100 text-gray-800 border-gray-200',
};

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-orange-100 text-orange-800',
  expert: 'bg-red-100 text-red-800',
};

export default function MaintenanceTasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTasks();
    }
  }, [status]);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/maintenance-procedures/');
      
      // Handle both array and paginated response formats
      let taskData: MaintenanceTask[] = [];
      if (Array.isArray(response.data)) {
        taskData = response.data;
      } else if (response.data && typeof response.data === 'object' && 'results' in response.data) {
        // Paginated response
        taskData = response.data.results || [];
      } else if (response.data) {
        // Fallback: try to use response.data directly
        taskData = [response.data];
      }
      
      console.log('Fetched maintenance tasks:', taskData);
      setTasks(taskData);
      setFilteredTasks(taskData);
    } catch (err: any) {
      console.error('Error fetching maintenance tasks:', err);
      setError(err.message || 'Failed to load maintenance tasks');
      setTasks([]);
      setFilteredTasks([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter tasks based on search and filters
  useEffect(() => {
    let filtered = tasks;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (task) =>
          task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.equipment_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Frequency filter
    if (frequencyFilter !== 'all') {
      filtered = filtered.filter((task) => task.frequency === frequencyFilter);
    }

    // Difficulty filter
    if (difficultyFilter !== 'all') {
      filtered = filtered.filter((task) => task.difficulty_level === difficultyFilter);
    }

    setFilteredTasks(filtered);
  }, [searchQuery, frequencyFilter, difficultyFilter, tasks]);

  const getFrequencyLabel = (freq: string) => {
    const labels: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      semi_annual: 'Semi-Annual',
      annual: 'Annual',
      custom: 'Custom',
    };
    return labels[freq] || freq;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-8 w-8 text-blue-600" />
            Maintenance Tasks
          </h1>
          <p className="text-gray-600 mt-1">
            Manage maintenance procedures and task templates for equipment
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/maintenance-tasks/create">
            <Plus className="h-4 w-4 mr-2" />
            Create Task
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tasks</p>
                <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
              </div>
              <Wrench className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Daily/Weekly</p>
                <p className="text-2xl font-bold text-gray-900">
                  {tasks.filter((t) => t.frequency === 'daily' || t.frequency === 'weekly').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Expert Level</p>
                <p className="text-2xl font-bold text-gray-900">
                  {tasks.filter((t) => t.difficulty_level === 'expert' || t.difficulty_level === 'advanced').length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        {/* Stats card for steps - HIDDEN */}
        {false && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">With Steps</p>
                <p className="text-2xl font-bold text-gray-900">
                  {tasks.filter((t) => (t as any).steps && (t as any).steps.length > 0).length}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      {/* Filters & Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Frequency Filter */}
            <select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Frequencies</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semi_annual">Semi-Annual</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>

            {/* Difficulty Filter */}
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-600">
              Showing {filteredTasks.length} of {tasks.length} tasks
            </p>
            <Button variant="outline" size="sm" onClick={fetchTasks}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      <div className="space-y-4">
        {filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchQuery || frequencyFilter !== 'all' || difficultyFilter !== 'all'
                  ? 'No tasks found matching your filters'
                  : 'No maintenance tasks yet. Create your first task to get started.'}
              </p>
              {tasks.length === 0 && (
                <Button asChild className="mt-4">
                  <Link href="/dashboard/maintenance-tasks/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Task
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task) => (
            <Card 
              key={task.id} 
              className="hover:shadow-lg transition-all border-l-4"
              style={{ borderLeftColor: task.frequency === 'daily' ? '#dc2626' : task.frequency === 'weekly' ? '#ea580c' : '#3b82f6' }}
            >
              <CardContent 
                className="pt-6 cursor-pointer" 
                onClick={(e) => {
                  // Allow clicking anywhere on the card except badges to navigate
                  if ((e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('.badge-container')) {
                    return;
                  }
                  router.push(`/dashboard/maintenance-tasks/${task.id}`);
                }}
              >
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-start gap-2">
                            <Settings className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                                {task.name}
                              </h3>
                              {task.equipment_name && (
                                <p className="text-sm text-gray-600 mt-1">
                                  <Wrench className="h-3 w-3 inline mr-1" />
                                  Equipment: <span className="font-medium">{task.equipment_name}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <Link href={`/dashboard/maintenance-tasks/${task.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            View Details
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-gray-700 line-clamp-2">{task.description}</p>

                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-2 badge-container">
                        <Badge className={frequencyColors[task.frequency] || 'bg-gray-100 text-gray-800'}>
                          {getFrequencyLabel(task.frequency)}
                        </Badge>
                        
                        <Badge className={difficultyColors[task.difficulty_level] || 'bg-gray-100 text-gray-800'}>
                          {task.difficulty_level.charAt(0).toUpperCase() + task.difficulty_level.slice(1)}
                        </Badge>

                        {task.estimated_duration && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {task.estimated_duration}
                          </Badge>
                        )}

                        {/* Steps badge - HIDDEN */}
                        {false && (task as any).steps && (task as any).steps.length > 0 && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {(task as any).steps.length} Steps
                          </Badge>
                        )}

                        {task.responsible_department && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {task.responsible_department}
                          </Badge>
                        )}

                        {task.safety_notes && (
                          <Badge variant="outline" className="flex items-center gap-1 bg-yellow-50 text-yellow-800 border-yellow-300">
                            <AlertTriangle className="h-3 w-3" />
                            Safety Notes
                          </Badge>
                        )}

                        {task.required_tools && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Tools Required
                          </Badge>
                        )}
                      </div>

                      {/* Quick Preview on Expand - Steps removed */}
                      {false && expandedTaskId === task.id && (task as any).steps && (task as any).steps.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Procedure Steps Preview (First 3)
                          </h4>
                          <div className="space-y-2">
                            {(task as any).steps.slice(0, 3).map((step: any, idx: number) => (
                              <div key={idx} className="flex gap-2 text-sm">
                                <span className="font-semibold text-blue-600">{step.step_number}.</span>
                                <span className="text-gray-700">{step.title}</span>
                              </div>
                            ))}
                            {(task as any).steps.length > 3 && (
                              <p className="text-xs text-gray-500 italic">
                                +{(task as any).steps.length - 3} more steps...
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

