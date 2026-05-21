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

/**
 * Resolve a display name for the property associated with a room.
 * Handles both string property_id and integer PK forms in room.properties.
 */
export const getRoomPropertyName = (
  room: Room,
  properties?: Property[] | null,
  fallback = 'N/A'
): string => {
  const entries: PropertyLike[] = [];
  if (room?.property_id != null) entries.push(room.property_id as PropertyLike);
  if (Array.isArray(room?.properties)) {
    for (const p of room.properties) entries.push(p as PropertyLike);
  }
  if (entries.length === 0) return fallback;

  for (const entry of entries) {
    if (entry && typeof entry === 'object' && 'name' in entry) {
      const name = (entry as { name?: string }).name;
      if (name) return name;
    }
  }

  if (Array.isArray(properties)) {
    for (const entry of entries) {
      if (entry == null) continue;
      const idSet = new Set<string>();
      if (typeof entry === 'string' || typeof entry === 'number') {
        idSet.add(String(entry));
      } else if (typeof entry === 'object') {
        if (entry.property_id != null) idSet.add(String(entry.property_id));
        if (entry.id != null) idSet.add(String(entry.id));
      }
      const match = properties.find(
        (p: any) => idSet.has(String(p?.property_id)) || idSet.has(String(p?.id))
      );
      if (match?.name) return match.name;
    }
  }

  return fallback;
};

/**
 * Resolve a display name for the property associated with a job.
 * Prefers (in order): the globally selected property's name; the first nested
 * property object with a name; any property in `properties` that matches an
 * id referenced by the job.
 */
export const getJobPropertyName = (
  job: Job,
  selectedPropertyId: string | null | undefined,
  properties?: Property[] | null,
  fallback = 'N/A'
): string => {
  const jobPropertyEntries: PropertyLike[] = [
    ...(((job.profile_image as { properties?: PropertyLike[] } | null | undefined)?.properties) || []),
    ...((job.properties as PropertyLike[] | undefined) || []),
    ...((job.rooms?.flatMap((r) => (r?.properties as PropertyLike[] | undefined) || []) || []) as PropertyLike[]),
  ];

  if (selectedPropertyId) {
    const idSet = buildPropertyIdSet(String(selectedPropertyId), properties);
    const matched = jobPropertyEntries.find((p) => matchesPropertyEntry(p, idSet));
    if (matched) {
      if (typeof matched === 'object' && matched && 'name' in matched) {
        const name = (matched as { name?: string }).name;
        if (name) return name;
      }
      const full = (properties || []).find(
        (p: any) => idSet.has(String(p?.property_id)) || idSet.has(String(p?.id))
      );
      if (full?.name) return full.name;
    }
  }

  const firstNamed = jobPropertyEntries.find(
    (p) => typeof p === 'object' && p !== null && 'name' in (p as object)
  );
  if (firstNamed && typeof firstNamed === 'object' && 'name' in firstNamed) {
    const name = (firstNamed as { name?: string }).name;
    if (name) return name;
  }

  if (Array.isArray(properties)) {
    const fromList = properties.find((p: any) => {
      const candidates = buildPropertyIdSet(String(p?.property_id ?? p?.id ?? ''), properties);
      return jobPropertyEntries.some((entry) => matchesPropertyEntry(entry, candidates));
    });
    if (fromList?.name) return fromList.name;
  }

  return fallback;
};
