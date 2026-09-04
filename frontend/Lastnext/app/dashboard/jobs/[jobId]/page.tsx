import { notFound } from "next/navigation";
import { fetchJob, fetchProperties } from "@/app/lib/data.server";
import { getServerSession } from "@/app/lib/session.server";
import type { Metadata, ResolvingMetadata } from "next";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Calendar,
  User,
  CheckCircle2,
  MessageSquare,
  Printer,
  StickyNote,
  AlertTriangle,
  Building2,
  Hash,
  Tag,
} from "lucide-react";
import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { PageContainer } from "@/app/components/layout/PageContainer";
import { PageHeader } from "@/app/components/layout/PageHeader";
import { Job, JobImage } from "@/app/lib/types";
import Image from "next/image";
import { fixImageUrl } from "@/app/lib/utils/image-utils";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { getRoomPropertyId } from "@/app/lib/utils/property-filter";
import JobCommentsSection from "@/app/components/jobs/JobCommentsSection";
import { BeforeAfterCompare } from "@/app/components/jobs/BeforeAfterCompare";
import { JobAuditTimeline } from "@/app/components/jobs/JobAuditTimeline";
import { ReassignJobButton } from "@/app/components/jobs/ReassignJobButton";
import { JobDetailPropertyBoundary } from "@/app/components/jobs/JobDetailPropertyBoundary";
import Link from "next/link";

const getPropertyKey = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "object") {
    const record = value as {
      property_id?: unknown;
      id?: unknown;
      property?: unknown;
    };
    return getPropertyKey(record.property_id ?? record.id ?? record.property);
  }
  return null;
};

const getJobPropertyIds = (job: Job): Set<string> => {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const key = getPropertyKey(value);
    if (key) ids.add(key);
  };

  add(job.property_id);
  job.properties?.forEach(add);
  job.rooms?.forEach((room) => {
    add(room.property_id);
    add(getRoomPropertyId(room));
  });
  if (job.area?.property_id) add(job.area.property_id);

  return ids;
};

type PropertyAwareJobImage = JobImage & {
  property_id?: string | number | null;
  property?:
    | string
    | number
    | { property_id?: string | number; id?: string | number }
    | null;
  properties?: Array<
    string | number | { property_id?: string | number; id?: string | number }
  >;
};

const getImagePropertyIds = (image: PropertyAwareJobImage): string[] => {
  const ids: string[] = [];
  const add = (value: unknown) => {
    const key = getPropertyKey(value);
    if (key) ids.push(key);
  };

  add(image.property_id);
  add(image.property);
  image.properties?.forEach(add);

  return ids;
};

const getImageUrl = (image: JobImage): string | null =>
  image.jpeg_url || image.image_url || null;

const getPropertyFilteredImageUrls = (job: Job): string[] => {
  const jobPropertyIds = getJobPropertyIds(job);
  const imageRecords = job.images as PropertyAwareJobImage[] | undefined;

  if (!imageRecords?.length || jobPropertyIds.size === 0) {
    return job.image_urls || [];
  }

  const filteredImageUrls = imageRecords
    .filter((image) => {
      const imagePropertyIds = getImagePropertyIds(image);
      return (
        imagePropertyIds.length === 0 ||
        imagePropertyIds.some((id) => jobPropertyIds.has(id))
      );
    })
    .map(getImageUrl)
    .filter((url): url is string => Boolean(url));

  return filteredImageUrls.length > 0
    ? filteredImageUrls
    : job.image_urls || [];
};

const getRequestedPropertyId = (searchParams: {
  [key: string]: string | string[] | undefined;
}): string | undefined => {
  const value = searchParams.property_id;
  return Array.isArray(value) ? value[0] : value;
};

type Props = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  { params, searchParams }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  try {
    const { jobId } = await params;
    const session = await getServerSession();
    const requestedPropertyId = getRequestedPropertyId(await searchParams);
    const job = await fetchJob(jobId, undefined, requestedPropertyId);

    if (!job) {
      return {
        title: "Job Not Found",
      };
    }

    const previousImages = (await parent).openGraph?.images || [];
    return {
      title: `${job.priority} | Job #${job.job_id}`,
      description: job.description || `Details for job ${job.id || job.job_id}`,
      openGraph: {
        images: job.image_urls?.[0]
          ? [job.image_urls[0], ...previousImages]
          : ["/job-default-image.jpg", ...previousImages],
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Error Loading Job",
    };
  }
}

export default async function JobPage({ params, searchParams }: Props) {
  try {
    const { jobId } = await params;
    const session = await getServerSession();
    const requestedPropertyId = getRequestedPropertyId(await searchParams);

    // Fetch job and properties
    const job = await fetchJob(jobId, undefined, requestedPropertyId);
    const properties = await fetchProperties();

    if (!job) {
      notFound();
    }

    const propertyFilteredImageUrls = getPropertyFilteredImageUrls(job);

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const propertyNames = (job.properties || []).map((propId, index) => {
      const propKey =
        typeof propId === "object" && propId
          ? String(propId.property_id || propId.id || index)
          : String(propId);
      const property = properties.find(
        (candidate) => candidate.property_id === propKey,
      );
      return { key: propKey, label: property?.name || `ID: ${propKey}` };
    });
    const primaryProperty = job.property_id
      ? properties.find(
          (property) =>
            String(property.property_id) === String(job.property_id),
        )
      : undefined;
    const displayedProperties =
      propertyNames.length > 0
        ? propertyNames
        : primaryProperty
          ? [
              {
                key: String(primaryProperty.property_id),
                label: primaryProperty.name,
              },
            ]
          : [];
    const assignee = job.user
      ? getDisplayName(
          job.user,
          job.technician_name || job.user_name || "Unknown Technician",
        )
      : null;

    return (
      <JobDetailPropertyBoundary jobPropertyId={job.property_id}>
        <PageContainer className="max-w-5xl">
          <PageHeader
            eyebrow="Maintenance job"
            title={`Job #${job.job_id}`}
            description="Work-order details, activity, photos, and team updates."
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/jobs">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Jobs
                  </Link>
                </Button>
                <ReassignJobButton job={job} className="min-h-11 px-4" />
                <Button variant="outline" asChild>
                  <a href={`/dashboard/jobs/${job.job_id}/print/`}>
                    <Printer className="h-4 w-4" aria-hidden="true" />
                    Print
                  </a>
                </Button>
              </>
            }
          />

          <section
            className="flex flex-wrap items-center gap-2"
            aria-label="Job status and priority"
          >
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
            {job.is_defective ? (
              <Badge
                variant="destructive"
                className="min-h-8 gap-1.5 px-2.5 py-1 text-sm"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Defective
              </Badge>
            ) : null}
          </section>

          {(displayedProperties.length > 0 ||
            (job.rooms && job.rooms.length > 0) ||
            job.area ||
            job.area_name) && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold leading-6 text-card-foreground">
                  Location
                </h2>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                  {displayedProperties.length > 0 && (
                    <div className="min-w-0">
                      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Building2
                          className="h-4 w-4 flex-none"
                          aria-hidden="true"
                        />
                        Property
                      </dt>
                      <dd>
                        <ul className="mt-1.5 space-y-1 text-sm font-medium text-foreground">
                          {displayedProperties.map((property) => (
                            <li
                              key={property.key}
                              className="break-words [overflow-wrap:anywhere]"
                            >
                              {property.label}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}

                  {job.rooms && job.rooms.length > 0 && (
                    <div className="min-w-0">
                      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <MapPin
                          className="h-4 w-4 flex-none"
                          aria-hidden="true"
                        />
                        Rooms
                      </dt>
                      <dd>
                        <ul className="mt-1.5 space-y-1 text-sm font-medium text-foreground">
                          {job.rooms.map((room) => {
                            const roomParts = [];
                            if (room.room_id) {
                              roomParts.push(`Room ID: #${room.room_id}`);
                            }
                            if (room.room_type) {
                              roomParts.push(`Type: ${room.room_type}`);
                            }
                            roomParts.push(room.name || "Unknown Room");
                            return (
                              <li
                                key={room.room_id}
                                className="break-words [overflow-wrap:anywhere]"
                              >
                                {roomParts.join(" · ")}
                              </li>
                            );
                          })}
                        </ul>
                      </dd>
                    </div>
                  )}

                  {(job.area || job.area_name) && (
                    <div className="min-w-0">
                      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <MapPin
                          className="h-4 w-4 flex-none"
                          aria-hidden="true"
                        />
                        Area
                      </dt>
                      <dd className="mt-1.5 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                        {job.area?.name || job.area_name}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-primary/10 text-primary">
                  <Tag className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold leading-6 text-card-foreground [overflow-wrap:anywhere]">
                    {job.topics?.[0]?.title ||
                      job.title ||
                      "Maintenance request"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Job overview
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Hash className="h-4 w-4 flex-none" aria-hidden="true" />
                  Record ID
                </p>
                <p className="mt-1.5 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                  {job.id || job.job_id}
                </p>
              </div>

              {/* Description */}
              {job.description && (
                <section
                  className="min-w-0 md:col-span-2"
                  aria-labelledby="job-description-heading"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare
                      className="h-4 w-4 flex-none text-muted-foreground"
                      aria-hidden="true"
                    />
                    <h3
                      id="job-description-heading"
                      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Description
                    </h3>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere] md:text-base md:leading-7">
                    {job.description}
                  </p>
                </section>
              )}

              {/* Timestamps */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Timestamps
                </p>
                <div className="flex min-w-0 items-start gap-2 text-sm">
                  <Calendar
                    className="mt-0.5 h-4 w-4 flex-none text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-words [overflow-wrap:anywhere]">
                    <span className="font-semibold">Created:</span>{" "}
                    <time dateTime={job.created_at}>
                      {formatDate(job.created_at)}
                    </time>
                  </span>
                </div>
                <div className="flex min-w-0 items-start gap-2 text-sm">
                  <Clock
                    className="mt-0.5 h-4 w-4 flex-none text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-words [overflow-wrap:anywhere]">
                    <span className="font-semibold">Updated:</span>{" "}
                    <time dateTime={job.updated_at}>
                      {formatDate(job.updated_at)}
                    </time>
                  </span>
                </div>
                {job.completed_at && (
                  <div className="flex min-w-0 items-start gap-2 text-sm">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 flex-none text-success"
                      aria-hidden="true"
                    />
                    <span className="break-words [overflow-wrap:anywhere]">
                      <span className="font-semibold">Completed:</span>{" "}
                      <time dateTime={job.completed_at}>
                        {formatDate(job.completed_at)}
                      </time>
                    </span>
                  </div>
                )}
              </div>

              {/* User */}
              {assignee && (
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <User className="h-4 w-4 flex-none" aria-hidden="true" />
                    Assigned to
                  </p>
                  <p className="mt-1.5 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    {assignee}
                  </p>
                </div>
              )}

              {/* Remarks */}
              {job.remarks && (
                <div className="min-w-0 md:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <StickyNote
                      className="h-4 w-4 flex-none"
                      aria-hidden="true"
                    />
                    Remarks
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
                    {job.remarks}
                  </p>
                </div>
              )}

              {job.created_by_name && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reported by
                  </p>
                  <p className="mt-1.5 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    {job.created_by_name}
                  </p>
                </div>
              )}

              {job.updated_by_name && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Updated by
                  </p>
                  <p className="mt-1.5 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    {job.updated_by_name}
                  </p>
                </div>
              )}

              {job.topics && job.topics.length > 0 && (
                <div className="min-w-0 md:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Topics
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.topics.map((topic) => (
                      <Badge
                        key={topic.id || topic.title}
                        variant="outline"
                        className="max-w-full break-words text-sm [overflow-wrap:anywhere]"
                      >
                        {topic.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Before / After comparison — shown above the flat gallery */}
          <BeforeAfterCompare
            images={job.images}
            imageUrls={job.image_urls}
            createdAt={job.created_at}
            completedAt={job.completed_at}
          />

          {/* Images */}
          {propertyFilteredImageUrls.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold leading-6 text-card-foreground">
                  All photos
                </h2>
                <p className="text-sm text-muted-foreground">
                  {propertyFilteredImageUrls.length} photo
                  {propertyFilteredImageUrls.length === 1 ? "" : "s"} attached
                  to this job.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {propertyFilteredImageUrls.map((url, index) => {
                    // Use the fixImageUrl utility to properly handle different URL formats
                    const imageUrl = fixImageUrl(url);

                    // Debug logging for image URLs

                    // Use original URL if fixImageUrl returns null
                    const finalImageUrl = imageUrl || url;

                    if (!finalImageUrl) {
                      return (
                        <div
                          key={index}
                          className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted"
                        >
                          <span className="text-sm text-muted-foreground">
                            No Image
                          </span>
                        </div>
                      );
                    }

                    return (
                      <figure
                        key={index}
                        className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted"
                      >
                        <div className="relative aspect-[4/3] w-full">
                          <Image
                            src={finalImageUrl}
                            alt={`Job image ${index + 1}`}
                            fill
                            loading="lazy"
                            className="object-cover"
                            quality={85}
                            sizes="(max-width: 639px) 100vw, (max-width: 1199px) 50vw, 480px"
                            unoptimized={
                              finalImageUrl.startsWith("http") ||
                              finalImageUrl.includes("/media/") ||
                              finalImageUrl.includes("/api/protected-media/")
                            }
                            placeholder="blur"
                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                          />
                        </div>
                        <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                          Photo {index + 1} of{" "}
                          {propertyFilteredImageUrls.length}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit log — derived event timeline */}
          <JobAuditTimeline jobId={job.job_id} />

          {/* Comments */}
          <JobCommentsSection
            jobId={job.job_id}
            propertyId={job.property_id ? String(job.property_id) : ""}
            canComment={job.can_operate === true}
          />
        </PageContainer>
      </JobDetailPropertyBoundary>
    );
  } catch (error) {
    console.error(
      `Error loading job page for jobId=${await params.then((p) => p.jobId)}:`,
      error,
    );
    throw new Error("Failed to load job page. Please try again later.");
  }
}

export const revalidate = 0;
