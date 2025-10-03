// @ts-nocheck
"use client";

import React from 'react';
import { Room, Topic, Property, Job } from '@/app/lib/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/app/components/ui/command';
import { ChevronDown, Filter, X } from 'lucide-react';

type Props = {
  rooms: Room[];
  topics: Topic[];
  properties: Property[];
  jobs?: Job[]; // provided from server to compute counts
};

export default function RoomsByTopicClient({ rooms, topics, properties, jobs }: Props) {
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const getVariant = (active: boolean): 'default' | 'outline' => (active ? 'default' : 'outline');

  // Build counts: topicId -> number of unique rooms that have at least one job with that topic
  const { topicCounts, topicToRoomIds } = React.useMemo(() => {
    const counts = new Map<number, number>();
    const mapping = new Map<number, Set<number>>();
    if (Array.isArray(jobs)) {
      for (const job of jobs) {
        const jobTopics = Array.isArray(job.topics) ? job.topics : [];
        const jobRooms = Array.isArray(job.rooms) ? job.rooms : [];
        if (jobTopics.length === 0 || jobRooms.length === 0) continue;
        // For each topic on the job, add each job room to that topic's room set
        for (const topic of jobTopics) {
          if (!topic || typeof topic.id !== 'number') continue;
          let set = mapping.get(topic.id);
          if (!set) {
            set = new Set<number>();
            mapping.set(topic.id, set);
          }
          for (const room of jobRooms) {
            if (room && typeof room.room_id === 'number') {
              set.add(room.room_id);
            }
          }
        }
      }
    }
    // Convert sets to counts
    for (const [topicId, roomSet] of mapping.entries()) {
      counts.set(topicId, roomSet.size);
    }
    return { topicCounts: counts, topicToRoomIds: mapping };
  }, [jobs]);

  const allCount = React.useMemo(() => Array.isArray(rooms) ? rooms.length : 0, [rooms]);
  const selectedTopic = React.useMemo(() => topics.find(t => t.id === selectedTopicId) || null, [topics, selectedTopicId]);

  // Filter rooms to those that are linked to the selected topic via jobs
  const filteredRooms = React.useMemo(() => {
    if (!selectedTopicId) return rooms;
    const ids = topicToRoomIds.get(selectedTopicId);
    if (!ids || ids.size === 0) return [];
    return rooms.filter(r => typeof r.room_id === 'number' && ids.has(r.room_id));
  }, [rooms, selectedTopicId, topicToRoomIds]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm text-gray-600">Filter rooms by topic</p>
              <h2 className="text-lg font-semibold text-gray-900">Rooms by Topic</h2>
              <p className="text-xs text-gray-500">
                {selectedTopic ? `${selectedTopic.title} • ${topicCounts.get(selectedTopic.id) || 0} rooms` : `${allCount} total rooms`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selectedTopicId !== null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => setSelectedTopicId(null)}
                >
                  <X className="w-4 h-4 mr-2" /> Clear
                </Button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Filter className="w-4 h-4 mr-2" />
                    <span className="hidden xs:inline">{selectedTopic ? selectedTopic.title : 'Select Topic'}</span>
                    <span className="xs:hidden">Topic</span>
                    <ChevronDown className="w-4 h-4 ml-2 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-64" align="end">
                  <Command>
                    <CommandInput placeholder="Search topics..." />
                    <CommandList>
                      <CommandEmpty>No topics found.</CommandEmpty>
                      <CommandGroup heading="Topics">
                        <CommandItem
                          onSelect={() => setSelectedTopicId(null)}
                          className="flex items-center justify-between"
                        >
                          <span>All</span>
                          <span className="text-xs text-gray-500">{allCount}</span>
                        </CommandItem>
                        {topics.map(topic => (
                          <CommandItem
                            key={topic.id}
                            value={topic.title}
                            onSelect={() => setSelectedTopicId(topic.id)}
                            className="flex items-center justify-between"
                          >
                            <span className="truncate">{topic.title}</span>
                            <span className="text-xs text-gray-500 ml-3">{topicCounts.get(topic.id) || 0}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="mt-4 -mx-1 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-2 px-1 min-w-max">
              <Badge
                variant={getVariant(selectedTopicId === null)}
                className="cursor-pointer whitespace-nowrap"
                onClick={() => setSelectedTopicId(null)}
              >
                All <span className="ml-1 text-[10px] opacity-80">{allCount}</span>
              </Badge>
              {topics.map(topic => (
                <Badge
                  key={topic.id}
                  variant={getVariant(selectedTopicId === topic.id)}
                  className="cursor-pointer whitespace-nowrap"
                  onClick={() => setSelectedTopicId(topic.id)}
                >
                  {topic.title} <span className="ml-1 text-[10px] opacity-80">{topicCounts.get(topic.id) || 0}</span>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Simple room list to show results */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRooms.map(room => (
              <div key={room.room_id} className="border rounded-md p-3">
                <div className="font-medium text-gray-900">{room.name}</div>
                <div className="text-xs text-gray-500">{room.room_type}</div>
              </div>
            ))}
            {filteredRooms.length === 0 && (
              <div className="text-sm text-gray-500">No rooms found.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

