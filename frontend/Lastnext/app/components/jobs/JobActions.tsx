"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileDown, Filter, SortAsc, SortDesc, Building, Calendar, DoorOpen, Settings } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import CreateJobButton from "@/app/components/jobs/CreateJobButton";
import JobPDFConfig from "@/app/components/jobs/JobPDFConfig";
import { useUser } from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
import { JobPDFService } from "@/app/lib/services/JobPDFService";
import { JobPDFConfig as JobPDFConfigType } from "@/app/components/jobs/JobPDFConfig";
import { generatePdfWithRetry, downloadPdf } from "@/app/lib/pdfUtils";
import { generatePdfBlob } from "@/app/lib/pdfRenderer";
import JobsPDFDocument from "@/app/components/document/JobsPDFGenerator";
import { enrichJobsWithPdfImages } from "@/app/lib/utils/pdfImageUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/app/components/ui/dropdown-menu";
import { SortOrder, Job, Property, TabValue, Room } from "@/app/lib/types";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/app/components/ui/calendar";

type DateFilter = "all" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "custom";

interface JobActionsProps {
  onSort?: (order: SortOrder) => void;
  currentSort?: SortOrder;
  onDateFilter?: (filter: DateFilter, startDate?: Date, endDate?: Date) => void;
  currentDateFilter?: DateFilter;
  onRoomFilter?: (roomId: string | null) => void;
  currentRoomFilter?: string | null;
  jobs?: Job[];
  onRefresh?: () => void;
  currentTab?: TabValue;
  properties?: Property[];
}

export default function JobActions({
  onSort,
  currentSort = "Newest first",
  onDateFilter,
  currentDateFilter = "all",
  onRoomFilter,
  currentRoomFilter = null,
  jobs = [],
  onRefresh,
  currentTab = "all",
  properties = [],
}: JobActionsProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSearch, setRoomSearch] = useState<string>("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const { selectedPropertyId: selectedProperty, setSelectedPropertyId: setSelectedProperty } = useUser();
  const { data: session } = useSession();
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
  const [isPDFConfigOpen, setIsPDFConfigOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [isRoomFilterOpen, setIsRoomFilterOpen] = useState(false);

  const getDateFilterLabel = (filter: DateFilter) => {
    switch (filter) {
      case "today": return "Today";
      case "yesterday": return "Yesterday";
      case "thisWeek": return "This Week";
      case "thisMonth": return "This Month";
      case "custom": return "Custom Range";
      default: return "All Time";
    }
  };

  const handleRefresh = () => {
    onRefresh ? onRefresh() : router.refresh();
  };

  const getPropertyName = (propertyId: string | null) => {
    if (!propertyId) return "All Properties";
    const property = properties.find((p) => p.property_id === propertyId);
    return property?.name || `Property ${propertyId}`;
  };

  // Enhanced property filtering that considers user's profile
  const getAvailableProperties = () => {
    // If user has specific properties assigned, filter to those
    if (properties.length > 0) {
      return properties;
    }
    // Fallback to all properties if none are specifically assigned
    return properties;
  };

  // Get current property display info
  const getCurrentPropertyInfo = () => {
    if (!selectedProperty) {
      return { name: "All Properties", id: null, isUserProperty: false };
    }
    
    const property = properties.find((p) => p.property_id === selectedProperty);
    if (property) {
      return { 
        name: property.name, 
        id: selectedProperty, 
        isUserProperty: true 
      };
    }
    
    return { 
      name: `Property ${selectedProperty}`, 
      id: selectedProperty, 
      isUserProperty: false 
    };
  };

  const getRoomName = (roomId: string | null) => {
    if (!roomId) return "All Rooms";
    const room = rooms.find((r) => String(r.room_id) === roomId);
    return room?.name || `Room ${roomId}`;
  };

  // Enhanced room filtering with property context
  const getFilteredRooms = () => {
    // If no rooms are loaded, return empty array
    if (!rooms || rooms.length === 0) {
      return [];
    }
    
    // If no property selected, return all rooms
    if (!selectedProperty) {
      return rooms;
    }
    
    // Filter rooms by selected property - more flexible approach
    const filteredRooms = rooms.filter(room => {
      
      // Check if room belongs to the selected property
      if (room.property_id && String(room.property_id) === String(selectedProperty)) {
        return true;
      }
      
      // Check if room has properties array that includes the selected property
      if (room.properties && Array.isArray(room.properties)) {
        const hasProperty = room.properties.some(prop => String(prop) === String(selectedProperty));
        return hasProperty;
      }
      
      // If room has no property association, include it (fallback for backward compatibility)
      if (!room.property_id && !room.properties) {
        return true;
      }
      
      return false;
    });
    
    // If filtering is too strict and returns no rooms, show all rooms as fallback
    if (filteredRooms.length === 0 && rooms.length > 0) {
      return rooms;
    }
    
    return filteredRooms;
  };

  // Get room display info with property context
  const getRoomDisplayInfo = (room: Room) => {
    const roomName = room.name || `Room ${room.room_id}`;
    const roomType = room.room_type || 'Unknown Type';
    
    return {
      name: roomName,
      type: roomType,
      fullName: `${roomName} (${roomType})`,
      isActive: room.is_active
    };
  };

  // Fetch rooms when property changes or on component mount
  useEffect(() => {
    const fetchRooms = async () => {
      
      setIsLoadingRooms(true);
      try {
        let roomsData: any[] = [];
        let response: Response;
        
        const baseUrl = '/api/rooms';
        
        if (selectedProperty) {
          // Fetch rooms for specific property via Next.js API route
          const propertySpecificUrl = `${baseUrl}?property=${encodeURIComponent(String(selectedProperty))}`;
          response = await fetch(propertySpecificUrl);
          
          if (response.ok) {
            roomsData = await response.json();
          } else {
            // Fallback to general rooms endpoint
            response = await fetch(baseUrl);
            if (response.ok) {
              roomsData = await response.json();
            }
          }
        } else {
          // No property selected - fetch all rooms user has access to
          response = await fetch(baseUrl);
          if (response.ok) {
            roomsData = await response.json();
          }
        }

        if (roomsData && Array.isArray(roomsData)) {
          setRooms(roomsData);
          setRoomSearch("");
        } else {
          console.error('❌ Invalid rooms data format:', roomsData);
          
          // Try to fetch all rooms as a fallback
          try {
            const fallbackResponse = await fetch(baseUrl);
            
            if (fallbackResponse.ok) {
              const fallbackRooms = await fallbackResponse.json();
              if (fallbackRooms && Array.isArray(fallbackRooms) && fallbackRooms.length > 0) {
                setRooms(fallbackRooms);
                setRoomSearch("");
              }
            }
          } catch (fallbackError) {
            console.log('⚠️ Fallback request error:', fallbackError);
            setRooms([]);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching rooms:', error);
        setRooms([]);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    fetchRooms();
  }, [selectedProperty]);

  const handleDateFilterChange = (filter: DateFilter) => {
    if (onDateFilter) {
      if (filter === "custom") {
        setIsCustomDateOpen(true);
        return;
      } else {
        onDateFilter(filter);
      }
    }
  };

  const handleApplyCustomRange = () => {
    if (!onDateFilter) return;
    if (customRange.from && customRange.to) {
      onDateFilter("custom", customRange.from, customRange.to);
      setIsCustomDateOpen(false);
    }
  };

  const handleClearCustomRange = () => {
    setCustomRange({});
    onDateFilter?.("all");
    setIsCustomDateOpen(false);
  };

  const handleCloseCustomRange = () => {
    setIsCustomDateOpen(false);
  };

  const handlePDFConfig = async (config: JobPDFConfigType) => {
    if (!jobs.length) {
      alert("No jobs available to generate a PDF.");
      return;
    }

    try {
      setIsGenerating(true);
      const propertyName = getPropertyName(selectedProperty);

      await JobPDFService.generateAndDownloadPDF({
        jobs,
        filter: currentTab,
        selectedProperty,
        propertyName,
        config,
      });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      
      let errorMessage = 'Failed to generate PDF. ';
      if (error?.message?.includes('Font')) {
        errorMessage += 'Font loading error. ';
      } else if (error?.message?.includes('%PDF')) {
        errorMessage += 'Invalid PDF format. ';
      } else {
        errorMessage += error?.message || 'Unknown error. ';
      }
      errorMessage += ' Please try again later.';
      
      alert(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePDF = async () => {
    console.log('PDF Generation Debug:', {
      jobsCount: jobs.length,
      jobs: jobs.map(j => ({ id: j.job_id, property_id: j.property_id, status: j.status })),
      selectedProperty,
      currentTab,
      properties: properties.map(p => ({ id: p.property_id, name: p.name }))
    });

    if (!jobs.length) {
      alert("No jobs available to generate a PDF.");
      return;
    }

    try {
      setIsGenerating(true);
      const propertyName = getPropertyName(selectedProperty);

      const blob = await generatePdfWithRetry(async () => {
        const jobsWithImages = await enrichJobsWithPdfImages(jobs);
        const pdfDocument = (
          <JobsPDFDocument
            jobs={jobsWithImages}
            filter={currentTab}
            selectedProperty={selectedProperty}
            propertyName={propertyName}
            includeImages={true}
            includeDetails={true}
            applyPropertyFilter={false}
          />
        );
        return await generatePdfBlob(pdfDocument);
      });

      const date = format(new Date(), "yyyy-MM-dd");
      const filename = `jobs-report-${date}.pdf`;
      await downloadPdf(blob, filename);
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      
      let errorMessage = 'Failed to generate PDF. ';
      if (error?.message?.includes('Font')) {
        errorMessage += 'Font loading error. ';
      } else if (error?.message?.includes('%PDF')) {
        errorMessage += 'Invalid PDF format. ';
      } else {
        errorMessage += error?.message || 'Unknown error. ';
      }
      errorMessage += ' Please try again later.';
      
      alert(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportCount = jobs.length;

  const menuItemClass = "flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer transition-colors";
  const menuLabelClass = "text-xs font-semibold text-gray-500 px-3 py-1.5 uppercase tracking-wide";
  const dropdownContentClass = "w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg";
  const buttonClass = "flex items-center gap-2 text-sm h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant={selectedProperty ? "default" : "outline"} 
              size="sm" 
              className={`${buttonClass} ${selectedProperty ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : ''}`}
            >
              <Building className="h-4 w-4" />
              <span className="truncate max-w-[120px]">{getCurrentPropertyInfo().name}</span>
              {selectedProperty && <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Active</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            <DropdownMenuLabel className={menuLabelClass}>Properties</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelectedProperty(null)} className={menuItemClass}>
              <Building className="h-4 w-4" />
              All Properties
            </DropdownMenuItem>
            {getAvailableProperties().map((property) => (
              <DropdownMenuItem
                key={property.property_id}
                onClick={() => setSelectedProperty(property.property_id)}
                className={menuItemClass}
              >
                <Building className="h-4 w-4" />
                <span className="truncate">{property.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant={currentDateFilter !== "all" ? "default" : "outline"} 
              size="sm" 
              className={`${buttonClass} ${currentDateFilter !== "all" ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100' : ''}`}
            >
              <Calendar className="h-4 w-4" />
              <span>{getDateFilterLabel(currentDateFilter)}</span>
              {currentDateFilter !== "all" && <span className="ml-1 text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Active</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            <DropdownMenuLabel className={menuLabelClass}>Date Range</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleDateFilterChange("all")} className={menuItemClass}>
              <Calendar className="h-4 w-4 opacity-70" /> All Time
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("today")} className={menuItemClass}>
              <Calendar className="h-4 w-4 opacity-70" /> Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("yesterday")} className={menuItemClass}>
              <Calendar className="h-4 w-4 opacity-70" /> Yesterday
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("thisWeek")} className={menuItemClass}>
              <Calendar className="h-4 w-4 opacity-70" /> This Week
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("thisMonth")} className={menuItemClass}>
              <Calendar className="h-4 w-4 opacity-70" /> This Month
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("custom")} className={menuItemClass}>
              <Calendar className="h-4 w-4 opacity-70" /> Custom Range
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant={currentRoomFilter ? "default" : "outline"} 
              size="sm" 
              className={`${buttonClass} ${currentRoomFilter ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : ''}`}
              disabled={isLoadingRooms}
            >
              <DoorOpen className="h-4 w-4" />
              <span className="truncate max-w-[120px]">
                {isLoadingRooms ? "Loading..." : getRoomName(currentRoomFilter)}
              </span>
              {currentRoomFilter && <span className="ml-1 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">Active</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            <DropdownMenuLabel className={menuLabelClass}>Rooms</DropdownMenuLabel>
            <div className="px-2 pb-1">
              <input
                type="text"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Search room number, name, or type..."
                className="w-full h-8 px-3 text-xs rounded-md bg-gray-50 border border-gray-200 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
            <DropdownMenuItem 
              onClick={() => onRoomFilter?.(null)} 
              className={menuItemClass}
            >
              <DoorOpen className="h-4 w-4" />
              All Rooms
            </DropdownMenuItem>
            {getFilteredRooms()
              .filter((room) => {
                if (!roomSearch) return true;
                const q = roomSearch.toLowerCase();
                const roomInfo = getRoomDisplayInfo(room);
                const byId = String(room.room_id ?? '').toLowerCase().includes(q);
                const byName = roomInfo.name.toLowerCase().includes(q);
                const byType = roomInfo.type.toLowerCase().includes(q);
                return byId || byName || byType;
              })
              .map((room) => {
                const roomInfo = getRoomDisplayInfo(room);
                return (
                  <DropdownMenuItem
                    key={room.room_id}
                    onClick={() => onRoomFilter?.(String(room.room_id))}
                    className={menuItemClass}
                  >
                    <DoorOpen className="h-4 w-4" />
                    <span className="truncate" title={roomInfo.fullName}>
                      {roomInfo.name}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            {getFilteredRooms().length === 0 && selectedProperty && !isLoadingRooms && (
              <DropdownMenuItem disabled className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 cursor-not-allowed">
                <span>
                  {rooms.length === 0 
                    ? "No rooms loaded" 
                    : `No rooms found for property ${selectedProperty}`
                  }
                </span>
              </DropdownMenuItem>
            )}
            
            {/* DEBUG BUTTON - Only show in development */}
            {process.env.NODE_ENV === 'development' && (
              <DropdownMenuItem 
                onClick={async () => {
                  console.log('🔍 DEBUG: Manual rooms API test...');
                  try {
                    const response = await fetch('/api/rooms');
                    console.log('🔍 DEBUG: Manual test response:', response.status, response.statusText);
                    if (response.ok) {
                      const rooms = await response.json();
                      console.log('🔍 DEBUG: Manual test rooms:', rooms);
                    } else {
                      console.log('🔍 DEBUG: Response not OK:', response.status, response.statusText);
                    }
                  } catch (error) {
                    console.log('🔍 DEBUG: Manual test error:', error);
                  }
                }}
                className={menuItemClass}
              >
                🐛 Test Rooms API (Backend)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={buttonClass}>
              <Filter className="h-4 w-4" />
              <span>{currentSort}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            <DropdownMenuLabel className={menuLabelClass}>Sort Order</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onSort?.("Newest first")} className={menuItemClass}>
              <SortDesc className="h-4 w-4" /> Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSort?.("Oldest first")} className={menuItemClass}>
              <SortAsc className="h-4 w-4" /> Oldest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsPDFConfigOpen(true)}
          disabled={exportCount === 0}
          className={buttonClass}
        >
          <Settings className="h-4 w-4" />
          Configure
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleGeneratePDF}
          disabled={isGenerating || exportCount === 0}
          className={buttonClass}
        >
          <FileDown className="h-4 w-4" />
          {isGenerating ? "Generating..." : `Export (${exportCount})`}
        </Button>
        
        <CreateJobButton onJobCreated={handleRefresh} propertyId={selectedProperty ?? ""} />

      </div>

      {/* Mobile Actions */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-9 h-9 p-0 flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={`${dropdownContentClass} max-h-[80vh] overflow-y-auto w-[280px]`} sideOffset={5}>
            <DropdownMenuLabel className={menuLabelClass}>Properties</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelectedProperty(null)} className={menuItemClass}>
              <Building className="h-4 w-4" /> All Properties
            </DropdownMenuItem>
            {getAvailableProperties().map((property) => (
              <DropdownMenuItem
                key={property.property_id}
                onClick={() => setSelectedProperty(property.property_id)}
                className={menuItemClass}
              >
                <Building className="h-4 w-4" />
                <span className="truncate">{property.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>Rooms</DropdownMenuLabel>
            <div className="px-2 pb-1">
              <input
                type="text"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Search room number, name, or type..."
                className="w-full h-8 px-3 text-xs rounded-md bg-gray-50 border border-gray-200 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                disabled={!selectedProperty}
              />
            </div>
            <DropdownMenuItem 
              onClick={() => onRoomFilter?.(null)} 
              className={menuItemClass}
              disabled={!selectedProperty}
            >
              <DoorOpen className="h-4 w-4" /> All Rooms
            </DropdownMenuItem>
            {getFilteredRooms()
              .filter((room) => {
                if (!roomSearch) return true;
                const q = roomSearch.toLowerCase();
                const roomInfo = getRoomDisplayInfo(room);
                const byId = String(room.room_id ?? '').toLowerCase().includes(q);
                const byName = roomInfo.name.toLowerCase().includes(q);
                const byType = roomInfo.type.toLowerCase().includes(q);
                return byId || byName || byType;
              })
              .map((room) => {
                const roomInfo = getRoomDisplayInfo(room);
                return (
                  <DropdownMenuItem
                    key={room.room_id}
                    onClick={() => onRoomFilter?.(String(room.room_id))}
                    className={menuItemClass}
                  >
                    <DoorOpen className="h-4 w-4" />
                    <span className="truncate" title={roomInfo.fullName}>
                      {roomInfo.name}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            {getFilteredRooms().length === 0 && selectedProperty && !isLoadingRooms && (
              <DropdownMenuItem disabled className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 cursor-not-allowed">
                <span>No rooms available for this property</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>Date Range</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleDateFilterChange("all")} className={menuItemClass}>
              <Calendar className="h-4 w-4" /> All Time
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("today")} className={menuItemClass}>
              <Calendar className="h-4 w-4" /> Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("yesterday")} className={menuItemClass}>
              <Calendar className="h-4 w-4" /> Yesterday
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("thisWeek")} className={menuItemClass}>
              <Calendar className="h-4 w-4" /> This Week
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("thisMonth")} className={menuItemClass}>
              <Calendar className="h-4 w-4" /> This Month
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDateFilterChange("custom")} className={menuItemClass}>
              <Calendar className="h-4 w-4" /> Custom Range
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>Sort By</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onSort?.("Newest first")} className={menuItemClass}>
              <SortDesc className="h-4 w-4" /> Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSort?.("Oldest first")} className={menuItemClass}>
              <SortAsc className="h-4 w-4" /> Oldest first
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuItem onClick={handleGeneratePDF} disabled={isGenerating || exportCount === 0} className={menuItemClass}>
              <FileDown className="h-4 w-4" />
              {isGenerating ? "Generating..." : `Export PDF (${exportCount})`}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuItem onClick={handleRefresh} className={menuItemClass}>
              <Plus className="h-4 w-4" /> Create Job
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Custom Date Range Dialog */}
      <Dialog open={isCustomDateOpen} onOpenChange={setIsCustomDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select custom date range</DialogTitle>
          </DialogHeader>
          <div className="p-1">
            <CalendarComponent
              initialFocus
              mode="range"
              numberOfMonths={1}
              selected={customRange}
              onSelect={(range) => {
                const next = range || {};
                setCustomRange(next);
                if (next.from && next.to) {
                  onDateFilter?.("custom", next.from, next.to);
                  setIsCustomDateOpen(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="ghost" onClick={handleClearCustomRange}>Clear</Button>
              <Button variant="outline" onClick={handleCloseCustomRange}>Cancel</Button>
              <Button onClick={handleApplyCustomRange} disabled={!customRange.from || !customRange.to}>Apply</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Configuration Dialog */}
      <JobPDFConfig
        isOpen={isPDFConfigOpen}
        onClose={() => setIsPDFConfigOpen(false)}
        onGenerate={handlePDFConfig}
        jobCount={jobs.length}
        selectedProperty={selectedProperty}
        propertyName={getPropertyName(selectedProperty)}
      />


    </div>
  );
}
