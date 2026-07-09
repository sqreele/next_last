"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock3,
  Home,
  Loader,
  MapPin,
  Pencil,
  RefreshCcw,
  Search,
  TimerReset,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Skeleton } from "@/app/components/ui/loading";
import { useToast } from "@/app/components/ui/use-toast";
import CreateJobButton from "@/app/components/jobs/CreateJobButton";
import Pagination from "@/app/components/jobs/Pagination";
import UpdateStatusButton from "@/app/components/jobs/UpdateStatusButton";
import { StatusBadge } from "@/app/components/StatusBadge";
import { FloatingActionButton, PriorityBadge } from "@/app/components/pcms-ui";
import { useSession } from "@/app/lib/session.client";
import { fetchTopics, deleteJob as deleteJobApi } from "@/app/lib/data.server";
import { useJobsData } from "@/app/lib/hooks/useJobsData";
import { useJobs, useUser } from "@/app/lib/stores/mainStore";
import { cn } from "@/app/lib/utils/cn";
import { getDisplayName } from "@/app/lib/utils/display-name";
import type { Job, JobPriority, JobStatus, Topic } from "@/app/lib/types";

const ITEMS_PER_PAGE = 24;

type DateFilter = "all" | "today" | "week" | "month";

interface FilterState {
  search: string;
  status: JobStatus | "all" | "overdue";
  priority: JobPriority | "all";
  date: DateFilter;
  room: string;
}

interface JobActionProps {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onStatusUpdated: (updatedJob: Job) => void;
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

const defaultFilters: FilterState = {
  search: "",
  status: "all",
  priority: "all",
  date: "all",
  room: "",
};

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getJobTitle(job: Job) {
  return job.title || job.topics?.[0]?.title || `Job #${job.job_id}`;
}

function getJobLocation(job: Job) {
  if (job.area_name) return job.area_name;
  if (job.area?.name) return job.area.name;
  if (job.room_name) return job.room_name;
  if (job.rooms?.length) return job.rooms.map((room) => room.name).filter(Boolean).join(", ");
  return "Room or area not set";
}

function getTechnician(job: Job) {
  if (job.technician_name) return job.technician_name;
  if (job.user_name) return job.user_name;
  if (typeof job.user === "object" && job.user) return getDisplayName(job.user, "Assigned technician");
  if (job.user) return String(job.user);
  return "Assigned technician";
}

function isOverdue(job: Job) {
  if (job.completed_at || job.status === "completed" || job.status === "cancelled") return false;
  const createdAt = new Date(job.created_at).getTime();
  if (Number.isNaN(createdAt)) return false;
  const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  return ageInDays >= 3;
}

function matchesDate(job: Job, dateFilter: DateFilter) {
  if (dateFilter === "all") return true;
  const createdAt = new Date(job.created_at);
  if (Number.isNaN(createdAt.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfJobDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());

  if (dateFilter === "today") return startOfJobDay.getTime() === startOfToday.getTime();

  const daysOld = (startOfToday.getTime() - startOfJobDay.getTime()) / (1000 * 60 * 60 * 24);
  if (dateFilter === "week") return daysOld >= 0 && daysOld <= 7;
  if (dateFilter === "month") return daysOld >= 0 && daysOld <= 30;
  return true;
}

function countByStatus(jobs: Job[], status: JobStatus) {
  return jobs.filter((job) => job.status === status).length;
}

function MyJobsSkeleton() {
  return (
    <div className="min-h-screen w-full px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-none space-y-5 lg:max-w-7xl">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function JobStatusSummary({ jobs }: { jobs: Job[] }) {
  const metrics = [
    { label: "Total Jobs", value: jobs.length, tone: "border-slate-200 bg-white text-slate-900", icon: Briefcase },
    { label: "In Progress", value: countByStatus(jobs, "in_progress"), tone: "border-blue-200 bg-blue-50 text-blue-900", icon: Wrench },
    { label: "Waiting", value: countByStatus(jobs, "waiting_sparepart"), tone: "border-amber-200 bg-amber-50 text-amber-900", icon: Clock3 },
    { label: "Completed", value: countByStatus(jobs, "completed"), tone: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
    { label: "Overdue", value: jobs.filter(isOverdue).length, tone: "border-red-200 bg-red-50 text-red-900", icon: TimerReset },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Job status summary">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className={cn("rounded-lg border p-3 shadow-sm", metric.tone)}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{metric.label}</p>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-semibold leading-none sm:text-3xl">{metric.value}</p>
          </div>
        );
      })}
    </section>
  );
}

function FilterBar({
  filters,
  onChange,
  onReset,
}: {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
}) {
  const hasFilters =
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.date !== "all" ||
    filters.room.trim() !== "";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="Filter jobs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Find Jobs</h2>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={onReset} className="h-9 px-2 text-slate-700">
            <X className="mr-1 h-4 w-4" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr_auto]">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={filters.search}
              onChange={(event) => onChange({ ...filters, search: event.target.value })}
              placeholder="Job title, ID, topic..."
              className="h-11 border-slate-300 pl-10 text-base sm:text-sm"
            />
          </div>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <Select value={filters.status} onValueChange={(value) => onChange({ ...filters, status: value as FilterState["status"] })}>
            <SelectTrigger className="h-11 border-slate-300 bg-white text-base sm:text-sm">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending / New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_sparepart">Waiting</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Priority</span>
          <Select value={filters.priority} onValueChange={(value) => onChange({ ...filters, priority: value as FilterState["priority"] })}>
            <SelectTrigger className="h-11 border-slate-300 bg-white text-base sm:text-sm">
              <SelectValue placeholder="All priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Date</span>
          <Select value={filters.date} onValueChange={(value) => onChange({ ...filters, date: value as DateFilter })}>
            <SelectTrigger className="h-11 border-slate-300 bg-white text-base sm:text-sm">
              <SelectValue placeholder="Any date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Date</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Room / Area</span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={filters.room}
              onChange={(event) => onChange({ ...filters, room: event.target.value })}
              placeholder="Room 204, lobby..."
              className="h-11 border-slate-300 pl-10 text-base sm:text-sm"
            />
          </div>
        </label>

        <div className="flex items-end">
          <Button type="button" variant="outline" onClick={onReset} className="h-11 w-full border-slate-300 text-slate-800 lg:w-auto">
            Reset Filters
          </Button>
        </div>
      </div>
    </section>
  );
}

function JobCard({ job, onEdit, onDelete, onStatusUpdated }: JobActionProps) {
  const router = useRouter();
  const description = job.description || "No description provided.";
  const location = getJobLocation(job);
  const technician = getTechnician(job);
  const overdue = isOverdue(job);

  const openDetail = () => router.push(`/dashboard/jobs/${job.job_id}`);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail();
        }
      }}
      className="group flex w-full cursor-pointer flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
      aria-label={`Open job ${job.job_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-600">#{job.job_id}</p>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-slate-900 group-hover:text-blue-800">
            {getJobTitle(job)}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={overdue ? "overdue" : job.status} />
          <PriorityBadge priority={job.priority} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <Home className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate font-medium text-slate-900">{location}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{technician}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-slate-500" />
          <span>Created {formatDate(job.created_at)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 className="h-4 w-4 shrink-0 text-slate-500" />
          <span>Due date not set</span>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-700">{description}</p>

      {job.topics?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {job.topics.slice(0, 3).map((topic) => (
            <Badge key={topic.id ?? topic.title} variant="outline" className="border-slate-200 bg-slate-50 text-sm text-slate-700">
              {topic.title}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center" onClick={(event) => event.stopPropagation()}>
        <Button type="button" onClick={openDetail} className="h-11 w-full sm:w-auto">
          View Detail
        </Button>
        <UpdateStatusButton
          job={job}
          onStatusUpdated={onStatusUpdated}
          variant="outline"
          size="sm"
          className="h-11 w-full border-slate-300 text-slate-800 sm:w-auto"
          buttonText="Update Status"
        />
        <Button type="button" variant="outline" onClick={() => onEdit(job)} className="h-11 w-full border-slate-300 text-slate-800 sm:w-auto">
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDelete(job)} className="h-11 w-full text-red-700 hover:bg-red-50 hover:text-red-800 sm:ml-auto sm:w-auto">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </article>
  );
}

const EditDialog: React.FC<EditDialogProps> = ({
  isOpen,
  onClose,
  job,
  onSubmit,
  isSubmitting,
  availableTopics,
  selectedTopics,
  onTopicsChange,
}) => {
  const [newTopicId, setNewTopicId] = React.useState("");

  const handleAddTopic = () => {
    if (!newTopicId) return;
    const topicToAdd = availableTopics.find((topic) => topic.id.toString() === newTopicId);
    if (topicToAdd && !selectedTopics.find((topic) => topic.id === topicToAdd.id)) {
      onTopicsChange([...selectedTopics, topicToAdd]);
      setNewTopicId("");
    }
  };

  const availableTopicsForSelection = availableTopics.filter(
    (topic) => !selectedTopics.find((selected) => selected.id === topic.id),
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Job #{job?.job_id}</DialogTitle>
            <DialogDescription>Update this maintenance job and save your changes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Description</span>
              <Textarea id="description" name="description" defaultValue={job?.description} rows={3} required />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Priority</span>
              <Select name="priority" defaultValue={job?.priority}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Topics</span>
              {selectedTopics.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedTopics.map((topic) => (
                    <Badge key={topic.id} variant="secondary" className="gap-1 pr-1">
                      {topic.title}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-slate-300"
                        onClick={() => onTopicsChange(selectedTopics.filter((item) => item.id !== topic.id))}
                        aria-label={`Remove ${topic.title}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No topics selected</p>
              )}

              {availableTopicsForSelection.length ? (
                <div className="flex gap-2">
                  <Select value={newTopicId} onValueChange={setNewTopicId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Add topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTopicsForSelection.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id.toString()}>
                          {topic.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={handleAddTopic} disabled={!newTopicId}>
                    Add
                  </Button>
                </div>
              ) : null}
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Remarks</span>
              <Textarea id="remarks" name="remarks" defaultValue={job?.remarks || ""} rows={2} />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700">
                <Checkbox id="is_defective" name="is_defective" defaultChecked={job?.is_defective} />
                Defective
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700">
                <Checkbox id="is_preventivemaintenance" name="is_preventivemaintenance" defaultChecked={job?.is_preventivemaintenance} />
                Preventive
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const DeleteDialog: React.FC<DeleteDialogProps> = ({ isOpen, onClose, onConfirm, isSubmitting }) => (
  <AlertDialog open={isOpen} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this job?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. The maintenance job will be permanently removed.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onClose} disabled={isSubmitting}>
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
          {isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const MyJobs: React.FC<{ activePropertyId?: string }> = ({ activePropertyId }) => {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const { userProfile, selectedPropertyId: selectedProperty } = useUser();
  const { updateJob: storeUpdateJob, deleteJob: storeDeleteJob } = useJobs();

  const [filters, setFilters] = React.useState<FilterState>(defaultFilters);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedJob, setSelectedJob] = React.useState<Job | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [availableTopics, setAvailableTopics] = React.useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = React.useState<Topic[]>([]);

  const { jobs, isLoading, error, refreshJobs, updateJob, removeJob } = useJobsData({
    propertyId: null,
    filters: {
      search: filters.search,
      status: filters.status === "overdue" ? "all" : filters.status,
      room_name: filters.room || null,
      property_id: selectedProperty ?? null,
    },
  });

  const filteredJobs = React.useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const room = filters.room.trim().toLowerCase();

    return jobs.filter((job) => {
      const title = getJobTitle(job).toLowerCase();
      const location = getJobLocation(job).toLowerCase();
      const description = job.description?.toLowerCase() || "";
      const jobId = String(job.job_id).toLowerCase();
      const topics = job.topics?.map((topic) => topic.title).join(" ").toLowerCase() || "";

      const matchesSearch = !search || [title, description, jobId, topics, location].some((value) => value.includes(search));
      const matchesStatus =
        filters.status === "all" ||
        (filters.status === "overdue" ? isOverdue(job) : job.status === filters.status);
      const matchesPriority = filters.priority === "all" || job.priority === filters.priority;
      const matchesRoom = !room || location.includes(room);
      const matchesCreatedDate = matchesDate(job, filters.date);

      return matchesSearch && matchesStatus && matchesPriority && matchesRoom && matchesCreatedDate;
    });
  }, [jobs, filters]);

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredJobs.length);
  const currentJobs = filteredJobs.slice(startIndex, endIndex);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters, activePropertyId, selectedProperty]);

  React.useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [sessionStatus, router]);

  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      refreshJobs();
    }
  }, [filters.search, filters.status, filters.room, selectedProperty, sessionStatus, refreshJobs]);

  React.useEffect(() => {
    const loadTopics = async () => {
      if (!isEditDialogOpen || !session?.user?.accessToken) return;
      try {
        setAvailableTopics(await fetchTopics(session.user.accessToken, selectedProperty));
      } catch (topicError) {
        console.error("Failed to fetch topics:", topicError);
        toast({
          title: "Warning",
          description: "Failed to load available topics.",
          variant: "destructive",
        });
      }
    };

    loadTopics();
  }, [isEditDialogOpen, selectedProperty, session?.user?.accessToken, toast]);

  const handleResetFilters = () => setFilters(defaultFilters);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleEdit = (job: Job) => {
    setSelectedJob(job);
    setSelectedTopics(job.topics || []);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (job: Job) => {
    setSelectedJob(job);
    setIsDeleteDialogOpen(true);
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData(event.currentTarget);
      const updatedJobData: Partial<Job> = {
        description: formData.get("description") as string,
        priority: formData.get("priority") as JobPriority,
        remarks: (formData.get("remarks") as string) || undefined,
        is_defective: formData.get("is_defective") === "on",
        is_preventivemaintenance: formData.get("is_preventivemaintenance") === "on",
        created_at: (formData.get("created_at") as string) || selectedJob.created_at,
        updated_at: (formData.get("updated_at") as string) || selectedJob.updated_at,
        completed_at: (formData.get("completed_at") as string) || selectedJob.completed_at,
        topics: selectedTopics,
      };

      const apiRequestData = {
        ...updatedJobData,
        topic_data: selectedTopics,
        room_id: selectedJob.rooms?.[0]?.room_id,
      };

      storeUpdateJob(selectedJob.id, apiRequestData);
      updateJob({ ...selectedJob, ...apiRequestData });

      toast({ title: "Success", description: "Job updated successfully." });
      setIsEditDialogOpen(false);
      setSelectedJob(null);
    } catch (editError) {
      console.error("Failed to update job:", editError);
      toast({
        title: "Update Failed",
        description: editError instanceof Error ? editError.message : "An unknown error occurred.",
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
      if (!session?.user?.accessToken) throw new Error("Not authenticated");

      await deleteJobApi(String(selectedJob.job_id), session.user.accessToken);
      storeDeleteJob(selectedJob.id);
      removeJob(selectedJob.job_id);

      toast({ title: "Success", description: "Job deleted successfully." });
      setIsDeleteDialogOpen(false);
      setSelectedJob(null);

      if (currentJobs.length === 1 && currentPage > 1) {
        handlePageChange(currentPage - 1);
      }
    } catch (deleteError) {
      console.error("Failed to delete job:", deleteError);
      toast({
        title: "Deletion Failed",
        description: deleteError instanceof Error ? deleteError.message : "An unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJobCreated = async () => {
    const success = await refreshJobs(true);
    if (!success) {
      toast({ title: "Warning", description: "Job created, but the list did not refresh.", variant: "default" });
    }
  };

  if (sessionStatus === "loading" || (isLoading && !error && jobs.length === 0)) {
    return <MyJobsSkeleton />;
  }

  if (sessionStatus === "unauthenticated") return null;

  return (
    <div className="min-h-screen w-full bg-slate-50/60 pb-24">
      <main className="mx-auto w-full max-w-none space-y-5 px-3 py-4 sm:px-6 sm:py-6 lg:max-w-7xl lg:px-8">
        <header className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Jobs</h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">View and manage jobs assigned to you.</p>
            {userProfile ? (
              <p className="mt-1 text-sm font-medium text-slate-700">Signed in as {getDisplayName(userProfile, "User")}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {selectedProperty ? <CreateJobButton propertyId={selectedProperty} onJobCreated={handleJobCreated} /> : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => refreshJobs(true)}
              disabled={isLoading}
              className="h-11 w-full border-slate-300 text-slate-800 sm:w-auto"
            >
              <RefreshCcw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        <JobStatusSummary jobs={jobs} />

        <FilterBar filters={filters} onChange={setFilters} onReset={handleResetFilters} />

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-700" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-red-950">Unable to load jobs</h2>
                <p className="mt-1 text-sm leading-6 text-red-800">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => refreshJobs(true)}
                  className="mt-3 h-11 w-full border-red-300 bg-white text-red-800 hover:bg-red-100 sm:w-auto"
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!error && filteredJobs.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Assigned Jobs</h2>
              <p className="text-sm font-medium text-slate-600">
                Showing {startIndex + 1}-{endIndex} of {filteredJobs.length}
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {currentJobs.map((job) => (
                <JobCard
                  key={job.job_id}
                  job={job}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusUpdated={updateJob}
                />
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <Pagination totalPages={totalPages} currentPage={currentPage} onPageChange={handlePageChange} />
              </div>
            ) : null}
          </section>
        ) : null}

        {!error && filteredJobs.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Briefcase className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              {jobs.length === 0 ? "No jobs assigned to you." : "No jobs match these filters."}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {jobs.length === 0
                ? "When a maintenance job is assigned to you, it will appear here."
                : "Try resetting the filters or searching by a different room, area, status, or priority."}
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              {jobs.length > 0 ? (
                <Button type="button" variant="outline" onClick={handleResetFilters} className="h-11 w-full border-slate-300 sm:w-auto">
                  Reset Filters
                </Button>
              ) : null}
              <Button type="button" onClick={() => refreshJobs(true)} className="h-11 w-full sm:w-auto">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </section>
        ) : null}
      </main>

      <EditDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        job={selectedJob}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
        availableTopics={availableTopics}
        selectedTopics={selectedTopics}
        onTopicsChange={setSelectedTopics}
      />
      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        isSubmitting={isSubmitting}
      />
      <FloatingActionButton label="Create Job" />
    </div>
  );
};

export default MyJobs;
