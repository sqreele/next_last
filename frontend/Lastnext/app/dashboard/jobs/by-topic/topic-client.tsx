// @ts-nocheck
"use client";

import React from 'react';
import { Job, Property, Topic } from '@/app/lib/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/app/components/ui/command';
import { ChevronDown, Filter, Search, X } from 'lucide-react';
import JobsContent from '@/app/dashboard/JobsContent';

type Props = {
  initialJobs: Job[];
  topics: Topic[];
  properties: Property[];
};

export default function JobsByTopicClient({ initialJobs, topics, properties }: Props) {
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const getVariant = (active: boolean): 'default' | 'outline' => (active ? 'default' : 'outline');

  const topicCounts = React.useMemo(() => {
    const counts = new Map<number, number>();
    if (Array.isArray(initialJobs)) {
      for (const job of initialJobs) {
        if (Array.isArray(job.topics)) {
          for (const t of job.topics) {
            if (t && typeof t.id === 'number') {
              counts.set(t.id, (counts.get(t.id) || 0) + 1);
            }
          }
        }
      }
    }
    return counts;
  }, [initialJobs]);

  const allCount = React.useMemo(() => Array.isArray(initialJobs) ? initialJobs.length : 0, [initialJobs]);
  const selectedTopic = React.useMemo(() => topics.find(t => t.id === selectedTopicId) || null, [topics, selectedTopicId]);

  const filtered = React.useMemo(() => {
    if (!selectedTopicId) return initialJobs;
    return initialJobs.filter(job => Array.isArray(job.topics) && job.topics.some(t => t.id === selectedTopicId));
  }, [initialJobs, selectedTopicId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm text-gray-600">Filter jobs by topic</p>
              <h2 className="text-lg font-semibold text-gray-900">Jobs by Topic</h2>
              <p className="text-xs text-gray-500">{selectedTopic ? `${selectedTopic.title} • ${topicCounts.get(selectedTopic.id) || 0} jobs` : `${allCount} total jobs`}</p>
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

      <JobsContent jobs={filtered} properties={properties} />
    </div>
  );
}

