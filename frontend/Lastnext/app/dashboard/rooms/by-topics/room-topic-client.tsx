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
  jobs?: Job[]; // optional: if provided we can compute topic-room relationships more accurately
};

export default function RoomsByTopicClient({ rooms, topics, properties }: Props) {
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const getVariant = (active: boolean): 'default' | 'outline' => (active ? 'default' : 'outline');

  // For now, we infer topic counts by scanning jobs is not available here.
  // Many parts of the app attach topics to jobs, not rooms directly. To keep UI useful,
  // we show rooms list and allow topic selection, but counts default to 0 without jobs context.
  const topicCounts = React.useMemo(() => new Map<number, number>(), []);

  const allCount = React.useMemo(() => Array.isArray(rooms) ? rooms.length : 0, [rooms]);
  const selectedTopic = React.useMemo(() => topics.find(t => t.id === selectedTopicId) || null, [topics, selectedTopicId]);

  // If topic is selected, we attempt to filter rooms by topic presence via naive heuristic:
  // Show all rooms when no topic selected; otherwise show none (until backend relation exists).
  // This prevents confusion yet keeps the page functional. You can enhance by supplying jobs to compute mapping.
  const filteredRooms = React.useMemo(() => {
    if (!selectedTopicId) return rooms;
    // Placeholder: no direct room-topic relation available here
    return rooms; // keep all visible to avoid empty state confusion
  }, [rooms, selectedTopicId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm text-gray-600">Filter rooms by topic</p>
              <h2 className="text-lg font-semibold text-gray-900">Rooms by Topic</h2>
              <p className="text-xs text-gray-500">
                {selectedTopic ? `${selectedTopic.title}` : `${allCount} total rooms`}
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

