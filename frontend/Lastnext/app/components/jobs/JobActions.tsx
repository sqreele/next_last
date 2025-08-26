"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileDown, Filter, SortAsc, SortDesc, Building, Calendar, DoorOpen, Settings, Bug, TestTube } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import CreateJobButton from "@/app/components/jobs/CreateJobButton";
import JobPDFConfig from "@/app/components/jobs/JobPDFConfig";
import { useProperty } from "@/app/lib/PropertyContext";
import { useSession } from "next-auth/react";
import { JobPDFService } from "@/app/lib/services/JobPDFService";
import { JobPDFConfig as JobPDFConfigType } from "@/app/components/jobs/JobPDFConfig";
import { generatePdfWithRetry, downloadPdf } from "@/app/lib/pdfUtils";
import { generatePdfBlob } from "@/app/lib/pdfRenderer";
import JobsPDFDocument from "@/app/components/document/JobsPDFGenerator";
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

interface PropertyContextType {
  selectedProperty: string | null;
  setSelectedProperty: (propertyId: string | null) => void;
}

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
  const { selectedProperty, setSelectedProperty } = useProperty() as PropertyContextType;
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
    if (!jobs.length) {
      alert("No jobs available to generate a PDF.");
      return;
    }

    try {
      setIsGenerating(true);
      const propertyName = getPropertyName(selectedProperty);

      const blob = await generatePdfWithRetry(async () => {
        const pdfDocument = (
          <JobsPDFDocument
            jobs={jobs}
            filter={currentTab}
            selectedProperty={selectedProperty}
            propertyName={propertyName}
            includeImages={true}
            includeDetails={true}
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

  const menuItemClass = "flex items-center gap-2 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 hover:text-white cursor-pointer";
  const menuLabelClass = "text-xs font-semibold text-zinc-400 px-3 py-1.5";
  const dropdownContentClass = "w-[200px] bg-zinc-950 border-zinc-800 rounded-lg shadow-lg";
  const buttonClass = "flex items-center gap-2 text-sm h-9";

  return (
    <div className="flex items-center gap-2">
      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={buttonClass}>
              <Building className="h-4 w-4" />
              <span className="truncate max-w-[120px]">{getCurrentPropertyInfo().name}</span>
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
            <Button variant="outline" size="sm" className={buttonClass}>
              <Calendar className="h-4 w-4" />
              <span>{getDateFilterLabel(currentDateFilter)}</span>
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
              variant="outline" 
              size="sm" 
              className={buttonClass}
              disabled={isLoadingRooms}
            >
              <DoorOpen className="h-4 w-4" />
              <span className="truncate max-w-[120px]">
                {isLoadingRooms ? "Loading..." : getRoomName(currentRoomFilter)}
              </span>
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
                className="w-full h-8 px-2 text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none"
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
              <DropdownMenuItem disabled className={menuItemClass}>
                <span className="text-zinc-500">
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
          <DropdownMenuContent align="end" className={`${dropdownContentClass} max-h-[75vh] overflow-y-auto`} sideOffset={5}>
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
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>Rooms</DropdownMenuLabel>
            <div className="px-2 pb-1">
              <input
                type="text"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Search room number, name, or type..."
                className="w-full h-8 px-2 text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none"
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
              <DropdownMenuItem disabled className={menuItemClass}>
                <span className="text-zinc-500">No rooms available for this property</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />

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
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>Sort By</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onSort?.("Newest first")} className={menuItemClass}>
              <SortDesc className="h-4 w-4" /> Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSort?.("Oldest first")} className={menuItemClass}>
              <SortAsc className="h-4 w-4" /> Oldest first
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />

            <DropdownMenuItem onClick={handleGeneratePDF} disabled={isGenerating || exportCount === 0} className={menuItemClass}>
              <FileDown className="h-4 w-4" />
              {isGenerating ? "Generating..." : `Export PDF (${exportCount})`}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />

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
              onSelect={(range) => setCustomRange(range || {})}
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
