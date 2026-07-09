"use client";

import React from 'react';
import { Job, Property, Topic } from '@/app/lib/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/app/components/ui/command';
import { ChevronDown, Filter, X } from 'lucide-react';
import JobsContent from '@/app/dashboard/JobsContent';
import { useUser } from '@/app/lib/stores/mainStore';
import { filterJobsByProperty } from '@/app/lib/utils/property-filter';

type Props = {
  initialJobs: Job[];
  topics: Topic[];
  properties: Property[];
};

export default function JobsByTopicClient({ initialJobs, topics, properties }: Props) {
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const { selectedPropertyId } = useUser();
  const getVariant = (active: boolean): 'default' | 'outline' => (active ? 'default' : 'outline');

  const propertyScopedJobs = React.useMemo(
    () => filterJobsByProperty(initialJobs, selectedPropertyId, properties),
    [initialJobs, selectedPropertyId, properties],
  );

  const topicCounts = React.useMemo(() => {
    const counts = new Map<number, number>();
    if (Array.isArray(propertyScopedJobs)) {
      for (const job of propertyScopedJobs) {
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
  }, [propertyScopedJobs]);

  const allCount = React.useMemo(() => Array.isArray(propertyScopedJobs) ? propertyScopedJobs.length : 0, [propertyScopedJobs]);
  const selectedTopic = React.useMemo(() => topics.find(t => t.id === selectedTopicId) || null, [topics, selectedTopicId]);

  const filtered = React.useMemo(() => {
    if (!selectedTopicId) return propertyScopedJobs;
    return propertyScopedJobs.filter(job => Array.isArray(job.topics) && job.topics.some(t => t.id === selectedTopicId));
  }, [propertyScopedJobs, selectedTopicId]);

  const visibleTopics = React.useMemo(
    () => topics.filter((topic) => topicCounts.has(topic.id)),
    [topics, topicCounts],
  );

  React.useEffect(() => {
    if (selectedTopicId === null) return;
    if (!visibleTopics.some((topic) => topic.id === selectedTopicId)) {
      setSelectedTopicId(null);
    }
  }, [selectedTopicId, visibleTopics]);

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
                    <span className="hidden xs:inline">
                      {selectedTopic ? selectedTopic.title : 'Select Topic'}
                    </span>
                    <span className="xs:hidden">Topic</span>
                    <span className="ml-2 text-xs text-gray-500">{selectedTopic ? (topicCounts.get(selectedTopic.id) || 0) : allCount}</span>
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
                        {visibleTopics.map(topic => (
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
              {visibleTopics.map(topic => (
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
