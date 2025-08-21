"use client";

import { useState, useMemo } from "react";
import { useProperty } from "@/app/lib/PropertyContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import JobList from "@/app/components/jobs/jobList";
import { Job, Property, TabValue } from "@/app/lib/types";
import {
  Inbox, Clock, PlayCircle, CheckCircle2, XCircle,
  AlertTriangle, Filter, ChevronDown, Wrench, Settings,
  Grid3X3, List
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

interface JobsContentProps {
  jobs: Job[];
  properties: Property[];
  selectedRoom?: string | null;
  onRoomFilter?: (roomId: string | null) => void;
}

// Update the Job type or extend it here if necessary
interface ExtendedJob extends Job {
  is_preventive_maintenance?: boolean; // Added the property with correct naming convention
}

const tabConfig = [
  { value: "all", label: "All Jobs", icon: Inbox, color: "bg-gray-100 text-gray-700" },
  { value: "pending", label: "Pending", icon: Clock, color: "bg-yellow-100 text-yellow-700" },
  { value: "in_progress", label: "In Progress", icon: Settings, color: "bg-blue-100 text-blue-700" },
  { value: "waiting_sparepart", label: "Waiting Sparepart", icon: PlayCircle, color: "bg-orange-100 text-orange-700" },
  { value: "completed", label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "bg-red-100 text-red-700" },
  { value: "defect", label: "Defect", icon: AlertTriangle, color: "bg-red-100 text-red-700" },
  { value: "preventive_maintenance", label: "Maintenance", icon: Wrench, color: "bg-purple-100 text-purple-700" },
] as const;

export default function JobsContent({ jobs, properties, selectedRoom, onRoomFilter }: JobsContentProps) {
  const [currentTab, setCurrentTab] = useState<TabValue>("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { selectedProperty } = useProperty();

  const filteredJobs = useMemo(() => {
    if (!Array.isArray(jobs)) return [];

    // Only apply room filtering here. Property/status/date sorting will be handled in JobList.
    if (!selectedRoom) return jobs;

    return jobs.filter(job => {
      if (!job.rooms || !Array.isArray(job.rooms) || job.rooms.length === 0) {
        return false;
      }

      return job.rooms.some((room: any) => {
        if (typeof room === "string" || typeof room === "number") {
          return String(room) === selectedRoom;
        }
        if (room && typeof room === "object" && "room_id" in room) {
          return String(room.room_id) === selectedRoom;
        }
        if (room && typeof room === "object" && "id" in room) {
          return String(room.id) === selectedRoom;
        }
        return false;
      });
    });
  }, [jobs, selectedRoom]);

  const handleTabChange = (value: string) => {
    setCurrentTab(value as TabValue);
    setIsDropdownOpen(false);
  };

  const currentTabConfig = tabConfig.find(tab => tab.value === currentTab);

  return (
    <div className="w-full">
      {/* Header with View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 border-b border-gray-100">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">Maintenance Jobs</h2>
          <p className="text-sm text-gray-600">
            {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found
          </p>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="h-9 px-3"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-9 px-3"
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs
        defaultValue="all"
        className="w-full"
        value={currentTab}
        onValueChange={handleTabChange}
      >
        <div className="px-6 pt-4">
          {/* Desktop Tabs - Horizontal Scrollable */}
          <div className="hidden md:block overflow-x-auto">
            <TabsList className="inline-flex h-12 items-center justify-center rounded-xl bg-gray-50 p-1 border border-gray-200">
              {tabConfig.map(({ value, label, icon: Icon, color }) => (
                <TabsTrigger 
                  key={value} 
                  value={value} 
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm hover:bg-gray-100 hover:text-gray-900 min-w-fit"
                >
                  <Icon className="w-4 h-4 mr-2 flex-shrink-0" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Mobile Dropdown */}
          <div className="md:hidden">
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 flex items-center justify-between gap-2 text-sm font-medium text-gray-800 border-gray-200 bg-white hover:bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    {currentTabConfig && (
                      <>
                        <currentTabConfig.icon className="w-5 h-5 text-gray-600" />
                        <span className="truncate">{currentTabConfig.label}</span>
                      </>
                    )}
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="start" 
                className="w-full min-w-[calc(100vw-3rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-2 max-h-80 overflow-y-auto"
                sideOffset={4}
              >
                {tabConfig.map(({ value, label, icon: Icon, color }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => handleTabChange(value)}
                    className="flex items-center gap-3 py-3 px-4 text-sm text-gray-800 hover:bg-gray-50 hover:text-gray-900 cursor-pointer rounded-lg transition-colors"
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {tabConfig.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-0">
            <JobList 
              jobs={filteredJobs}
              filter={value as TabValue} 
              properties={properties}
              selectedRoom={selectedRoom}
              onRoomFilter={onRoomFilter}
              viewMode={viewMode}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}