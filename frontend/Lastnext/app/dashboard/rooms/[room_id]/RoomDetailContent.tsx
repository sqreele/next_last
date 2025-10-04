"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { CalendarClock, Home, MapPin } from 'lucide-react';
import { Room, Property, Job } from '@/app/lib/types';
import { cn } from '@/app/lib/utils/cn';
import Link from 'next/link';

type RoomDetailContentProps = {
  room: Room;
  properties: Property[];
  jobs: Job[];
};

export default function RoomDetailContent({ room, properties, jobs }: RoomDetailContentProps) {
  // Filter the jobs to only include those related to this room
  const roomJobs = jobs.filter(job => 
    job.rooms?.some(jobRoom => 
      String(jobRoom.room_id) === String(room.room_id)
    )
  );

  const getPropertyName = () => {
    // Helper to resolve a property name by an arbitrary id-like value
    const resolvePropertyName = (maybeId: unknown): string | null => {
      if (maybeId === null || maybeId === undefined) return null;
      const idStr = String(maybeId);
      const match = properties.find(p => String(p.property_id) === idStr || String(p.id) === idStr);
      return match?.name ?? null;
    };

    // Prefer the explicit properties array if present
    if (Array.isArray(room.properties) && room.properties.length > 0) {
      // Try to resolve using the first valid entry; fall through if none resolve
      for (const prop of room.properties) {
        if (prop === null || prop === undefined) continue;
        if (typeof prop === 'string' || typeof prop === 'number') {
          const name = resolvePropertyName(prop);
          if (name) return name;
        } else if (typeof prop === 'object') {
          const obj: any = prop;
          const nameFromPropertyId = resolvePropertyName(obj.property_id);
          if (nameFromPropertyId) return nameFromPropertyId;
          const nameFromId = resolvePropertyName(obj.id);
          if (nameFromId) return nameFromId;
        }
      }
    }

    // Fallback: many room responses include a single property_id field
    if (room.property_id !== undefined && room.property_id !== null && room.property_id !== '') {
      const name = resolvePropertyName(room.property_id);
      if (name) return name;
    }

    return 'N/A';
  };

  // Status color mapping based on JobStatus
  const statusColors: Record<Job['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    waiting_sparepart: 'bg-purple-100 text-purple-800',
  };

  // Priority color mapping based on JobPriority
  const priorityColors: Record<Job['priority'], string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-orange-100 text-orange-800',
    high: 'bg-red-100 text-red-800',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-2xl font-bold">Room {room.name || 'N/A'}</CardTitle>
            <Badge 
              variant={room.is_active ? 'default' : 'secondary'}
              className={room.is_active ? 'bg-green-100 text-green-800 border-green-200' : ''}
            >
              {room.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <CardDescription>
            Room ID: {typeof room.room_id === 'number' ? `#${room.room_id}` : room.room_id} | Type: {room.room_type || 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="w-4 h-4" />
            <span>{`${getPropertyName()} - Room ${room.name || 'N/A'}`}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Home className="w-4 h-4" />
            <span>Property: {getPropertyName()}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <CalendarClock className="w-4 h-4" />
            <span>Created: {new Date(room.created_at).toLocaleString()}</span>
          </div>

          {/* Jobs Section */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xl font-semibold text-gray-800">Jobs in this Room</h2>
              <Badge variant="secondary" className="text-sm">
                {roomJobs.length} {roomJobs.length === 1 ? 'job' : 'jobs'}
              </Badge>
            </div>
            {roomJobs.length > 0 ? (
              <ul className="space-y-2">
                {roomJobs.map((job, index) => (
                  <li key={job.job_id} className="border p-3 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                    <Link href={`/dashboard/jobs/${job.job_id}`} className="block">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                          <p><strong>Job ID:</strong> {job.job_id}</p>
                        </div>
                        <Badge className={cn("px-2 py-1 text-xs", statusColors[job.status])}>
                          {job.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <p className="mt-2"><strong>Description:</strong> {job.description || 'N/A'}</p>
                      <div className="flex justify-between items-center mt-2">
                        <Badge className={cn("px-2 py-1 text-xs", priorityColors[job.priority])}>
                          {job.priority.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-gray-500"><strong>Created:</strong> {new Date(job.created_at).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 p-4 bg-gray-50 rounded-md border border-gray-200">No jobs found for this room.</p>
            )}
          </div>

          <Button variant="outline" onClick={() => window.history.back()} className="mt-4">
            Back to Search
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}