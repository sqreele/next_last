// @ts-nocheck
"use client";

import React from 'react';
import { Job, Property, Topic } from '@/app/lib/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import JobsContent from '@/app/dashboard/JobsContent';

type Props = {
  initialJobs: Job[];
  topics: Topic[];
  properties: Property[];
};

export default function JobsByTopicClient({ initialJobs, topics, properties }: Props) {
  const [selectedTopicId, setSelectedTopicId] = React.useState<number | null>(null);
  const getVariant = (active: boolean): 'default' | 'outline' => (active ? 'default' : 'outline');

  const filtered = React.useMemo(() => {
    if (!selectedTopicId) return initialJobs;
    return initialJobs.filter(job => Array.isArray(job.topics) && job.topics.some(t => t.id === selectedTopicId));
  }, [initialJobs, selectedTopicId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm text-gray-600">Filter jobs by topic</p>
              <h2 className="text-lg font-semibold text-gray-900">Select Topic</h2>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <Badge
                variant={getVariant(selectedTopicId === null)}
                className="cursor-pointer"
                onClick={() => setSelectedTopicId(null)}
              >
                All
              </Badge>
              {topics.map(topic => (
                <div key={topic.id}>
                  <Badge
                    variant={getVariant(selectedTopicId === topic.id)}
                    className="cursor-pointer"
                    onClick={() => setSelectedTopicId(topic.id)}
                  >
                    {topic.title}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <JobsContent jobs={filtered} properties={properties} />
    </div>
  );
}

