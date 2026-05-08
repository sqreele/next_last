"use client";

import { useState, useMemo } from "react";
import { useUser } from "@/app/lib/stores/mainStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import JobList from "@/app/components/jobs/jobList";
import { Job, Property, TabValue } from "@/app/lib/types";
import {
  Inbox, Clock, PlayCircle, CheckCircle2, XCircle,
  AlertTriangle, Filter, Wrench, Settings,
  Grid3X3, List, FileText
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FloatingActionButton, MobileTopBar, SearchInput } from "@/app/components/pcms-ui";

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const { selectedPropertyId: selectedProperty } = useUser();

  const filteredJobs = useMemo(() => {
    if (!Array.isArray(jobs)) return [];

    let nextJobs = jobs;

    if (selectedRoom) {
      nextJobs = nextJobs.filter(job => {
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
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return nextJobs;

    return nextJobs.filter((job) => [
      job.job_id,
      job.description,
      job.remarks,
      job.status,
      job.priority,
      job.topics?.[0]?.title,
      job.rooms?.[0]?.name,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [jobs, selectedRoom, searchQuery]);

  const handleTabChange = (value: string) => {
    setCurrentTab(value as TabValue);
  };

  return (
    <div className="w-full space-y-4 p-3 sm:p-4 md:p-6">
      <MobileTopBar title="Maintenance Jobs" />
      <div className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Hotel maintenance workspace</p>
          <h1>Maintenance Jobs</h1>
          <p className="pcms-page-description">
            Search rooms, areas, technicians, job IDs, and live status across the selected property.
          </p>
        </div>
        <div className="pcms-page-actions">
          <Button className="pcms-secondary-button" variant="outline"><Filter className="mr-2 h-4 w-4" />Filters</Button>
          <Button className="pcms-secondary-button" variant="outline"><FileText className="mr-2 h-4 w-4" />PDF Report</Button>
        </div>
      </div>

      <SearchInput
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search maintenance jobs, rooms, areas, status..."
        aria-label="Search maintenance jobs"
      />

      {/* Header with View Toggle */}
      <div className="pcms-section-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-[-0.02em] text-[var(--pcms-text)]">Job history</h2>
          <p className="text-sm font-semibold text-[var(--pcms-text-muted)]">
            {filteredJobs.length} maintenance job{filteredJobs.length !== 1 ? 's' : ''} found
          </p>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="pcms-secondary-button h-11 px-4"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="pcms-secondary-button h-11 px-4"
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
        <div className="pt-1">
          {/* Desktop Tabs - Horizontal Scrollable */}
          <div className="hidden md:block overflow-x-auto">
            <TabsList className="inline-flex h-12 items-center justify-center rounded-full bg-white/70 p-1 border border-[var(--pcms-border)] shadow-[var(--pcms-shadow-sm)]">
              {tabConfig.map(({ value, label, icon: Icon, color }) => (
                <TabsTrigger 
                  key={value} 
                  value={value} 
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--pcms-accent-gradient)] data-[state=active]:text-white data-[state=active]:shadow-[var(--pcms-button-shadow)] hover:bg-white hover:text-[var(--pcms-primary-strong)] min-w-fit"
                >
                  <Icon className="w-4 h-4 mr-2 flex-shrink-0" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Mobile Status Pills */}
          <div className="md:hidden -mx-3 overflow-x-auto px-3 pb-2 scrollbar-none">
            <TabsList className="inline-flex h-auto min-w-max items-center gap-2 bg-transparent p-0">
              {tabConfig.map(({ value, label, icon: Icon, color }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-white/70 px-3.5 py-2 text-xs font-black shadow-[var(--pcms-shadow-sm)] transition-all data-[state=active]:scale-[1.02] data-[state=active]:bg-[var(--pcms-accent-gradient)] data-[state=active]:text-white data-[state=active]:shadow-[var(--pcms-button-shadow)] ${color}`}
                >
                  <Icon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
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
      <FloatingActionButton label="Create Job" />
    </div>
  );
}