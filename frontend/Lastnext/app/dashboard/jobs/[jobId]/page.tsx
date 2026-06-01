import { notFound } from 'next/navigation';
import { fetchJob, fetchProperties } from '@/app/lib/data.server';
import { getServerSession } from '@/app/lib/session.server';
import type { Metadata, ResolvingMetadata } from 'next';
import { MapPin, Clock, Calendar, User, CheckCircle2, MessageSquare, StickyNote, AlertTriangle } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '@/app/components/pcms-ui';
import { Badge } from '@/app/components/ui/badge';
import { Job, Property, JobStatus, JobPriority } from '@/app/lib/types';
import Image from 'next/image';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { JobHeroImage, GalleryImage } from '@/app/components/ui/OptimizedImageEnhanced';
import { getDisplayName } from '@/app/lib/utils/display-name';
import JobCommentsSection from '@/app/components/jobs/JobCommentsSection';
import { BeforeAfterCompare } from '@/app/components/jobs/BeforeAfterCompare';
import { JobAuditTimeline } from '@/app/components/jobs/JobAuditTimeline';
import { ReassignJobButton } from '@/app/components/jobs/ReassignJobButton';

type Props = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  try {
    const { jobId } = await params;
    const session = await getServerSession();
    const accessToken = session?.user?.accessToken;
    const job = await fetchJob(jobId, accessToken);

    if (!job) {
      return {
        title: 'Job Not Found',
      };
    }

    const previousImages = (await parent).openGraph?.images || [];
    return {
      title: `${job.priority} | Job #${job.job_id}`,
      description: job.description || `Details for job ${job.id || job.job_id}`,
      openGraph: {
        images: job.image_urls?.[0] ? [job.image_urls[0], ...previousImages] : ['/job-default-image.jpg', ...previousImages],
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Error Loading Job',
    };
  }
}

export default async function JobPage({ params }: Props) {
  try {
    const { jobId } = await params;
    const session = await getServerSession();
    const accessToken = session?.user?.accessToken;

    // Fetch job and properties
    const job = await fetchJob(jobId, accessToken);
    const properties = await fetchProperties(accessToken);

    if (!job) {
      notFound();
    }

    // Debug logging for job data

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    return (
      <div className="w-full max-w-none space-y-5 px-3 py-4 sm:px-0 sm:py-0 lg:mx-auto lg:max-w-4xl">
        <div className="pcms-page-header">
          <div className="min-w-0">
            <p className="pcms-eyebrow">Maintenance Job</p>
            <h1 className="flex flex-wrap items-center gap-2">
              <span>Job #{job.job_id}</span>
              <PriorityBadge priority={job.priority} />
            </h1>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <ReassignJobButton job={job} />
            <a
              href={`/dashboard/jobs/${job.job_id}/print/`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:w-auto"
            >
              Printable work order
            </a>
          </div>
        </div>
        
        <div className="pcms-section-card space-y-4 p-5 text-[var(--pcms-text)] sm:p-6">
          {/* Basic Info */}
          <div className="flex items-center gap-2">
            <span className="font-semibold">ID:</span>
            <span>{job.id || job.job_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Status:</span>
            <StatusBadge status={job.status} />
          </div>

          {/* Description */}
          {job.description && (
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--pcms-text-muted)] mt-1 flex-shrink-0" />
              <div>
                <span className="font-semibold">Description:</span>
                <p className="mt-1 text-sm leading-relaxed text-[var(--pcms-text-muted)]">{job.description}</p>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--pcms-text-muted)]" />
              <span>
                <span className="font-semibold">Created:</span> {formatDate(job.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--pcms-text-muted)]" />
              <span>
                <span className="font-semibold">Updated:</span> {formatDate(job.updated_at)}
              </span>
            </div>
            {job.completed_at && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>
                  <span className="font-semibold">Completed:</span> {formatDate(job.completed_at)}
                </span>
              </div>
            )}
          </div>

          {/* User */}
          {job.user && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--pcms-text-muted)]" />
              <span>
                <span className="font-semibold">Assigned to:</span>{' '}
                {getDisplayName(job.user, job.technician_name || job.user_name || 'Unknown Technician')}
              </span>
            </div>
          )}

          {/* Rooms */}
          {job.rooms && job.rooms.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--pcms-text-muted)]" />
                <span className="font-semibold">Rooms:</span>
              </div>
              <ul className="ml-6 list-disc text-sm">
                {job.rooms.map(room => (
                  <li key={room.room_id}>
                    {(() => {
                      const roomParts = [];
                      
                      // Add room ID if available
                      if (room.room_id) {
                        roomParts.push(`Room ID: #${room.room_id}`);
                      }
                      
                      // Add room type if available
                      if (room.room_type) {
                        roomParts.push(`Type: ${room.room_type}`);
                      }
                      
                      // Add room name
                      const roomName = room.name || 'Unknown Room';
                      roomParts.push(roomName);
                      
                      return roomParts.join(' | ');
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Area */}
          {(job.area || job.area_name) && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--pcms-text-muted)]" />
              <span className="font-semibold">Area:</span>
              <Badge variant="outline" className="text-sm">
                {job.area?.name || job.area_name}
              </Badge>
            </div>
          )}

          {/* Properties */}
          {job.properties && job.properties.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--pcms-text-muted)]" />
                <span className="font-semibold">Properties:</span>
              </div>
              <ul className="ml-6 list-disc text-sm">
                {job.properties.map((propId, index) => {
                  const propKey = typeof propId === 'object' && propId ? 
                    String(propId.property_id || propId.id || index) : 
                    String(propId);
                  const prop = properties.find(p => p.property_id === propKey);
                  return <li key={propKey}>{prop?.name || `ID: ${propKey}`}</li>;
                })}
              </ul>
            </div>
          )}

          {/* Remarks */}
          {job.remarks && (
            <div className="flex items-start gap-2">
              <StickyNote className="w-4 h-4 text-[var(--pcms-text-muted)] mt-1 flex-shrink-0" />
              <div>
                <span className="font-semibold">Remarks:</span>
                <p className="mt-1 text-sm leading-relaxed text-[var(--pcms-text-muted)]">{job.remarks}</p>
              </div>
            </div>
          )}

          {/* Defective */}
          {job.is_defective && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="font-semibold text-red-600">Defective</span>
            </div>
          )}

          {/* Before / After comparison — shown above the flat gallery */}
          <BeforeAfterCompare
            images={job.images}
            imageUrls={job.image_urls}
            createdAt={job.created_at}
            completedAt={job.completed_at}
          />

          {/* Images */}
          {job.image_urls && job.image_urls.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-black text-[var(--pcms-text)]">All images</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {job.image_urls.map((url, index) => {
                  // Use the fixImageUrl utility to properly handle different URL formats
                  const imageUrl = fixImageUrl(url);
                  
                  // Debug logging for image URLs
                  
                  // Use original URL if fixImageUrl returns null
                  const finalImageUrl = imageUrl || url;
                  
                  if (!finalImageUrl) {
                    return (
                      <div key={index} className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-[1.5rem] bg-[var(--pcms-surface-soft)] shadow-[var(--pcms-shadow-sm)]">
                        <span className="text-[var(--pcms-text-muted)]">No Image</span>
                      </div>
                    );
                  }
                  
                  return (
                    <div key={index} className="relative h-56 w-full overflow-hidden rounded-[1.5rem] shadow-[var(--pcms-shadow-sm)]">
                      <Image
                        src={finalImageUrl}
                        alt={`Job image ${index + 1}`}
                        fill
                        className="object-cover"
                        quality={85}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        unoptimized={finalImageUrl.startsWith('http')}
                        placeholder="blur"
                        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Topics */}
          {job.topics && job.topics.length > 0 && (
            <div className="space-y-1">
              <h2 className="text-lg font-black text-[var(--pcms-text)]">Topics</h2>
              <div className="flex flex-wrap gap-2">
                {job.topics.map(topic => (
                  <Badge key={topic.id || topic.title} variant="outline" className="text-sm">
                    {topic.title}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Audit log — derived event timeline */}
        <JobAuditTimeline jobId={job.job_id} />

        {/* Comments */}
        <JobCommentsSection jobId={job.job_id} />
      </div>
    );
  } catch (error) {
    console.error(`Error loading job page for jobId=${await params.then(p => p.jobId)}:`, error);
    throw new Error('Failed to load job page. Please try again later.');
  }
}

export const revalidate = 0;
