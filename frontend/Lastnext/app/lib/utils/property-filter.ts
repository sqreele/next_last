import type { Room, Job, Property } from '@/app/lib/types';

type PropertyLike =
  | string
  | number
  | null
  | undefined
  | { property_id?: string | number; id?: string | number };

/**
 * Build the set of identifiers that refer to the selected property.
 * The backend uses two different IDs for a property: the human-facing
 * `property_id` string (e.g. "P1A2B3C4") and the database PK `id` (an integer).
 * Different endpoints return different forms (e.g. RoomSerializer returns
 * M2M as PKs, while user/property endpoints return the string property_id),
 * so we accept both when matching.
 */
const buildPropertyIdSet = (
  propertyId: string,
  properties?: Property[] | null
): Set<string> => {
  const set = new Set<string>([propertyId]);
  if (Array.isArray(properties)) {
    const match = properties.find(
      (p: any) =>
        String(p?.property_id ?? '') === propertyId ||
        String(p?.id ?? '') === propertyId
    );
    if (match) {
      if ((match as any).id != null) set.add(String((match as any).id));
      if ((match as any).property_id != null) set.add(String((match as any).property_id));
    }
  }
  return set;
};

const matchesPropertyEntry = (entry: PropertyLike, idSet: Set<string>): boolean => {
  if (entry == null) return false;
  if (typeof entry === 'string' || typeof entry === 'number') {
    return idSet.has(String(entry));
  }
  if (typeof entry === 'object') {
    if (entry.property_id != null && idSet.has(String(entry.property_id))) return true;
    if (entry.id != null && idSet.has(String(entry.id))) return true;
  }
  return false;
};

export const roomBelongsToProperty = (room: Room, idSet: Set<string>): boolean => {
  if (room.property_id != null && idSet.has(String(room.property_id))) return true;
  if (Array.isArray(room.properties)) {
    return room.properties.some((p) => matchesPropertyEntry(p as PropertyLike, idSet));
  }
  return false;
};

export const jobBelongsToProperty = (job: Job, idSet: Set<string>): boolean => {
  if (job.property_id != null && idSet.has(String(job.property_id))) return true;

  if (Array.isArray(job.properties)) {
    if (job.properties.some((p) => matchesPropertyEntry(p as PropertyLike, idSet))) return true;
  }

  const profileProps = (job.profile_image as { properties?: PropertyLike[] } | null | undefined)?.properties;
  if (Array.isArray(profileProps)) {
    if (profileProps.some((p) => matchesPropertyEntry(p, idSet))) return true;
  }

  if (Array.isArray(job.rooms)) {
    return job.rooms.some((r) => r && typeof r === 'object' && roomBelongsToProperty(r as Room, idSet));
  }

  return false;
};

export const filterRoomsByProperty = (
  rooms: Room[],
  propertyId: string | null | undefined,
  properties?: Property[] | null
): Room[] => {
  if (!propertyId) return rooms;
  const idSet = buildPropertyIdSet(String(propertyId), properties);
  return (rooms || []).filter((room) => roomBelongsToProperty(room, idSet));
};

export const filterJobsByProperty = (
  jobs: Job[] | undefined,
  propertyId: string | null | undefined,
  properties?: Property[] | null
): Job[] => {
  if (!Array.isArray(jobs)) return [];
  if (!propertyId) return jobs;
  const idSet = buildPropertyIdSet(String(propertyId), properties);
  return jobs.filter((job) => jobBelongsToProperty(job, idSet));
};
