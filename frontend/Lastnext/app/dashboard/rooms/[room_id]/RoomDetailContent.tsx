"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { CalendarClock, Home, MapPin, Wrench } from "lucide-react";
import { Room, Property, Job } from "@/app/lib/types";
import Link from "next/link";
import { RoomMaintenanceHistory } from "@/app/components/rooms/RoomMaintenanceHistory";
import { getRoomPropertyName } from "@/app/lib/utils/property-filter";

type RoomDetailContentProps = {
  room: Room;
  properties: Property[];
  jobs: Job[];
};

export default function RoomDetailContent({
  room,
  properties,
  jobs,
}: RoomDetailContentProps) {
  // Filter the jobs to only include those related to this room
  const roomJobs = jobs.filter((job) =>
    job.rooms?.some(
      (jobRoom) => String(jobRoom.room_id) === String(room.room_id),
    ),
  );

  const preventiveMaintenanceJobs = roomJobs.filter(
    (job) => job.is_preventivemaintenance === true,
  );

  const getPropertyName = () => getRoomPropertyName(room, properties, "N/A");

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl desktop:max-w-[96rem]">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="text-2xl font-bold">
              Room {room.name || "N/A"}
            </CardTitle>
            <Badge
              variant="outline"
              className={
                room.is_active
                  ? "pcms-room-status-badge pcms-room-status-badge--active"
                  : "pcms-room-status-badge pcms-room-status-badge--inactive"
              }
            >
              {room.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <CardDescription>
            Room ID:{" "}
            {typeof room.room_id === "number"
              ? `#${room.room_id}`
              : room.room_id}{" "}
            | Type: {room.room_type || "N/A"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{`${getPropertyName()} - Room ${room.name || "N/A"}`}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Home className="w-4 h-4" />
            <span>Property: {getPropertyName()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="w-4 h-4" />
            <span>Created: {new Date(room.created_at).toLocaleString()}</span>
          </div>

          {preventiveMaintenanceJobs.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-blue-600" />
                  Preventive Maintenance
                </h2>
                <Badge variant="secondary" className="text-sm">
                  {preventiveMaintenanceJobs.length}
                </Badge>
              </div>
              <div className="flex flex-col gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-blue-900">
                  {preventiveMaintenanceJobs.length} PM{" "}
                  {preventiveMaintenanceJobs.length === 1 ? "job" : "jobs"} in
                  this room.
                </p>
                <div className="grid gap-2 sm:flex">
                  <Link href="/dashboard/preventive-maintenance">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full sm:w-auto"
                    >
                      Open PM Dashboard
                    </Button>
                  </Link>
                  <Link href="/dashboard/preventive-maintenance/create">
                    <Button size="sm" className="w-full sm:w-auto">
                      Create PM
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Jobs Section — rich maintenance history with stats, timeline, filters */}
          <div className="mt-6">
            <RoomMaintenanceHistory jobs={roomJobs} />
          </div>

          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="mt-4"
          >
            Back to Search
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
