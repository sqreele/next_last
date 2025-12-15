// MyJobs.js - Updated with Status Update functionality
"use client";

import * as React from "react";
import { useSession } from "@/app/lib/session.client";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Home, Pencil, Trash2, Loader, RefreshCcw, X, 
  Briefcase, CheckCircle2, Clock, Calendar, Search, Filter,
  Sparkles, TrendingUp, Info, Plus, Smile
} from "lucide-react";
// --- UI Imports ---
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/app/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/app/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
// --- Lib/Hook Imports ---
import { useUser, useJobs } from "@/app/lib/stores/mainStore";
import { useJobsData } from "@/app/lib/hooks/useJobsData";
import { Job, JobStatus, JobPriority, Topic } from "@/app/lib/types";
import { fetchTopics, deleteJob as deleteJobApi } from "@/app/lib/data.server";
// --- Component Imports ---
import CreateJobButton from "@/app/components/jobs/CreateJobButton";
import JobFilters, { FilterState } from "@/app/components/jobs/JobFilters";
import Pagination from "@/app/components/jobs/Pagination";
import UpdateStatusButton from "@/app/components/jobs/UpdateStatusButton"; // Import the new component

// Constants
const ITEMS_PER_PAGE = 25;

// Tailwind-based styles (Keep as they are)
const PRIORITY_STYLES: Record<JobPriority | 'default', string> = {
  high: "bg-red-100 text-red-800 border border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  low: "bg-green-100 text-green-800 border border-green-200",
  default: "bg-gray-100 text-gray-800 border border-gray-200",
};
const STATUS_STYLES: Record<JobStatus | "default", string> = {
  completed: "bg-green-100 text-green-800 border border-green-200",
  in_progress: "bg-blue-100 text-blue-800 border border-blue-200",
  pending: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  cancelled: "bg-red-100 text-red-800 border border-red-200",
  waiting_sparepart: "bg-gray-100 text-gray-800 border border-gray-200",
  default: "bg-gray-100 text-gray-800 border border-gray-200",
};

// Updated Types
interface JobTableRowProps {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onStatusUpdated: (updatedJob: Job) => void; // Add this prop
}

interface EditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
  availableTopics: Topic[];
  selectedTopics: Topic[];
  onTopicsChange: (topics: Topic[]) => void;
}

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
}

// Include the updated JobTableRow component
// Updated JobTableRow component - Desktop only
const JobTableRow: React.FC<JobTableRowProps> = React.memo(
  ({ job, onEdit, onDelete, onStatusUpdated }) => (
    <TableRow className="hidden md:table-row hover:bg-gray-50 cursor-pointer" onClick={() => onEdit(job)}>
      <TableCell className="py-3">
        <div className="font-medium text-gray-900">#{job.job_id}</div>
        <Badge
          className={`${PRIORITY_STYLES[job.priority as JobPriority] || PRIORITY_STYLES.default
            } text-xs`}
        >
          {job.priority.charAt(0).toUpperCase() + job.priority.slice(1)}
        </Badge>
        {job.remarks && (
          <div className="mt-2">
            <div className="text-xs text-gray-500 font-medium">Comments:</div>
            <div 
              className="text-xs text-gray-600 bg-gray-50 p-1.5 rounded border max-w-xs"
              title={job.remarks.length > 50 ? job.remarks : undefined}
            >
              {job.remarks.length > 50 ? `${job.remarks.substring(0, 50)}...` : job.remarks}
            </div>
          </div>
        )}
      </TableCell>
      <TableCell className="py-3 max-w-sm">
        <p className="text-sm text-gray-700 truncate mb-1">{job.description}</p>
        <div className="flex flex-wrap gap-1">
          {job.topics?.map((topic) => (
            <Badge
              key={topic.id ?? topic.title} // Use unique key
              variant="outline"
              className="text-xs"
            >
              {topic.title}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          {job.rooms?.map((room) => (
            <div key={room.room_id} className="flex items-center gap-1.5 text-sm text-gray-600">
              <Home className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{room.name}</span>
            </div>
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <Badge
            className={`${STATUS_STYLES[job.status] || STATUS_STYLES.default
              } text-xs px-2 py-1`}
          >
            {/* Replace underscores and capitalize */}
            {job.status.replace("_", " ").charAt(0).toUpperCase() + job.status.replace("_", " ").slice(1)}
          </Badge>
          {/* Add the Update Status button with stopPropagation */}
          <UpdateStatusButton 
            job={job} 
            onStatusUpdated={onStatusUpdated} 
            size="sm" 
            variant="outline" 
            className="text-xs h-7" 
            buttonText="Change Status"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          />
        </div>
      </TableCell>
      <TableCell className="py-3 text-sm text-gray-600">
        {new Date(job.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="py-3">
        <div className="flex items-center gap-1 justify-end pr-4"> {/* Align Actions Right */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation(); // Prevent row click
              onEdit(job);
            }}
            aria-label="Edit Job"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation(); // Prevent row click
              onDelete(job);
            }}
            aria-label="Delete Job"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  ),
  (prevProps, nextProps) =>
    prevProps.job.job_id === nextProps.job.job_id &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.priority === nextProps.job.priority &&
    prevProps.job.description === nextProps.job.description
);

// Separate component for mobile view - Friendly design
const JobMobileCard: React.FC<JobTableRowProps> = React.memo(
  ({ job, onEdit, onDelete, onStatusUpdated }) => (
    <Card 
      variant="interactive"
      className="md:hidden border-gray-200 hover:border-blue-300 transition-all cursor-pointer"
      onClick={() => onEdit(job)}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 rounded-lg">
                <Briefcase className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-base font-bold text-gray-900">#{job.job_id}</span>
            </div>
            <Badge
              className={`${PRIORITY_STYLES[job.priority as JobPriority] || PRIORITY_STYLES.default
                } text-xs font-medium`}
            >
              {job.priority.charAt(0).toUpperCase() + job.priority.slice(1)} Priority
            </Badge>
          </div>
          <Badge
            className={`${STATUS_STYLES[job.status] || STATUS_STYLES.default
              } text-xs px-3 py-1.5 font-semibold`}
          >
            {job.status.replace("_", " ").charAt(0).toUpperCase() + job.status.replace("_", " ").slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Description</span>
          </div>
          <p className="text-sm text-gray-800 break-words leading-relaxed">{job.description}</p>
          {job.topics && job.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {job.topics?.map((topic) => (
                <Badge
                  key={topic.id ?? topic.title}
                  variant="outline"
                  className="text-xs bg-gray-50 hover:bg-gray-100"
                >
                  {topic.title}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {job.rooms && job.rooms.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <Home className="h-3.5 w-3.5" />
              <span>Location</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {job.rooms?.map((room) => (
                <div key={room.room_id} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 p-2 rounded-md">
                  <Home className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="font-medium">{room.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Created {new Date(job.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {job.remarks && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Comments</span>
            </div>
            <div className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100">
              {job.remarks}
            </div>
          </div>
        )}

        <div className="pt-3 space-y-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          <UpdateStatusButton 
            job={job} 
            onStatusUpdated={onStatusUpdated} 
            size="sm" 
            variant="outline" 
            className="w-full border-blue-200 hover:bg-blue-50 hover:border-blue-300"
            buttonText="Update Status"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 hover:bg-blue-50 hover:border-blue-300"
              onClick={() => onEdit(job)}
            >
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 h-9"
              onClick={() => onDelete(job)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
  (prevProps, nextProps) =>
    prevProps.job.job_id === nextProps.job.job_id &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.priority === nextProps.job.priority &&
    prevProps.job.description === nextProps.job.description
);

JobTableRow.displayName = 'JobTableRow';
JobMobileCard.displayName = 'JobMobileCard';

// EditDialog component with topic editing
const EditDialog: React.FC<EditDialogProps> = ({ 
  isOpen, 
  onClose, 
  job, 
  onSubmit, 
  isSubmitting, 
  availableTopics, 
  selectedTopics, 
  onTopicsChange 
}) => {
  const [newTopicId, setNewTopicId] = React.useState<string>("");

  const handleAddTopic = () => {
    if (!newTopicId) return;
    
    const topicToAdd = availableTopics.find(topic => topic.id.toString() === newTopicId);
    if (topicToAdd && !selectedTopics.find(topic => topic.id === topicToAdd.id)) {
      onTopicsChange([...selectedTopics, topicToAdd]);
      setNewTopicId("");
    }
  };

  const handleRemoveTopic = (topicId: number) => {
    onTopicsChange(selectedTopics.filter(topic => topic.id !== topicId));
  };

  const availableTopicsForSelection = availableTopics.filter(
    topic => !selectedTopics.find(selected => selected.id === topic.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Job #{job?.job_id}</DialogTitle>
            <DialogDescription>
              Update the details for this maintenance job. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="description" className="text-right col-span-1 text-sm font-medium">
                Description
              </label>
              <Textarea
                id="description"
                name="description"
                defaultValue={job?.description}
                className="col-span-3"
                rows={3}
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="priority" className="text-right col-span-1 text-sm font-medium">
                Priority
              </label>
              <Select name="priority" defaultValue={job?.priority}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Topics Section */}
            <div className="grid grid-cols-4 items-start gap-4">
              <label className="text-right col-span-1 text-sm font-medium pt-2">
                Topics
              </label>
              <div className="col-span-3 space-y-3">
                {/* Selected Topics */}
                <div className="space-y-2">
                  <div className="text-xs text-gray-600">Selected Topics:</div>
                  {selectedTopics.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedTopics.map((topic) => (
                        <Badge
                          key={topic.id}
                          variant="secondary"
                          className="flex items-center gap-1 pr-1"
                        >
                          {topic.title}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-gray-300"
                            onClick={() => handleRemoveTopic(topic.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No topics selected</div>
                  )}
                </div>
                
                {/* Add Topic */}
                {availableTopicsForSelection.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">Add Topic:</div>
                    <div className="flex gap-2">
                      <Select value={newTopicId} onValueChange={setNewTopicId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select a topic to add" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTopicsForSelection.map((topic) => (
                            <SelectItem key={topic.id} value={topic.id.toString()}>
                              {topic.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddTopic}
                        disabled={!newTopicId}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="remarks" className="text-right col-span-1 text-sm font-medium">
                Remarks
              </label>
              <Textarea
                id="remarks"
                name="remarks"
                defaultValue={job?.remarks || ''}
                className="col-span-3"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="is_defective" className="text-right col-span-1 text-sm font-medium">
                Defective?
              </label>
              <Checkbox
                id="is_defective"
                name="is_defective"
                defaultChecked={job?.is_defective}
                className="col-span-3 justify-self-start"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="is_preventivemaintenance" className="text-right col-span-1 text-sm font-medium">
                Preventive?
              </label>
              <Checkbox
                id="is_preventivemaintenance"
                name="is_preventivemaintenance"
                defaultChecked={job?.is_preventivemaintenance}
                className="col-span-3 justify-self-start"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
EditDialog.displayName = 'EditDialog';

// DeleteDialog component (Keep as is)
const DeleteDialog: React.FC<DeleteDialogProps> = ({ isOpen, onClose, onConfirm, isSubmitting }) => (
  <AlertDialog open={isOpen} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete the maintenance job.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onClose} disabled={isSubmitting}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
          {isSubmitting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
DeleteDialog.displayName = 'DeleteDialog';

// --- Main MyJobs component ---
const MyJobs: React.FC<{ activePropertyId?: string }> = ({ activePropertyId }) => {
  const { toast } = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const { userProfile, selectedPropertyId: selectedProperty } = useUser();
  const { updateJob: storeUpdateJob, deleteJob: storeDeleteJob } = useJobs();
  
  // Since we don't have loading state in the new store, we'll handle it differently
  const userLoading = false; // TODO: Add loading state to store if needed
  const router = useRouter();

  // Local state for UI
  const [filters, setFilters] = React.useState<FilterState>({
    search: "", status: "all", priority: "all"
  });
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedJob, setSelectedJob] = React.useState<Job | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  // Topic-related state
  const [availableTopics, setAvailableTopics] = React.useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = React.useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = React.useState(false);

  // Get current user ID for filtering
  const currentUserId = session?.user?.id;
  const currentUsername = session?.user?.username;

  // Debug logging
  React.useEffect(() => {
    console.log('MyJobs: Session status:', sessionStatus);
    console.log('MyJobs: Current user ID:', currentUserId);
    console.log('MyJobs: Current username:', currentUsername);
    console.log('MyJobs: Selected property:', selectedProperty);
  }, [sessionStatus, currentUserId, currentUsername, selectedProperty]);

  // Use the hook for data fetching - always fetch user's jobs, not property-specific jobs
  // Note: Backend's my_jobs endpoint already filters by authenticated user, 
  // so we don't need to pass user_id in query params
  const {
    jobs,
    isLoading,
    error,
    refreshJobs,
    updateJob, // Hook's function to update local state
    removeJob, // Hook's function to remove from local state
  } = useJobsData({ 
    propertyId: null, // keep using My Jobs endpoint
    filters: { 
      ...filters,
      // Don't pass user_id - backend handles user filtering automatically
      // pass selected property as a filter so backend restricts My Jobs to that property
      property_id: selectedProperty ?? null,
    }
  });

  // Debug logging for jobs
  React.useEffect(() => {
    console.log('MyJobs: Jobs fetched:', jobs?.length || 0);
    console.log('MyJobs: Is loading:', isLoading);
    console.log('MyJobs: Error:', error);
    if (jobs && jobs.length > 0) {
      console.log('MyJobs: First job sample:', {
        job_id: jobs[0]?.job_id,
        user: jobs[0]?.user,
        status: jobs[0]?.status,
        description: jobs[0]?.description?.substring(0, 50)
      });
    }
  }, [jobs, isLoading, error]);

  // Filter jobs based on local state
  // Note: Backend already filters by user, so we don't need to check job.user here
  const filteredJobs = React.useMemo(() => {
    if (!Array.isArray(jobs)) {
      console.log('MyJobs: jobs is not an array:', jobs);
      return [];
    }
    
    console.log(`MyJobs: Filtering ${jobs.length} jobs with filters:`, filters);
    
    const filtered = jobs.filter((job) => {
      // Apply search filter
      const searchLower = filters.search.toLowerCase();
      const descMatch = job.description?.toLowerCase().includes(searchLower);
      const idMatch = job.job_id?.toString().includes(searchLower);
      const roomMatch = job.rooms?.some(room => room.name?.toLowerCase().includes(searchLower));
      const topicMatch = job.topics?.some(topic => topic.title?.toLowerCase().includes(searchLower));
      const matchesSearch = filters.search === "" || descMatch || idMatch || roomMatch || topicMatch;

      // Apply status filter (if "all", show all statuses including completed)
      const matchesStatus = filters.status === "all" || job.status === filters.status;
      
      // Apply priority filter
      const matchesPriority = filters.priority === "all" || job.priority === filters.priority;

      return matchesSearch && matchesStatus && matchesPriority;
    });
    
    console.log(`MyJobs: Filtered to ${filtered.length} jobs`);
    return filtered;
  }, [jobs, filters]);

  // Calculate pagination details
  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredJobs.length);
  const currentJobs = filteredJobs.slice(startIndex, endIndex);

  // Reset page number when filters or property change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters, activePropertyId, selectedProperty]);

  // Effect to handle redirection if unauthenticated
  React.useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [sessionStatus, router]);

  // Effect to refresh jobs when filters change
  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      // refresh when filters change or selected property changes
      refreshJobs();
    }
  }, [filters, selectedProperty, sessionStatus, refreshJobs]);

  // Function to fetch available topics
  const fetchAvailableTopics = async () => {
    if (!session?.user?.accessToken) return;
    
    setTopicsLoading(true);
    try {
      const topics = await fetchTopics(session.user.accessToken);
      setAvailableTopics(topics);
    } catch (error) {
      console.error('Failed to fetch topics:', error);
      toast({
        title: "Warning",
        description: "Failed to load available topics",
        variant: "destructive",
      });
    } finally {
      setTopicsLoading(false);
    }
  };

  // Fetch topics when dialog opens
  React.useEffect(() => {
    if (isEditDialogOpen && session?.user?.accessToken) {
      fetchAvailableTopics();
    }
  }, [isEditDialogOpen, session?.user?.accessToken]);

  // --- Event Handlers ---
  const handleFilterChange = (newFilters: FilterState) => setFilters(newFilters);
  const handleClearFilters = () => setFilters({ search: "", status: "all", priority: "all" });
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo(0, 0);
    }
  };
  const handleEdit = (job: Job) => { 
    setSelectedJob(job); 
    setSelectedTopics(job.topics || []); // Initialize with current job topics
    setIsEditDialogOpen(true); 
  };
  const handleDelete = (job: Job) => { setSelectedJob(job); setIsDeleteDialogOpen(true); };

  // New handler for status updates
  const handleStatusUpdated = (updatedJob: Job) => {
    updateJob(updatedJob);
  };

  // Handler for topic changes
  const handleTopicsChange = (topics: Topic[]) => {
    setSelectedTopics(topics);
  };

  // Submit handler for edit dialog
  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData(event.currentTarget);
      
      // Create update data that includes the required fields from the original job
      const updatedJobData: Partial<Job> = {
        description: formData.get("description") as string,
        priority: formData.get("priority") as JobPriority,
        remarks: (formData.get("remarks") as string) || undefined,
        is_defective: formData.get("is_defective") === "on",
        is_preventivemaintenance: formData.get("is_preventivemaintenance") === "on",
        
        // Handle timestamp fields
        created_at: formData.get("created_at") as string || selectedJob.created_at,
        updated_at: formData.get("updated_at") as string || selectedJob.updated_at,
        completed_at: formData.get("completed_at") as string || selectedJob.completed_at,
        
        // Use updated topics from the dialog
        topics: selectedTopics,
      };
      
      // For the API request
      const apiRequestData = {
        ...updatedJobData,
        topic_data: selectedTopics, // Use updated topics
        room_id: selectedJob.rooms?.[0]?.room_id,
      };

      // Call API function with the data formatted for the API
              // Update job in store
        storeUpdateJob(selectedJob.id, apiRequestData);
        const updatedJobResult = { ...selectedJob, ...apiRequestData };

      // Update local state using the hook's function
      updateJob(updatedJobResult);

      toast({ title: "Success", description: "Job updated successfully." });
      setIsEditDialogOpen(false);
      setSelectedJob(null);
    } catch (error) {
      console.error("Failed to update job:", error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedJob) return;

    setIsSubmitting(true);
    try {
      if (!session?.user?.accessToken) {
        throw new Error("Not authenticated");
      }

      // Delete on backend first
      await deleteJobApi(String(selectedJob.job_id), session.user.accessToken);

      // Then update local stores/state
      storeDeleteJob(selectedJob.id);
      removeJob(selectedJob.job_id);

      toast({ title: "Success", description: "Job deleted successfully." });
      setIsDeleteDialogOpen(false);
      setSelectedJob(null);

      // Adjust pagination if needed
      if (currentJobs.length === 1 && currentPage > 1) {
          handlePageChange(currentPage - 1);
      }
    } catch (error) {
      console.error("Failed to delete job:", error);
      toast({
        title: "Deletion Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Job creation handler
  const handleJobCreated = async () => {
    const success = await refreshJobs(true);
    if (!success) {
      toast({ title: "Warning", description: "Job created, but failed to refresh list.", variant: "default" });
    }
  };

  const handleManualRefresh = async () => {
    await refreshJobs(true);
  };

  // --- Render Logic ---
  if (sessionStatus === "loading" || (isLoading && !error && jobs.length === 0)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <Loader className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
            <Sparkles className="h-6 w-6 text-yellow-400 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-700">Loading Your Jobs</p>
            <p className="text-sm text-gray-500 mt-1">Just a moment...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (sessionStatus === "unauthenticated") {
    return null; // Redirect handled by useEffect
  }

  // Main Render Output
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
      {/* Friendly header with gradient */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  My Jobs
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {userProfile?.username ? `Welcome back, ${userProfile.username}!` : 'Manage your maintenance tasks'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {selectedProperty && (
                <CreateJobButton 
                  propertyId={selectedProperty} 
                  onJobCreated={handleJobCreated} 
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={handleManualRefresh}
                disabled={isLoading}
                className="rounded-full hover:bg-blue-50 hover:border-blue-300 transition-all"
                title="Refresh jobs"
              >
                <RefreshCcw className={`h-5 w-5 ${isLoading ? 'animate-spin text-blue-600' : 'text-gray-600'}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Job count info with friendly design */}
        <Card className="mb-6 border-blue-100 bg-gradient-to-r from-blue-50/50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  {filteredJobs.length > 0 ? (
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Info className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {filteredJobs.length === jobs.length && !filtersApplied()
                      ? `You have ${jobs.length} job${jobs.length !== 1 ? 's' : ''} ${jobs.length === 0 ? 'yet' : 'in total'}`
                      : `Showing ${filteredJobs.length} of ${jobs.length} job${jobs.length !== 1 ? 's' : ''}`
                    }
                  </p>
                  {jobs.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {filtersApplied() ? 'Filtered results' : 'All your jobs'}
                    </p>
                  )}
                </div>
              </div>
              {jobs.length > 0 && (
                <div className="flex items-center gap-2">
                  {!filtersApplied() && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      All jobs
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Filters with better design */}
        <Card className="mb-6 border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-600" />
              <CardTitle className="text-base">Filters</CardTitle>
            </div>
            <CardDescription className="text-xs">Refine your job search</CardDescription>
          </CardHeader>
          <CardContent>
            <JobFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearFilters={handleClearFilters}
            />
          </CardContent>
        </Card>

        {/* Error Display with friendly design */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-1">Oops! Something went wrong</h3>
                  <p className="text-sm text-red-700 mb-3">{error}</p>
                  <Button 
                    onClick={() => refreshJobs(true)} 
                    variant="outline" 
                    size="sm"
                    className="bg-white hover:bg-red-50 border-red-300 text-red-700"
                  >
                    <RefreshCcw className="h-3 w-3 mr-2" />
                    Try Again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job List or Empty State */}
        {!error && (
          isLoading && jobs.length === 0 ? (
            <Card className="border-blue-100">
              <CardContent className="pt-12 pb-12 text-center">
                <div className="relative inline-block mb-4">
                  <Loader className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
                  <Sparkles className="h-6 w-6 text-yellow-400 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <p className="text-base font-medium text-gray-700">Loading your jobs...</p>
                <p className="text-sm text-gray-500 mt-1">This will just take a moment</p>
              </CardContent>
            </Card>
          ) : filteredJobs.length > 0 ? (
            <>
              {/* Table for Desktop */}
              <div className="hidden md:block">
                <Card className="border-gray-200 shadow-sm overflow-hidden">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-gray-50 to-blue-50/30 hover:bg-gray-50 border-b-2 border-gray-200">
                        <TableHead className="w-[180px] py-4 text-gray-700 font-semibold">Job Details</TableHead>
                        <TableHead className="py-4 text-gray-700 font-semibold">Description</TableHead>
                        <TableHead className="py-4 text-gray-700 font-semibold">Location</TableHead>
                        <TableHead className="py-4 text-gray-700 font-semibold">Status</TableHead>
                        <TableHead className="py-4 text-gray-700 font-semibold">Created</TableHead>
                        <TableHead className="w-[100px] py-4 text-gray-700 font-semibold text-right pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentJobs.map((job) => (
                        <JobTableRow 
                          key={job.job_id} 
                          job={job} 
                          onEdit={handleEdit} 
                          onDelete={handleDelete} 
                          onStatusUpdated={handleStatusUpdated} 
                        />
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
              
              {/* Cards for Mobile - Improved design */}
              <div className="md:hidden space-y-4">
                {currentJobs.map((job) => (
                  <JobMobileCard 
                    key={job.job_id} 
                    job={job} 
                    onEdit={handleEdit} 
                    onDelete={handleDelete} 
                    onStatusUpdated={handleStatusUpdated} 
                  />
                ))}
              </div>
              
              {/* Pagination with friendly design */}
              {totalPages > 1 && (
                <Card className="mt-6 border-gray-200">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <p className="text-sm text-gray-600">
                        Showing <span className="font-semibold text-gray-900">{startIndex + 1}</span> to{' '}
                        <span className="font-semibold text-gray-900">{endIndex}</span> of{' '}
                        <span className="font-semibold text-gray-900">{filteredJobs.length}</span> result{filteredJobs.length !== 1 ? 's' : ''}
                      </p>
                      <Pagination 
                        totalPages={totalPages} 
                        currentPage={currentPage} 
                        onPageChange={handlePageChange} 
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            // Empty State with friendly design
            <Card className="border-dashed border-2 border-gray-300 bg-gradient-to-br from-gray-50 to-white">
              <CardContent className="pt-16 pb-16 text-center">
                <div className="max-w-md mx-auto space-y-6">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-blue-100 rounded-full blur-xl opacity-50"></div>
                    {jobs.length > 0 ? (
                      <Search className="h-16 w-16 text-gray-300 mx-auto relative z-10" />
                    ) : (
                      <div className="relative z-10">
                        <Briefcase className="h-16 w-16 text-gray-300 mx-auto" />
                        <Smile className="h-8 w-8 text-yellow-400 absolute -bottom-2 -right-2" />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {jobs.length > 0 ? (
                        <>
                          No jobs match your filters
                        </>
                      ) : (
                        <>
                          Welcome! Ready to get started?
                        </>
                      )}
                    </h3>
                    <p className="text-gray-600 text-sm max-w-sm mx-auto">
                      {jobs.length > 0
                        ? "We couldn't find any jobs matching your current filters. Try adjusting your search or filters to see more results."
                        : (activePropertyId ?? selectedProperty)
                          ? "No maintenance requests found for this property yet. Create your first job to get started!"
                          : "You don't have any maintenance jobs yet. Create your first job to begin tracking maintenance tasks!"}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                    {jobs.length > 0 && filtersApplied() && (
                      <Button 
                        onClick={handleClearFilters} 
                        variant="outline"
                        className="border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filters
                      </Button>
                    )}
                    {jobs.length === 0 && selectedProperty && (
                      <CreateJobButton 
                        propertyId={selectedProperty} 
                        onJobCreated={handleJobCreated} 
                      />
                    )}
                    <Button 
                      onClick={() => refreshJobs(true)} 
                      variant={jobs.length > 0 ? "default" : "outline"}
                      disabled={isLoading}
                      className={jobs.length === 0 ? "border-blue-200 hover:bg-blue-50 hover:border-blue-300" : ""}
                    >
                      <RefreshCcw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      Refresh List
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Dialogs */}
      <EditDialog 
        isOpen={isEditDialogOpen} 
        onClose={() => setIsEditDialogOpen(false)} 
        job={selectedJob} 
        onSubmit={handleEditSubmit} 
        isSubmitting={isSubmitting}
        availableTopics={availableTopics}
        selectedTopics={selectedTopics}
        onTopicsChange={handleTopicsChange}
      />
      <DeleteDialog 
        isOpen={isDeleteDialogOpen} 
        onClose={() => setIsDeleteDialogOpen(false)} 
        onConfirm={handleDeleteConfirm} 
        isSubmitting={isSubmitting} 
      />
    </div>
  );

  // Helper function to check if any filters are active
  function filtersApplied() {
    return filters.search !== "" || filters.status !== "all" || filters.priority !== "all";
  }
};

export default MyJobs;