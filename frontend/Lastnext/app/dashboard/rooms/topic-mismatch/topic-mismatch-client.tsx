// @ts-nocheck
"use client";

import React from 'react';
import Link from 'next/link';
import { Room, Topic, Job } from '@/app/lib/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { downloadCSV } from '@/app/lib/utils/csv-export';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/app/components/ui/command';
import { ChevronDown, Filter, X, AlertTriangle, Download } from 'lucide-react';

type Props = {
  rooms: Room[];
  topics: Topic[];
  jobs?: Job[];
};

/** API may return room_id as string; Sets use numeric keys for consistent matching. */
function normalizeRoomId(id: unknown): number | null {
  if (id === null || id === undefined) return null;
  if (typeof id === 'number' && !Number.isNaN(id)) return id;
  if (typeof id === 'string') {
    const t = id.trim();
    if (!t) return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export default function TopicMismatchClient({ rooms, topics, jobs }: Props) {
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties } = useProperties();
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const [pmFilter, setPmFilter] = React.useState<'all' | 'pm' | 'non_pm'>('non_pm');
  const [userFilter, setUserFilter] = React.useState<'all' | 'none' | string>('all');
  const [createdFrom, setCreatedFrom] = React.useState('');
  const [createdTo, setCreatedTo] = React.useState('');

  const currentProperty = React.useMemo(() => {
    if (!selectedProperty) return null;
    return userProperties.find((p) => String(p.property_id) === String(selectedProperty)) || null;
  }, [selectedProperty, userProperties]);

  const propertyScopedRooms = React.useMemo(() => {
    if (!selectedProperty) return rooms;
    return (rooms || []).filter((room) => {
      if (room.property_id != null && String(room.property_id) === String(selectedProperty)) return true;
      if (!Array.isArray(room.properties)) return false;
      return room.properties.some((prop) => {
        if (typeof prop === 'string' || typeof prop === 'number') {
          return String(prop) === String(selectedProperty);
        }
        if (typeof prop === 'object' && prop !== null) {
          return (
            String((prop as { property_id?: string | number }).property_id ?? '') === String(selectedProperty) ||
            String((prop as { id?: string | number }).id ?? '') === String(selectedProperty)
          );
        }
        return false;
      });
    });
  }, [rooms, selectedProperty]);

  const propertyScopedJobs = React.useMemo(() => {
    if (!selectedProperty) return jobs || [];
    return (jobs || []).filter((job) => {
      if (job.property_id != null && String(job.property_id) === String(selectedProperty)) return true;

      if (Array.isArray(job.properties)) {
        const matched = job.properties.some((prop) => {
          if (typeof prop === 'string' || typeof prop === 'number') {
            return String(prop) === String(selectedProperty);
          }
          if (typeof prop === 'object' && prop !== null) {
            return (
              String((prop as { property_id?: string | number }).property_id ?? '') === String(selectedProperty) ||
              String((prop as { id?: string | number }).id ?? '') === String(selectedProperty)
            );
          }
          return false;
        });
        if (matched) return true;
      }

      if (job.profile_image?.properties && Array.isArray(job.profile_image.properties)) {
        const matched = job.profile_image.properties.some((prop) => String(prop) === String(selectedProperty));
        if (matched) return true;
      }

      if (Array.isArray(job.rooms)) {
        const matched = job.rooms.some((room) => {
          if (!Array.isArray(room.properties)) return false;
          return room.properties.some((prop) => String(prop) === String(selectedProperty));
        });
        if (matched) return true;
      }

      return false;
    });
  }, [jobs, selectedProperty]);

  const getUserKey = React.useCallback((user: Job['user'] | undefined | null) => {
    if (user === null || user === undefined) return null;
    if (typeof user === 'string') return user.trim() || null;
    if (typeof user === 'number') return Number.isNaN(user) ? null : String(user);
    if (typeof user === 'object') {
      const u = user as { id?: string | number; username?: string };
      if (u.id != null && String(u.id).trim() !== '') return String(u.id).trim();
      if (u.username != null && String(u.username).trim() !== '') return `username:${String(u.username).trim()}`;
    }
    return null;
  }, []);

  const getUserLabel = React.useCallback((user: Job['user'] | undefined | null) => {
    if (user === null || user === undefined) return 'Unassigned';
    if (typeof user === 'string' || typeof user === 'number') {
      const text = String(user);
      return /^\d+$/.test(text) ? `User #${text}` : text;
    }
    if (typeof user === 'object') {
      const u = user as {
        full_name?: string; first_name?: string; last_name?: string;
        username?: string; email?: string; id?: string | number;
      };
      if (u.full_name && String(u.full_name).trim()) return String(u.full_name).trim();
      const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      if (full) return full;
      if (u.username && String(u.username).trim()) return String(u.username).trim().replace(/^(auth0_|google-oauth2_)/, '');
      if (u.email && String(u.email).trim()) return String(u.email).split('@')[0];
      if (u.id != null) return `User #${String(u.id)}`;
    }
    return 'Unknown User';
  }, []);

  const userOptions = React.useMemo(() => {
    const byKey = new Map<string, string>();
    for (const job of propertyScopedJobs || []) {
      const key = getUserKey(job.user);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, getUserLabel(job.user));
    }
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [propertyScopedJobs, getUserKey, getUserLabel]);

  const unassignedCount = React.useMemo(
    () => (propertyScopedJobs || []).filter((job) => getUserKey(job.user) === null).length,
    [propertyScopedJobs, getUserKey]
  );

  const filteredJobs = React.useMemo(() => {
    if (!Array.isArray(propertyScopedJobs)) return [];

    const parseYmd = (value: string) => {
      const parts = value.trim().split('-').map(Number);
      if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
      const [y, m, d] = parts;
      if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
      return new Date(y, m - 1, d);
    };

    return propertyScopedJobs.filter((job) => {
      const isPm = job.is_preventivemaintenance === true;
      if (pmFilter === 'pm' && !isPm) return false;
      if (pmFilter === 'non_pm' && isPm) return false;
      const userKey = getUserKey(job.user);
      if (userFilter === 'none' && userKey !== null) return false;
      if (userFilter !== 'all' && userFilter !== 'none' && userKey !== userFilter) return false;

      const createdMs = new Date(job.created_at).getTime();
      if (createdFrom.trim()) {
        const fromDay = parseYmd(createdFrom);
        if (fromDay) {
          fromDay.setHours(0, 0, 0, 0);
          if (createdMs < fromDay.getTime()) return false;
        }
      }
      if (createdTo.trim()) {
        const toDay = parseYmd(createdTo);
        if (toDay) {
          toDay.setHours(23, 59, 59, 999);
          if (createdMs > toDay.getTime()) return false;
        }
      }
      return true;
    });
  }, [propertyScopedJobs, pmFilter, userFilter, createdFrom, createdTo, getUserKey]);

  // topicId -> room IDs where at least one job has this topic
  const topicToRoomIds = React.useMemo(() => {
    const mapping = new Map<number, Set<number>>();
    if (!Array.isArray(filteredJobs)) return mapping;

    for (const job of filteredJobs) {
      const jobTopics = Array.isArray(job.topics) ? job.topics : [];
      const jobRooms = Array.isArray(job.rooms) ? job.rooms : [];
      if (jobTopics.length === 0 || jobRooms.length === 0) continue;

      for (const topic of jobTopics) {
        if (!topic || typeof topic.id !== 'number') continue;
        let set = mapping.get(topic.id);
        if (!set) {
          set = new Set<number>();
          mapping.set(topic.id, set);
        }
        for (const room of jobRooms) {
          const rid = room ? normalizeRoomId(room.room_id) : null;
          if (rid != null) set.add(rid);
        }
      }
    }

    return mapping;
  }, [filteredJobs]);

  const topicJobCountMap = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const job of filteredJobs) {
      const jobTopics = Array.isArray(job.topics) ? job.topics : [];
      for (const topic of jobTopics) {
        if (!topic || typeof topic.id !== 'number') continue;
        map.set(topic.id, (map.get(topic.id) ?? 0) + 1);
      }
    }
    return map;
  }, [filteredJobs]);

  const roomJobCountMap = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const job of filteredJobs) {
      const jobRooms = Array.isArray(job.rooms) ? job.rooms : [];
      for (const room of jobRooms) {
        const rid = room ? normalizeRoomId(room.room_id) : null;
        if (rid != null) {
          map.set(rid, (map.get(rid) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [filteredJobs]);

  const selectedTopic = React.useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || null,
    [topics, selectedTopicId]
  );

  const mismatchRooms = React.useMemo(() => {
    if (!selectedTopicId) return [];
    const matchedRoomIds = topicToRoomIds.get(selectedTopicId) ?? new Set<number>();
    return propertyScopedRooms.filter((r) => {
      const rid = normalizeRoomId(r.room_id);
      return rid != null && !matchedRoomIds.has(rid);
    });
  }, [propertyScopedRooms, selectedTopicId, topicToRoomIds]);

  const matchedRooms = React.useMemo(() => {
    if (!selectedTopicId) return [];
    const matchedRoomIds = topicToRoomIds.get(selectedTopicId) ?? new Set<number>();
    return propertyScopedRooms.filter((r) => {
      const rid = normalizeRoomId(r.room_id);
      return rid != null && matchedRoomIds.has(rid);
    });
  }, [propertyScopedRooms, selectedTopicId, topicToRoomIds]);

  const roomNameById = React.useMemo(() => {
    const namesById = new Map<number, string>();
    for (const room of propertyScopedRooms) {
      const rid = normalizeRoomId(room.room_id);
      if (rid == null) continue;
      const name = room.name?.trim();
      namesById.set(rid, name || `Room ${rid}`);
    }
    // Fallback from jobs in case room list is incomplete
    for (const job of filteredJobs) {
      const jobRooms = Array.isArray(job.rooms) ? job.rooms : [];
      for (const room of jobRooms) {
        const rid = room ? normalizeRoomId(room.room_id) : null;
        if (rid == null || namesById.has(rid)) continue;
        const name = room.name?.trim();
        namesById.set(rid, name || `Room ${rid}`);
      }
    }
    return namesById;
  }, [propertyScopedRooms, filteredJobs]);

  const matchedRoomNames = React.useMemo(() => {
    return matchedRooms.map((room) => {
      const rid = normalizeRoomId(room.room_id);
      if (rid == null) return room.name?.trim() || 'Unknown room';
      return roomNameById.get(rid) || `Room ${rid}`;
    });
  }, [matchedRooms, roomNameById]);

  const mismatchRoomNames = React.useMemo(() => {
    return mismatchRooms.map((room) => {
      const rid = normalizeRoomId(room.room_id);
      if (rid == null) return room.name?.trim() || 'Unknown room';
      return roomNameById.get(rid) || `Room ${rid}`;
    });
  }, [mismatchRooms, roomNameById]);

  const matchedRoomLabels = React.useMemo(() => {
    const fromRooms = matchedRooms.map((room, idx) => {
      const rid = normalizeRoomId(room.room_id);
      const name = matchedRoomNames[idx] ?? room.name?.trim() ?? (rid != null ? `Room ${rid}` : 'Unknown room');
      const count = rid != null ? (roomJobCountMap.get(rid) ?? 0) : 0;
      return `${name} (${count})`;
    });
    if (fromRooms.length > 0) return fromRooms;
    if (!selectedTopicId) return [];
    const matchedIds = topicToRoomIds.get(selectedTopicId);
    if (!matchedIds || matchedIds.size === 0) return [];
    return Array.from(matchedIds)
      .sort((a, b) => a - b)
      .map((rid) => {
        const name = roomNameById.get(rid) || `Room ${rid}`;
        const count = roomJobCountMap.get(rid) ?? 0;
        return `${name} (${count})`;
      });
  }, [
    matchedRooms,
    matchedRoomNames,
    roomJobCountMap,
    selectedTopicId,
    topicToRoomIds,
    roomNameById,
  ]);

  const mismatchRoomLabels = React.useMemo(() => {
    return mismatchRooms.map((room, idx) => {
      const rid = normalizeRoomId(room.room_id);
      const name =
        mismatchRoomNames[idx] ??
        room.name?.trim() ??
        (rid != null ? `Room ${rid}` : 'Unknown room');
      const count = rid != null ? (roomJobCountMap.get(rid) ?? 0) : 0;
      return `${name} (${count})`;
    });
  }, [mismatchRooms, mismatchRoomNames, roomJobCountMap]);

  const matchCount = React.useMemo(() => {
    if (!selectedTopicId) return 0;
    return topicToRoomIds.get(selectedTopicId)?.size ?? 0;
  }, [selectedTopicId, topicToRoomIds]);

  const totalRooms = Array.isArray(propertyScopedRooms) ? propertyScopedRooms.length : 0;
  const mismatchCount = mismatchRooms.length;
  const selectedTopicJobCount = selectedTopicId ? (topicJobCountMap.get(selectedTopicId) ?? 0) : 0;

  const handleExportCsv = React.useCallback(() => {
    if (!selectedTopic) return;

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const headers = [
      'Topic ID',
      'Topic',
      'PM Filter',
      'User Filter',
      'Created From',
      'Created To',
      'Room ID',
      'Room Name',
      'Room Type',
      'Filtered Jobs In Room',
      'Has Selected Topic Job',
    ];

    const rows = mismatchRooms.map((room, idx) => {
      const rid = normalizeRoomId(room.room_id);
      return [
      selectedTopic.id,
      selectedTopic.title,
      pmFilter,
      userFilter,
      createdFrom || '',
      createdTo || '',
      rid ?? room.room_id ?? '',
      mismatchRoomNames[idx] ?? room.name?.trim() ?? (rid != null ? `Room ${rid}` : ''),
      room.room_type || '',
      rid != null ? (roomJobCountMap.get(rid) ?? 0) : 0,
      'No',
    ];
    });

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');

    const date = new Date().toISOString().split('T')[0];
    const topicSlug = selectedTopic.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const userSlug = userFilter === 'all' ? 'all-users' : userFilter === 'none' ? 'no-user' : `user-${userFilter}`;
    const filename = `room-topic-mismatch-${topicSlug || selectedTopic.id}-${pmFilter}-${userSlug}-${date}.csv`;
    downloadCSV(csvContent, filename);
  }, [selectedTopic, mismatchRooms, mismatchRoomNames, pmFilter, userFilter, createdFrom, createdTo, roomJobCountMap]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm text-gray-600">Find rooms not matched with topic</p>
              <h2 className="text-lg font-semibold text-gray-900">Room-Topic Mismatch</h2>
              <p className="text-xs text-gray-500">
                Property: {currentProperty?.name || selectedProperty || 'All properties'}
              </p>
              <p className="text-xs text-gray-500">
                {selectedTopic
                  ? `${selectedTopic.title} • ${mismatchCount} not matched (${matchCount} matched rooms, ${selectedTopicJobCount} jobs with this topic)`
                  : `Select a topic to show unmatched rooms (${totalRooms} total rooms)`}
              </p>
              <p className="text-xs text-gray-500">
                Filtered jobs: {filteredJobs.length.toLocaleString()} ({pmFilter === 'non_pm' ? 'Non-PM' : pmFilter === 'pm' ? 'PM' : 'PM + Non-PM'})
              </p>
              {selectedTopic && matchedRooms.length > 0 ? (
                <p className="text-xs text-gray-600">
                  Matched rooms: {matchedRoomLabels.join(', ')}
                </p>
              ) : null}
              {selectedTopic && mismatchCount > 0 ? (
                <p className="text-xs text-amber-900">
                  Rooms not matching <strong>{selectedTopic.title}</strong>: {mismatchRoomLabels.join(', ')}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={!selectedTopic}
                className="h-9"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV ({mismatchCount})
              </Button>
              {selectedTopicId !== null && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex"
                    onClick={() => setSelectedTopicId(null)}
                  >
                    <X className="w-4 h-4 mr-2" /> Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden h-9 w-9"
                    onClick={() => setSelectedTopicId(null)}
                    aria-label="Clear topic filter"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 pr-2 pl-2">
                    <Filter className="w-4 h-4 mr-2" />
                    <span className="hidden xs:inline">{selectedTopic ? selectedTopic.title : 'Select Topic'}</span>
                    <span className="xs:hidden">Topic</span>
                    <ChevronDown className="w-4 h-4 ml-2 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-72" align="end">
                  <Command>
                    <CommandInput placeholder="Search topics..." />
                    <CommandList>
                      <CommandEmpty>No topics found.</CommandEmpty>
                      <CommandGroup heading="Topics">
                        {topics.map((topic) => (
                          <CommandItem
                            key={topic.id}
                            value={topic.title}
                            onSelect={() => setSelectedTopicId(topic.id)}
                            className="flex items-center justify-between"
                          >
                            <span className="truncate">{topic.title}</span>
                            <span className="text-xs text-gray-500 ml-3">
                              {(totalRooms - (topicToRoomIds.get(topic.id)?.size ?? 0)).toLocaleString()}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <label htmlFor="topic-mismatch-topic" className="text-xs font-medium text-gray-700">Topic List</label>
              <select
                id="topic-mismatch-topic"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={selectedTopicId == null ? 'none' : String(selectedTopicId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedTopicId(v === 'none' ? null : Number(v));
                }}
              >
                <option value="none">Select topic...</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={String(topic.id)}>
                    {topic.title} ({(totalRooms - (topicToRoomIds.get(topic.id)?.size ?? 0)).toLocaleString()} rooms)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="topic-mismatch-pm" className="text-xs font-medium text-gray-700">PM Filter</label>
              <select
                id="topic-mismatch-pm"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={pmFilter}
                onChange={(e) => setPmFilter(e.target.value as 'all' | 'pm' | 'non_pm')}
              >
                <option value="non_pm">Non-PM only</option>
                <option value="pm">PM only</option>
                <option value="all">PM + Non-PM</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="topic-mismatch-user" className="text-xs font-medium text-gray-700">User</label>
              <select
                id="topic-mismatch-user"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              >
                <option value="all">All users</option>
                {unassignedCount > 0 ? <option value="none">Unassigned ({unassignedCount})</option> : null}
                {userOptions.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="topic-mismatch-from" className="text-xs font-medium text-gray-700">Created from</label>
              <input
                id="topic-mismatch-from"
                type="date"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="topic-mismatch-to" className="text-xs font-medium text-gray-700">Created to</label>
              <input
                id="topic-mismatch-to"
                type="date"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-gray-600"
                onClick={() => {
                  setSelectedTopicId(null);
                  setPmFilter('non_pm');
                  setUserFilter('all');
                  setCreatedFrom('');
                  setCreatedTo('');
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>

          <div className="mt-4 -mx-1 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-2 px-1 min-w-max">
              {topics.map((topic) => {
                const topicMismatch = totalRooms - (topicToRoomIds.get(topic.id)?.size ?? 0);
                const isActive = selectedTopicId === topic.id;
                return (
                  <Badge
                    key={topic.id}
                    variant={isActive ? 'default' : 'outline'}
                    className="cursor-pointer whitespace-nowrap"
                    onClick={() => setSelectedTopicId(topic.id)}
                  >
                    {topic.title} <span className="ml-1 text-[10px] opacity-80">{topicMismatch}</span>
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          {!selectedTopic ? (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Select a topic first to show unmatched rooms.
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Rooms not matching topic: {selectedTopic.title}
                </h3>
                {mismatchCount > 0 ? (
                  <p className="text-xs text-gray-600 mt-1">
                    {mismatchCount} room{mismatchCount === 1 ? '' : 's'} — {mismatchRoomLabels.join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">None — every room in this property has at least one matching job for this topic.</p>
                )}
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mismatchRooms.map((room, idx) => {
                const rid = normalizeRoomId(room.room_id);
                const hrefId = rid ?? room.room_id;
                return (
                <Link
                  key={hrefId}
                  href={`/dashboard/rooms/${hrefId}`}
                  className="border rounded-md p-3 hover:bg-gray-50 transition-colors block focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={`View details for room ${mismatchRoomNames[idx] ?? room.name ?? hrefId}`}
                >
                  <div className="font-medium text-gray-900">
                    {mismatchRoomNames[idx] ?? room.name?.trim() ?? (rid != null ? `Room ${rid}` : 'Unknown room')}
                  </div>
                  <div className="text-xs text-gray-500">{room.room_type || 'Unknown type'}</div>
                  <div className="text-xs text-blue-700 mt-1">
                    Jobs in room (filtered):{' '}
                    {(rid != null ? roomJobCountMap.get(rid) ?? 0 : 0).toLocaleString()}
                  </div>
                </Link>
              );
              })}
              {mismatchRooms.length === 0 && (
                <div className="text-sm text-emerald-700 space-y-1">
                  <p>
                    All rooms already match topic <strong>{selectedTopic.title}</strong>.
                  </p>
                  <p className="text-gray-700">
                    Room names:{' '}
                    {matchedRoomLabels.length > 0
                      ? matchedRoomLabels.join(', ')
                      : selectedTopicId && (topicToRoomIds.get(selectedTopicId)?.size ?? 0) > 0
                        ? Array.from(topicToRoomIds.get(selectedTopicId))
                            .sort((a, b) => a - b)
                            .map(
                              (id) =>
                                `${roomNameById.get(id) || `Room ${id}`} (${roomJobCountMap.get(id) ?? 0})`
                            )
                            .join(', ')
                        : 'No room names available'}
                  </p>
                </div>
              )}
            </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
