"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileDown,
  Filter,
  SortAsc,
  SortDesc,
  Calendar,
  DoorOpen,
  Settings,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import CreateJobButton from "@/app/components/jobs/CreateJobButton";
import { useUser } from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/app/components/ui/calendar";

type DateFilter =
  "all" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "custom";

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSearch, setRoomSearch] = useState<string>("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const { selectedPropertyId: selectedProperty } = useUser();
  const { data: session } = useSession();
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>(
    {},
  );
  const [isRoomFilterOpen, setIsRoomFilterOpen] = useState(false);

  const getDateFilterLabel = (filter: DateFilter) => {
    switch (filter) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "thisWeek":
        return "This Week";
      case "thisMonth":
        return "This Month";
      case "custom":
        return "Custom Range";
      default:
        return "All Time";
    }
  };

  const handleRefresh = () => {
    onRefresh ? onRefresh() : router.refresh();
  };

  const getRoomName = (roomId: string | null) => {
    if (!roomId) return "All Rooms";
    const room = rooms.find((r) => String(r.room_id) === roomId);
    return room?.name || `Room ${roomId}`;
  };

  const getFilteredRooms = () => {
    if (!rooms || rooms.length === 0) {
      return [];
    }
    return rooms;
  };

  const getRoomDisplayInfo = (room: Room) => {
    const roomName = room.name || `Room ${room.room_id}`;
    const roomType = room.room_type || "Unknown Type";

    return {
      name: roomName,
      type: roomType,
      fullName: `${roomName} (${roomType})`,
      isActive: room.is_active,
    };
  };

  // The board has no property filter button; it follows the selected property from the app header.
  useEffect(() => {
    const fetchRooms = async () => {
      setIsLoadingRooms(true);
      try {
        let roomsData: any[] = [];
        const baseUrl = "/api/rooms";
        const url = selectedProperty
          ? `${baseUrl}?property=${encodeURIComponent(String(selectedProperty))}`
          : baseUrl;
        let response = await fetch(url);
        if (!response.ok && selectedProperty) {
          response = await fetch(baseUrl);
        }
        if (response.ok) {
          roomsData = await response.json();
        }

        if (roomsData && Array.isArray(roomsData)) {
          setRooms(roomsData);
          setRoomSearch("");
        } else {
          console.error("❌ Invalid rooms data format:", roomsData);

          // Try to fetch all rooms as a fallback
          try {
            const fallbackResponse = await fetch(baseUrl);

            if (fallbackResponse.ok) {
              const fallbackRooms = await fallbackResponse.json();
              if (
                fallbackRooms &&
                Array.isArray(fallbackRooms) &&
                fallbackRooms.length > 0
              ) {
                setRooms(fallbackRooms);
                setRoomSearch("");
              }
            }
          } catch (fallbackError) {
            setRooms([]);
          }
        }
      } catch (error) {
        console.error("❌ Error fetching rooms:", error);
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

  const exportCount = jobs.length;

  const menuItemClass =
    "flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors";
  const menuLabelClass =
    "text-xs font-semibold text-muted-foreground px-3 py-1.5 uppercase tracking-wide";
  const dropdownContentClass =
    "w-[220px] bg-card border border-border rounded-lg shadow-card";
  const buttonClass =
    "flex items-center gap-2 text-sm h-9 px-3 py-2 border border-border rounded-md bg-card hover:bg-muted transition-colors shadow-soft";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={currentDateFilter !== "all" ? "default" : "outline"}
              size="sm"
              className={`${buttonClass} ${currentDateFilter !== "all" ? "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100" : ""}`}
            >
              <Calendar className="h-4 w-4" />
              <span>{getDateFilterLabel(currentDateFilter)}</span>
              {currentDateFilter !== "all" && (
                <span className="ml-1 text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            <DropdownMenuLabel className={menuLabelClass}>
              Date Range
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("all")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4 opacity-70" /> All Time
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("today")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4 opacity-70" /> Today
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("yesterday")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4 opacity-70" /> Yesterday
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("thisWeek")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4 opacity-70" /> This Week
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("thisMonth")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4 opacity-70" /> This Month
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("custom")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4 opacity-70" /> Custom Range
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={currentRoomFilter ? "default" : "outline"}
              size="sm"
              className={`${buttonClass} ${currentRoomFilter ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100" : ""}`}
              disabled={isLoadingRooms}
            >
              <DoorOpen className="h-4 w-4" />
              <span className="truncate max-w-[120px]">
                {isLoadingRooms ? "Loading..." : getRoomName(currentRoomFilter)}
              </span>
              {currentRoomFilter && (
                <span className="ml-1 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            <DropdownMenuLabel className={menuLabelClass}>
              Rooms
            </DropdownMenuLabel>
            <div className="px-2 pb-1">
              <input
                type="text"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Search room number, name, or type..."
                className="w-full h-8 px-3 text-xs rounded-md bg-muted border border-border text-muted-foreground placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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
                const byId = String(room.room_id ?? "")
                  .toLowerCase()
                  .includes(q);
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
            {getFilteredRooms().length === 0 && !isLoadingRooms && (
              <DropdownMenuItem
                disabled
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
              >
                <span>No rooms loaded</span>
              </DropdownMenuItem>
            )}

            {/* DEBUG BUTTON - Only show in development */}
            {process.env.NODE_ENV === "development" && (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    const response = await fetch("/api/rooms");
                    if (response.ok) {
                      const rooms = await response.json();
                    } else {
                    }
                  } catch (error) {}
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
            <DropdownMenuLabel className={menuLabelClass}>
              Sort Order
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onSort?.("Newest first")}
              className={menuItemClass}
            >
              <SortDesc className="h-4 w-4" /> Newest first
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSort?.("Oldest first")}
              className={menuItemClass}
            >
              <SortAsc className="h-4 w-4" /> Oldest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <CreateJobButton
          onJobCreated={handleRefresh}
          propertyId={selectedProperty ?? ""}
        />
      </div>

      {/* Mobile Actions */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-9 h-9 p-0 flex items-center justify-center"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={`${dropdownContentClass} max-h-[80vh] overflow-y-auto w-[280px]`}
            sideOffset={5}
          >
            <DropdownMenuLabel className={menuLabelClass}>
              Rooms
            </DropdownMenuLabel>
            <div className="px-2 pb-1">
              <input
                type="text"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Search room number, name, or type..."
                className="w-full h-8 px-3 text-xs rounded-md bg-muted border border-border text-muted-foreground placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>
            <DropdownMenuItem
              onClick={() => onRoomFilter?.(null)}
              className={menuItemClass}
            >
              <DoorOpen className="h-4 w-4" /> All Rooms
            </DropdownMenuItem>
            {getFilteredRooms()
              .filter((room) => {
                if (!roomSearch) return true;
                const q = roomSearch.toLowerCase();
                const roomInfo = getRoomDisplayInfo(room);
                const byId = String(room.room_id ?? "")
                  .toLowerCase()
                  .includes(q);
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
            {getFilteredRooms().length === 0 && !isLoadingRooms && (
              <DropdownMenuItem
                disabled
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
              >
                <span>No rooms available</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>
              Date Range
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("all")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4" /> All Time
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("today")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4" /> Today
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("yesterday")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4" /> Yesterday
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("thisWeek")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4" /> This Week
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("thisMonth")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4" /> This Month
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDateFilterChange("custom")}
              className={menuItemClass}
            >
              <Calendar className="h-4 w-4" /> Custom Range
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-200 my-1" />

            <DropdownMenuLabel className={menuLabelClass}>
              Sort By
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onSort?.("Newest first")}
              className={menuItemClass}
            >
              <SortDesc className="h-4 w-4" /> Newest first
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSort?.("Oldest first")}
              className={menuItemClass}
            >
              <SortAsc className="h-4 w-4" /> Oldest first
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
              <Button variant="ghost" onClick={handleClearCustomRange}>
                Clear
              </Button>
              <Button variant="outline" onClick={handleCloseCustomRange}>
                Cancel
              </Button>
              <Button
                onClick={handleApplyCustomRange}
                disabled={!customRange.from || !customRange.to}
              >
                Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
