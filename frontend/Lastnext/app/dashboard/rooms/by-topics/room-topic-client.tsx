"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Room, Topic, Property, Job } from '@/app/lib/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/app/components/ui/command';
import { AlertCircle, ChevronDown, Filter, Home, LogIn, RefreshCw, X } from 'lucide-react';
import { useUser } from '@/app/lib/stores/mainStore';
import { filterRoomsByProperty, filterJobsByProperty } from '@/app/lib/utils/property-filter';

export type RoomsByTopicLoadError = {
  source: string;
  title: string;
  message: string;
  status?: number;
};

type Props = {
  rooms?: Room[] | null;
  topics?: Topic[] | null;
  properties?: Property[] | null;
  jobs?: Job[] | null;
  loadErrors?: RoomsByTopicLoadError[];
  authRequired?: boolean;
};

const toNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

type RoomWithOptionalId = Partial<Room> & { id?: number | string | null };

const getRoomId = (room: RoomWithOptionalId | null | undefined): number | null => (
  toNumericId(room?.room_id ?? room?.id)
);

const getTopicId = (topic: Partial<Topic> | null | undefined): number | null => toNumericId(topic?.id);

export default function RoomsByTopicClient({
  rooms,
  topics,
  properties,
  jobs,
  loadErrors = [],
  authRequired = false,
}: Props) {
  const router = useRouter();
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const { selectedPropertyId } = useUser();

  const safeRooms = React.useMemo(() => (Array.isArray(rooms) ? rooms.filter(Boolean) : []), [rooms]);
  const safeTopics = React.useMemo(() => (Array.isArray(topics) ? topics.filter(Boolean) : []), [topics]);
  const safeProperties = React.useMemo(() => (Array.isArray(properties) ? properties.filter(Boolean) : []), [properties]);
  const safeJobs = React.useMemo(() => (Array.isArray(jobs) ? jobs.filter(Boolean) : []), [jobs]);

  const getVariant = (active: boolean): 'default' | 'outline' => (active ? 'default' : 'outline');

  const handleRetry = React.useCallback(() => {
    setIsRetrying(true);
    router.refresh();
    window.setTimeout(() => setIsRetrying(false), 1200);
  }, [router]);

  const selectedPropertyName = React.useMemo(() => {
    if (!selectedPropertyId) return null;
    const match = safeProperties.find(
      (property) => String(property?.property_id ?? property?.id) === String(selectedPropertyId)
    );
    return match?.name || null;
  }, [safeProperties, selectedPropertyId]);

  // Limit rooms and jobs to the globally selected property (if any)
  const propertyRooms = React.useMemo(
    () => filterRoomsByProperty(safeRooms, selectedPropertyId, safeProperties),
    [safeRooms, selectedPropertyId, safeProperties]
  );

  const propertyJobs = React.useMemo(
    () => filterJobsByProperty(safeJobs, selectedPropertyId, safeProperties),
    [safeJobs, selectedPropertyId, safeProperties]
  );

  // Build counts: topicId -> number of unique rooms that have at least one job with that topic
  const { topicCounts, topicToRoomIds } = React.useMemo(() => {
    const counts = new Map<number, number>();
    const mapping = new Map<number, Set<number>>();

    for (const job of Array.isArray(propertyJobs) ? propertyJobs : []) {
      const jobTopics = Array.isArray(job?.topics) ? job.topics : [];
      const jobRooms = Array.isArray(job?.rooms) ? job.rooms : [];
      if (jobTopics.length === 0 || jobRooms.length === 0) continue;

      for (const topic of jobTopics) {
        const topicId = getTopicId(topic);
        if (topicId === null) continue;

        let set = mapping.get(topicId);
        if (!set) {
          set = new Set<number>();
          mapping.set(topicId, set);
        }

        for (const room of jobRooms) {
          const roomId = getRoomId(room);
          if (roomId !== null) set.add(roomId);
        }
      }
    }

    for (const [topicId, roomSet] of mapping.entries()) {
      counts.set(topicId, roomSet.size);
    }
    return { topicCounts: counts, topicToRoomIds: mapping };
  }, [propertyJobs]);

  const allCount = React.useMemo(() => (Array.isArray(propertyRooms) ? propertyRooms.length : 0), [propertyRooms]);
  const selectedTopic = React.useMemo(
    () => safeTopics.find((topic) => getTopicId(topic) === selectedTopicId) || null,
    [safeTopics, selectedTopicId]
  );

  // Filter rooms to those that are linked to the selected topic via jobs
  const filteredRooms = React.useMemo(() => {
    if (!selectedTopicId) return Array.isArray(propertyRooms) ? propertyRooms : [];
    const ids = topicToRoomIds.get(selectedTopicId);
    if (!ids || ids.size === 0) return [];
    return (Array.isArray(propertyRooms) ? propertyRooms : []).filter((room) => {
      const roomId = getRoomId(room);
      return roomId !== null && ids.has(roomId);
    });
  }, [propertyRooms, selectedTopicId, topicToRoomIds]);

  if (authRequired) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-cyan-700">Rooms by Topic</p>
            <h1 className="text-2xl font-bold text-gray-900">Please sign in to continue</h1>
            <p className="text-sm leading-6 text-gray-600">
              We could not find a valid login session. Sign in again to view room and topic data.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/auth/login"><LogIn className="mr-2 h-4 w-4" /> Sign In</Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/dashboard"><Home className="mr-2 h-4 w-4" /> Go to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasBlockingError = loadErrors.length > 0 && safeRooms.length === 0 && safeTopics.length === 0 && safeJobs.length === 0;
  const primaryError = loadErrors[0];

  return (
    <div className="space-y-4">
      {loadErrors.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{primaryError?.title || 'Could not load all data'}</AlertTitle>
          <AlertDescription>
            <div className="space-y-3">
              <p>{primaryError?.message || 'Please retry loading this page.'}</p>
              {loadErrors.length > 1 && (
                <p className="text-xs text-amber-800">
                  Affected data: {loadErrors.map((error) => error.source).join(', ')}.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full bg-white sm:w-auto"
                onClick={handleRetry}
                isLoading={isRetrying}
                loadingText="Retrying..."
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm text-gray-600">Filter rooms by topic</p>
              <h2 className="text-xl font-semibold text-gray-900">Rooms by Topic</h2>
              <p className="text-xs leading-5 text-gray-500">
                {selectedTopic ? `${selectedTopic.title || 'Untitled topic'} • ${topicCounts.get(selectedTopicId || 0) || 0} rooms` : `${allCount} total rooms`}
                {selectedPropertyId ? ` • Property: ${selectedPropertyName || selectedPropertyId}` : ''}
              </p>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
              {selectedTopicId !== null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() => setSelectedTopicId(null)}
                >
                  <X className="mr-2 h-4 w-4" /> Clear
                </Button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-11 flex-1 justify-center px-3 sm:flex-none">
                    <Filter className="mr-2 h-4 w-4" />
                    <span className="truncate">{selectedTopic ? selectedTopic.title || 'Untitled topic' : 'Select Topic'}</span>
                    <span className="ml-2 text-xs text-gray-500">{selectedTopic ? (topicCounts.get(selectedTopicId || 0) || 0) : allCount}</span>
                    <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search topics..." />
                    <CommandList>
                      <CommandEmpty>No topics found.</CommandEmpty>
                      <CommandGroup heading="Topics">
                        <CommandItem
                          onSelect={() => setSelectedTopicId(null)}
                          className="flex min-h-11 items-center justify-between"
                        >
                          <span>All</span>
                          <span className="text-xs text-gray-500">{allCount}</span>
                        </CommandItem>
                        {safeTopics.map((topic) => {
                          const topicId = getTopicId(topic);
                          if (topicId === null) return null;
                          return (
                            <CommandItem
                              key={topicId}
                              value={topic.title || `Topic ${topicId}`}
                              onSelect={() => setSelectedTopicId(topicId)}
                              className="flex min-h-11 items-center justify-between"
                            >
                              <span className="truncate">{topic.title || 'Untitled topic'}</span>
                              <span className="ml-3 text-xs text-gray-500">{topicCounts.get(topicId) || 0}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="mt-4 -mx-1 overflow-x-auto scrollbar-none">
            <div className="flex min-w-max items-center gap-2 px-1">
              <Badge
                variant={getVariant(selectedTopicId === null)}
                className="cursor-pointer whitespace-nowrap px-3 py-2"
                onClick={() => setSelectedTopicId(null)}
              >
                All <span className="ml-1 text-[10px] opacity-80">{allCount}</span>
              </Badge>
              {safeTopics.map((topic) => {
                const topicId = getTopicId(topic);
                if (topicId === null) return null;
                return (
                  <Badge
                    key={topicId}
                    variant={getVariant(selectedTopicId === topicId)}
                    className="cursor-pointer whitespace-nowrap px-3 py-2"
                    onClick={() => setSelectedTopicId(topicId)}
                  >
                    {topic.title || 'Untitled topic'} <span className="ml-1 text-[10px] opacity-80">{topicCounts.get(topicId) || 0}</span>
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          {hasBlockingError ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
              <h3 className="text-base font-semibold text-gray-900">Rooms could not be loaded</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                The page is working, but the API data is unavailable right now. Please retry.
              </p>
              <Button type="button" className="mt-4 w-full sm:w-auto" onClick={handleRetry} isLoading={isRetrying} loadingText="Retrying...">
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : filteredRooms.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRooms.map((room, index) => {
                const roomId = getRoomId(room);
                const roomName = room?.name || `Room ${roomId ?? index + 1}`;
                const roomType = room?.room_type || 'Room';
                const card = (
                  <div className="block min-h-20 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary">
                    <div className="font-medium text-gray-900">{roomName}</div>
                    <div className="mt-1 text-sm text-gray-500">{roomType}</div>
                  </div>
                );

                return roomId !== null ? (
                  <Link
                    key={roomId}
                    href={`/dashboard/rooms/${roomId}`}
                    aria-label={`View details for room ${roomName}`}
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={`room-${index}`}>{card}</div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
              <h3 className="text-base font-semibold text-gray-900">No rooms found</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {selectedTopic
                  ? 'No rooms have jobs for this topic yet. Try another topic or clear the filter.'
                  : 'There are no rooms available for the selected property yet.'}
              </p>
              {selectedTopicId !== null && (
                <Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => setSelectedTopicId(null)}>
                  Clear topic filter
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
