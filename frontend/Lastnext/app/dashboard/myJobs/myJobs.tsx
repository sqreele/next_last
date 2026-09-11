"use client";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Home,
  MapPin,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Search,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
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
import { useLocale, useT } from "@/app/lib/i18n/LocaleProvider";
import CreateJobButton from "@/app/components/jobs/CreateJobButton";
import Pagination from "@/app/components/jobs/Pagination";
import UpdateStatusButton from "@/app/components/jobs/UpdateStatusButton";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { PageContainer } from "@/app/components/layout/PageContainer";
import { PageHeader, SectionHeader } from "@/app/components/layout/PageHeader";
import { useSession } from "@/app/lib/session.client";
import { useJobsData } from "@/app/lib/hooks/useJobsData";
import {
  canMutateMyJob,
  getMyJobDetailHref,
  type MyJobsStatusCounts,
} from "@/app/lib/hooks/my-jobs-request.mjs";
import {
  useJobs,
  useMainStore,
  useProperties,
  useUser,
} from "@/app/lib/stores/mainStore";
import { cn } from "@/app/lib/utils/cn";
import { getDisplayName } from "@/app/lib/utils/display-name";
import type { Job, JobPriority, JobStatus } from "@/app/lib/types";

const ITEMS_PER_PAGE = 24;

type DateFilter = "all" | "today" | "week" | "month";

interface FilterState {
  search: string;
  status: JobStatus | "all";
  priority: JobPriority | "all";
  date: DateFilter;
  room: string;
}

interface JobActionProps {
  job: Job;
  activePropertyId: string;
  propertyName: string;
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

function formatDate(value: string | null | undefined, locale: "en" | "th") {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(locale === "th" ? "th-TH-u-ca-gregory" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getJobTitle(job: Job) {
  return job.title || job.topics?.[0]?.title || `Job #${job.job_id}`;
}

function getJobLocation(job: Job) {
  if (job.area_name) return job.area_name;
  if (job.area?.name) return job.area.name;
  if (job.room_name) return job.room_name;
  if (job.rooms?.length)
    return job.rooms
      .map((room) => room.name)
      .filter(Boolean)
      .join(", ");
  return "Room or area not set";
}

function getTechnician(job: Job) {
  if (job.technician_name) return job.technician_name;
  if (job.user_name) return job.user_name;
  if (typeof job.user === "object" && job.user)
    return getDisplayName(job.user, "Assigned technician");
  if (job.user) return String(job.user);
  return "Assigned technician";
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

function MyJobsResultsSkeleton() {
  return (
    <section
      className="space-y-4"
      aria-label="Loading assigned jobs"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-64 rounded-xl" />
        ))}
      </div>
    </section>
  );
}

function JobStatusSummary({
  counts,
  activeStatus,
  onStatusChange,
}: {
  counts: MyJobsStatusCounts;
  activeStatus: FilterState["status"];
  onStatusChange: (status: FilterState["status"]) => void;
}) {
  const t = useT();
  const metrics = [
    {
      label: t("kpi.totalJobs"),
      value: counts.total,
      tone: "text-foreground",
      icon: Briefcase,
      status: "all" as const,
    },
    {
      label: t("myJobs.pendingNew"),
      value: counts.pending,
      tone: "text-blue-600 dark:text-blue-300",
      icon: Briefcase,
      status: "pending" as const,
    },
    {
      label: t("status.inProgress"),
      value: counts.in_progress,
      tone: "text-warning-emphasis",
      icon: Wrench,
      status: "in_progress" as const,
    },
    {
      label: t("myJobs.waiting"),
      value: counts.waiting_sparepart,
      tone: "text-violet-600 dark:text-violet-300",
      icon: Wrench,
      status: "waiting_sparepart" as const,
    },
    {
      label: t("status.completed"),
      value: counts.completed,
      tone: "text-success",
      icon: CheckCircle2,
      status: "completed" as const,
    },
    {
      label: t("status.cancelled"),
      value: counts.cancelled,
      tone: "text-destructive",
      icon: X,
      status: "cancelled" as const,
    },
  ];

  return (
    <section
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      aria-label="Job status summary"
    >
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <button
            type="button"
            key={metric.label}
            onClick={() =>
              onStatusChange(
                activeStatus === metric.status && metric.status !== "all"
                  ? "all"
                  : metric.status,
              )
            }
            aria-pressed={activeStatus === metric.status}
            className={cn(
              "min-h-24 rounded-xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
              activeStatus === metric.status
                ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-500 dark:bg-blue-950/30"
                : "border-border",
              metric.label === "Cancelled" && "col-span-2 md:col-span-1",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{metric.label}</p>
              <Icon className={cn("h-4 w-4", metric.tone)} aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-semibold leading-none sm:text-3xl">
              {metric.value}
            </p>
            {activeStatus === metric.status && (
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                {t("myJobs.selected")}
              </span>
            )}
          </button>
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
  const t = useT();
  const hasFilters =
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.date !== "all" ||
    filters.room.trim() !== "";

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-soft"
      aria-label="Filter jobs"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("myJobs.find")}</h2>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-10 px-2"
          >
            <X className="mr-1 h-4 w-4" />
            {t("myJobs.reset")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr]">
        <label className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <span className="text-sm font-medium text-foreground">{t("action.search")}</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) =>
                onChange({ ...filters, search: event.target.value })
              }
              placeholder={t("myJobs.searchPlaceholder")}
              className="pl-10 text-base sm:text-sm"
            />
          </div>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">{t("editJob.status")}</span>
          <Select
            value={filters.status}
            onValueChange={(value) =>
              onChange({ ...filters, status: value as FilterState["status"] })
            }
          >
            <SelectTrigger className="h-11 border-input bg-background text-base sm:text-sm">
              <SelectValue placeholder={t("pm.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("pm.allStatuses")}</SelectItem>
              <SelectItem value="pending">{t("myJobs.pendingNew")}</SelectItem>
              <SelectItem value="in_progress">{t("status.inProgress")}</SelectItem>
              <SelectItem value="waiting_sparepart">{t("myJobs.waiting")}</SelectItem>
              <SelectItem value="completed">{t("status.completed")}</SelectItem>
              <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">{t("editJob.priority")}</span>
          <Select
            value={filters.priority}
            onValueChange={(value) =>
              onChange({
                ...filters,
                priority: value as FilterState["priority"],
              })
            }
          >
            <SelectTrigger className="h-11 border-input bg-background text-base sm:text-sm">
              <SelectValue placeholder={t("myJobs.allPriorities")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myJobs.allPriorities")}</SelectItem>
              <SelectItem value="high">{t("priority.high")}</SelectItem>
              <SelectItem value="medium">{t("priority.medium")}</SelectItem>
              <SelectItem value="low">{t("priority.low")}</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">{t("pm.date")}</span>
          <Select
            value={filters.date}
            onValueChange={(value) =>
              onChange({ ...filters, date: value as DateFilter })
            }
          >
            <SelectTrigger className="h-11 border-input bg-background text-base sm:text-sm">
              <SelectValue placeholder={t("myJobs.anyDate")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myJobs.anyDate")}</SelectItem>
              <SelectItem value="today">{t("action.today")}</SelectItem>
              <SelectItem value="week">{t("myJobs.last7Days")}</SelectItem>
              <SelectItem value="month">{t("myJobs.last30Days")}</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t("myJobs.roomArea")}
          </span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.room}
              onChange={(event) =>
                onChange({ ...filters, room: event.target.value })
              }
              placeholder={t("myJobs.roomPlaceholder")}
              className="pl-10 text-base sm:text-sm"
            />
          </div>
        </label>

      </div>
    </section>
  );
}

function JobCard({
  job,
  activePropertyId,
  propertyName,
  onEdit,
  onDelete,
  onStatusUpdated,
}: JobActionProps) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const description = job.description || t("myJobs.noDescription");
  const location = getJobLocation(job);
  const technician = getTechnician(job);
  const canOperate = canMutateMyJob(job, activePropertyId);
  const detailHref = getMyJobDetailHref(job.job_id, activePropertyId);

  const openDetail = () => {
    if (detailHref) router.push(detailHref);
  };

  return (
    <article className="group flex w-full flex-col rounded-xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-foreground/25 motion-reduce:transition-none md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{propertyName}</span>
          </p>
          <button
            type="button"
            onClick={openDetail}
            className="mt-2 line-clamp-2 text-left text-base font-semibold leading-6 text-card-foreground underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            {getJobTitle(job)}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">#{job.job_id}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{location}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 shrink-0" />
          <span className="truncate">{technician}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>{t("myJobs.updatedDate", { date: formatDate(job.updated_at, locale) })}</span>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:flex sm:items-center">
        <Button
          type="button"
          onClick={openDetail}
          className="h-11 w-full sm:w-auto"
        >
          {t("myJobs.viewDetail")}
        </Button>
        {canOperate ? (
          <UpdateStatusButton
            job={job}
            activePropertyId={activePropertyId}
            onStatusUpdated={onStatusUpdated}
            variant="outline"
            size="sm"
            className="h-11 w-full sm:w-auto"
            buttonText={t("myJobs.updateStatus")}
          />
        ) : null}
        {canOperate ? (
          <details className="relative col-span-2 sm:ml-auto">
            <summary className="flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:border-0">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              {t("myJobs.more")}
            </summary>
            <div className="mt-2 grid gap-1 rounded-lg border border-border bg-popover p-1 shadow-card sm:absolute sm:bottom-full sm:right-0 sm:z-20 sm:mb-2 sm:mt-0 sm:w-40">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onEdit(job)}
                className="justify-start"
              >
                <Pencil className="h-4 w-4" />
                {t("action.edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDelete(job)}
                className="justify-start text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t("action.delete")}
              </Button>
            </div>
          </details>
        ) : null}
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
}) => {
  const t = useT();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-hidden rounded-2xl p-0 sm:max-h-[90vh] sm:max-w-[520px]">
        <form
          onSubmit={onSubmit}
          className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col sm:max-h-[90vh]"
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pt-6">
            <DialogTitle className="break-all text-lg sm:text-xl">
              {t("myJobs.editNumber", { id: job?.job_id || "" })}
            </DialogTitle>
            <DialogDescription>
              {t("myJobs.editHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-6">
            <label className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("editJob.description")}
              </span>
              <Textarea
                id="description"
                name="description"
                defaultValue={job?.description}
                rows={3}
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("editJob.priority")}
              </span>
              <Select name="priority" defaultValue={job?.priority}>
                <SelectTrigger>
                  <SelectValue placeholder={t("editJob.priority")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("priority.low")}</SelectItem>
                  <SelectItem value="medium">{t("priority.medium")}</SelectItem>
                  <SelectItem value="high">{t("priority.high")}</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("editJob.remarks")}
              </span>
              <Textarea
                id="remarks"
                name="remarks"
                defaultValue={job?.remarks || ""}
                rows={2}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium text-muted-foreground">
                <Checkbox
                  id="is_defective"
                  name="is_defective"
                  defaultChecked={job?.is_defective}
                />
                {t("myJobs.defective")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium text-muted-foreground">
                <Checkbox
                  id="is_preventivemaintenance"
                  name="is_preventivemaintenance"
                  defaultChecked={job?.is_preventivemaintenance}
                />
                {t("editJob.preventive")}
              </label>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-card px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-11 w-full sm:w-auto"
            >
              {t("action.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-h-11 w-full sm:w-auto"
            >
              {isSubmitting ? (
                <BouncingDotsLoader size="sm" />
              ) : null}
              {t("editJob.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const DeleteDialog: React.FC<DeleteDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}) => {
  const t = useT();
  return (
  <AlertDialog open={isOpen} onOpenChange={onClose}>
    <AlertDialogContent className="w-[calc(100%-1rem)] rounded-2xl sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-left">
          {t("myJobs.deleteTitle")}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-left leading-6">
          {t("myJobs.deleteWarning")}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2">
        <AlertDialogCancel
          onClick={onClose}
          disabled={isSubmitting}
          className="min-h-11 w-full sm:w-auto"
        >
          {t("action.cancel")}
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isSubmitting}
          className="min-h-11 w-full bg-red-600 hover:bg-red-700 sm:w-auto"
        >
          {isSubmitting ? (
            <BouncingDotsLoader size="sm" />
          ) : null}
          {t("action.delete")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  );
};

const MyJobs: React.FC = () => {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const { userProfile, selectedPropertyId: selectedProperty } = useUser();
  const { properties, propertyLoading } = useProperties();
  const { updateJob: storeUpdateJob, deleteJob: storeDeleteJob } = useJobs();

  const [filters, setFilters] = React.useState<FilterState>(defaultFilters);
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [debouncedRoom, setDebouncedRoom] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [queryPropertyId, setQueryPropertyId] = React.useState(selectedProperty);
  const [selectedJob, setSelectedJob] = React.useState<Job | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const activeProperty = React.useMemo(
    () =>
      properties.find(
        (property) => property.property_id === selectedProperty,
      ) || null,
    [properties, selectedProperty],
  );
  const propertyName = activeProperty?.name || selectedProperty || "";

  React.useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      300,
    );
    return () => window.clearTimeout(timeoutId);
  }, [filters.search]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedRoom(filters.room.trim()),
      300,
    );
    return () => window.clearTimeout(timeoutId);
  }, [filters.room]);

  const isPropertyQueryReady = queryPropertyId === selectedProperty;

  const {
    jobs,
    isLoading,
    error,
    refreshJobs,
    updateJob,
    removeJob,
    totalCount,
    totalPages,
    canOperateProperty,
    statusCounts,
  } = useJobsData({
    propertyId: isPropertyQueryReady ? selectedProperty : null,
    page: currentPage,
    pageSize: ITEMS_PER_PAGE,
    filters: {
      search: debouncedSearch,
      status: filters.status,
      priority: filters.priority,
      date: filters.date,
      room_name: debouncedRoom,
    },
  });

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + jobs.length, totalCount);
  const hasFilters =
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.date !== "all" ||
    filters.room.trim() !== "";

  React.useEffect(() => {
    setFilters(defaultFilters);
    setDebouncedSearch("");
    setDebouncedRoom("");
    setCurrentPage(1);
    setSelectedJob(null);
    setIsEditDialogOpen(false);
    setIsDeleteDialogOpen(false);
    setQueryPropertyId(selectedProperty);
  }, [selectedProperty]);

  React.useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [sessionStatus, router]);

  const handleFiltersChange = (nextFilters: FilterState) => {
    setFilters(nextFilters);
    setCurrentPage(1);
  };

  const handleResetFilters = () => handleFiltersChange(defaultFilters);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleEdit = (job: Job) => {
    if (!canMutateMyJob(job, selectedProperty)) return;
    setSelectedJob(job);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (job: Job) => {
    if (!canMutateMyJob(job, selectedProperty)) return;
    setSelectedJob(job);
    setIsDeleteDialogOpen(true);
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedJob ||
      !selectedProperty ||
      !canMutateMyJob(selectedJob, selectedProperty)
    ) return;

    setIsSubmitting(true);
    try {
      if (!session?.user) throw new Error("Not authenticated");
      const mutationPropertyId = selectedProperty;
      const formData = new FormData(event.currentTarget);
      const updatedJobData: Partial<Job> = {
        property_id: selectedProperty,
        description: formData.get("description") as string,
        priority: formData.get("priority") as JobPriority,
        remarks:
          (formData.get("remarks") as string)?.trim() ||
          selectedJob.remarks ||
          undefined,
        is_defective: formData.get("is_defective") === "on",
        is_preventivemaintenance:
          formData.get("is_preventivemaintenance") === "on",
      };
      const mutationResponse = await fetch(`/api/v1/jobs/${encodeURIComponent(String(selectedJob.job_id))}/`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedJobData),
      });
      if (!mutationResponse.ok) throw new Error('Unable to update job');
      const updatedJob = await mutationResponse.json();
      if (
        useMainStore.getState().selectedPropertyId !== mutationPropertyId ||
        String(updatedJob.property_id || "") !== mutationPropertyId
      ) return;

      storeUpdateJob(updatedJob.id, updatedJob);
      updateJob(updatedJob);
      await refreshJobs();

      toast({ title: t("success.title"), description: t("myJobs.updated") });
      setIsEditDialogOpen(false);
      setSelectedJob(null);
    } catch {
      toast({
        title: t("myJobs.updateFailed"),
        description: t("error.generic"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (
      !selectedJob ||
      !selectedProperty ||
      !canMutateMyJob(selectedJob, selectedProperty)
    ) return;

    setIsSubmitting(true);
    try {
      if (!session?.user) throw new Error("Not authenticated");
      const mutationPropertyId = selectedProperty;

      const deleteResponse = await fetch(`/api/v1/jobs/${encodeURIComponent(String(selectedJob.job_id))}/?property_id=${encodeURIComponent(String(mutationPropertyId || ''))}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!deleteResponse.ok) throw new Error('Unable to delete job');
      if (useMainStore.getState().selectedPropertyId !== mutationPropertyId) return;
      storeDeleteJob(selectedJob.id);
      removeJob(selectedJob.job_id);

      toast({ title: t("success.title"), description: t("myJobs.deleted") });
      setIsDeleteDialogOpen(false);
      setSelectedJob(null);

      if (jobs.length === 1 && currentPage > 1) {
        handlePageChange(currentPage - 1);
      } else {
        await refreshJobs();
      }
    } catch {
      toast({
        title: t("myJobs.deleteFailed"),
        description: t("error.generic"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJobCreated = async () => {
    const success = await refreshJobs(true);
    if (!success) {
      toast({
        title: t("myJobs.warning"),
        description: t("myJobs.refreshWarning"),
        variant: "default",
      });
    }
  };

  const handleStatusUpdated = React.useCallback(
    (updatedJob: Job) => {
      const currentPropertyId = useMainStore.getState().selectedPropertyId;
      if (
        !selectedProperty ||
        currentPropertyId !== selectedProperty ||
        String(updatedJob.property_id || "") !== selectedProperty
      ) {
        return;
      }
      updateJob(updatedJob);
      void refreshJobs();
    },
    [refreshJobs, selectedProperty, updateJob],
  );

  if (sessionStatus === "loading" || propertyLoading) {
    return <MyJobsSkeleton />;
  }

  if (sessionStatus === "unauthenticated") return null;

  return (
    <div className="min-h-full w-full bg-background">
      <PageContainer>
        <PageHeader
          title={t("myJobs.title")}
          description={
            selectedProperty
              ? t("myJobs.assignedToYou", { property: propertyName, name: userProfile ? getDisplayName(userProfile, "you") : "you" })
              : t("myJobs.selectPropertyHint")
          }
          eyebrow="Work orders"
          actions={
            <>
              {selectedProperty && canOperateProperty ? (
                <CreateJobButton
                  propertyId={selectedProperty}
                  onJobCreated={handleJobCreated}
                />
              ) : null}
              {selectedProperty ? <Button
                type="button"
                variant="outline"
                onClick={() => refreshJobs(true)}
                disabled={isLoading}
                className="h-11 w-full sm:w-auto"
              >
                <RefreshCcw
                  className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")}
                />
                {t("action.refresh")}
              </Button> : null}
            </>
          }
        />

        {!selectedProperty ? (
          <FeedbackState
            variant="empty"
            title={properties.length ? t("common.selectProperty") : t("common.selectProperty")}
            description={
              properties.length
                ? "Use the Property selector in the dashboard header to choose which operational queue to view."
                : "Your active TenantMembership does not currently grant access to a Property."
            }
          />
        ) : (
          <>
            <JobStatusSummary
              counts={statusCounts}
              activeStatus={filters.status}
              onStatusChange={(status) =>
                handleFiltersChange({ ...filters, status })
              }
            />

            <FilterBar
              filters={filters}
              onChange={handleFiltersChange}
              onReset={handleResetFilters}
            />
          </>
        )}

        {selectedProperty && (isLoading || !isPropertyQueryReady) && !error ? (
          <MyJobsResultsSkeleton />
        ) : null}

        {selectedProperty && isPropertyQueryReady && error ? (
          <FeedbackState
            variant="error"
            title={t("myJobs.loadError")}
            description={error}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => refreshJobs(true)}
                className="h-11"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {t("action.tryAgain")}
              </Button>
            }
          />
        ) : null}

        {selectedProperty &&
        isPropertyQueryReady &&
        !isLoading &&
        !error &&
        jobs.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader
              title={t("myJobs.assigned")}
              action={
                <p className="text-sm font-medium text-muted-foreground">
                  {t("myJobs.showing", { from: startIndex + 1, to: endIndex, total: totalCount })}
                </p>
              }
            />

            <div className="grid gap-3 lg:grid-cols-2">
              {jobs.map((job) => (
                <JobCard
                  key={job.job_id}
                  job={job}
                  activePropertyId={selectedProperty}
                  propertyName={propertyName}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusUpdated={handleStatusUpdated}
                />
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
                <Pagination
                  totalPages={totalPages}
                  currentPage={currentPage}
                  onPageChange={handlePageChange}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {selectedProperty &&
        isPropertyQueryReady &&
        !isLoading &&
        !error &&
        jobs.length === 0 ? (
          <FeedbackState
            variant={hasFilters ? "no-results" : "empty"}
            title={hasFilters ? t("myJobs.noMatches") : t("myJobs.noneAssigned")}
            description={
              hasFilters
                ? t("myJobs.resetHint")
                : t("myJobs.noneHint", { property: propertyName })
            }
            action={
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                {hasFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetFilters}
                    className="h-11 w-full sm:w-auto"
                  >
                    {t("inventory.clearFilters")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => refreshJobs(true)}
                  className="h-11 w-full sm:w-auto"
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {t("action.refresh")}
                </Button>
              </div>
            }
          />
        ) : null}
      </PageContainer>

      <EditDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        job={selectedJob}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
      />
      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default MyJobs;
