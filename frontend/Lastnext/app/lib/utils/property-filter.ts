import type { Room, Job } from '@/app/lib/types';

type PropertyLike =
  | string
  | number
  | null
  | undefined
  | { property_id?: string | number; id?: string | number };

const matchesPropertyEntry = (entry: PropertyLike, propertyId: string): boolean => {
  if (entry == null) return false;
  if (typeof entry === 'string' || typeof entry === 'number') {
    return String(entry) === propertyId;
  }
  if (typeof entry === 'object') {
    if (entry.property_id != null && String(entry.property_id) === propertyId) return true;
    if (entry.id != null && String(entry.id) === propertyId) return true;
  }
  return false;
};

export const roomBelongsToProperty = (room: Room, propertyId: string): boolean => {
  if (room.property_id != null && String(room.property_id) === propertyId) return true;
  if (Array.isArray(room.properties)) {
    return room.properties.some((p) => matchesPropertyEntry(p as PropertyLike, propertyId));
  }
  return false;
};

export const jobBelongsToProperty = (job: Job, propertyId: string): boolean => {
  if (job.property_id != null && String(job.property_id) === propertyId) return true;

  if (Array.isArray(job.properties)) {
    if (job.properties.some((p) => matchesPropertyEntry(p as PropertyLike, propertyId))) return true;
  }

  const profileProps = (job.profile_image as { properties?: PropertyLike[] } | null | undefined)?.properties;
  if (Array.isArray(profileProps)) {
    if (profileProps.some((p) => matchesPropertyEntry(p, propertyId))) return true;
  }

  if (Array.isArray(job.rooms)) {
    return job.rooms.some((r) => r && typeof r === 'object' && roomBelongsToProperty(r as Room, propertyId));
  }

  return false;
};

export const filterRoomsByProperty = (rooms: Room[], propertyId: string | null | undefined): Room[] => {
  if (!propertyId) return rooms;
  return (rooms || []).filter((room) => roomBelongsToProperty(room, String(propertyId)));
};

export const filterJobsByProperty = (jobs: Job[] | undefined, propertyId: string | null | undefined): Job[] => {
  if (!Array.isArray(jobs)) return [];
  if (!propertyId) return jobs;
  return jobs.filter((job) => jobBelongsToProperty(job, String(propertyId)));
};
