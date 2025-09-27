import React, { useState } from "react";
import { Search, Filter, X, Calendar, CalendarIcon, Check, Wrench } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { Badge } from "@/app/components/ui/badge";
import { JobStatus, JobPriority } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/app/components/ui/calendar";

export interface FilterState {
  search: string;
  status: JobStatus | "all";
  priority: JobPriority | "all";
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  is_preventivemaintenance?: boolean | null;
  room_id?: string | null;
  room_name?: string | null;
}

interface JobFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onClearFilters: () => void;
}

const JobFilters: React.FC<JobFiltersProps> = ({
  filters,
  onFilterChange,
  onClearFilters,
}) => {
  const [searchTerm, setSearchTerm] = useState(filters.search);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // Count active filters (excluding 'all' and empty search)
  const activeFilterCount = [
    filters.search !== "" ? 1 : 0,
    filters.status !== "all" ? 1 : 0,
    filters.priority !== "all" ? 1 : 0,
    filters.dateRange?.from || filters.dateRange?.to ? 1 : 0,
    filters.is_preventivemaintenance !== null ? 1 : 0,
    filters.room_id ? 1 : 0,
    filters.room_name ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({
      ...filters,
      search: searchTerm,
    });
  };

  const handleStatusChange = (value: string) => {
    onFilterChange({
      ...filters,
      status: value as JobStatus | "all",
    });
  };

  const handlePriorityChange = (value: string) => {
    onFilterChange({
      ...filters,
      priority: value as JobPriority | "all",
    });
  };

  const handleDateRangeChange = (range: { from?: Date; to?: Date }) => {
    onFilterChange({
      ...filters,
      dateRange: range
    });
  };

  const handlePreventiveMaintenanceChange = (value: string) => {
    const boolValue = value === "true" ? true : value === "false" ? false : null;
    onFilterChange({
      ...filters,
      is_preventivemaintenance: boolValue
    });
  };

  const handleClearFilters = () => {
    onFilterChange({
      search: "",
      status: "all",
      priority: "all",
      dateRange: undefined,
      is_preventivemaintenance: null,
      room_id: null,
      room_name: null
    });
    setSearchTerm("");
  };

  // Format date range for display
  const formatDateRange = () => {
    if (!filters.dateRange?.from && !filters.dateRange?.to) return "Any Date";
    
    if (filters.dateRange.from && filters.dateRange.to) {
      if (filters.dateRange.from.toDateString() === filters.dateRange.to.toDateString()) {
        return format(filters.dateRange.from, "MMM d, yyyy");
      }
      return `${format(filters.dateRange.from, "MMM d")} - ${format(filters.dateRange.to, "MMM d, yyyy")}`;
    }
    
    if (filters.dateRange.from) {
      return `From ${format(filters.dateRange.from, "MMM d, yyyy")}`;
    }
    
    if (filters.dateRange.to) {
      return `Until ${format(filters.dateRange.to, "MMM d, yyyy")}`;
    }
  };

  // Format preventive maintenance value for select display
  const getPreventiveMaintenanceValue = () => {
    if (filters.is_preventivemaintenance === true) return "true";
    if (filters.is_preventivemaintenance === false) return "false";
    return "null";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      {/* Search Section */}
      <div className="mb-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search jobs by ID, description, room, or topic..."
              className="pl-10 h-10 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <Button 
            type="submit" 
            className="shrink-0 bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            Search
          </Button>
        </form>
      </div>

      {/* Filter Controls */}
      <div className="space-y-4">
        {/* Primary Filters Row */}
        <div className="flex flex-wrap gap-2">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Status:</span>
            <Select
              value={filters.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger 
                className={`w-40 h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm ${
                  filters.status !== "all" ? 'border-blue-300 bg-blue-50' : ''
                }`}
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-200 rounded-lg shadow-lg">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="waiting_sparepart">Waiting Parts</SelectItem>
              </SelectContent>
            </Select>
            {filters.status !== "all" && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">Active</span>
            )}
          </div>
          
          {/* Priority filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Priority:</span>
            <Select
              value={filters.priority}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger 
                className={`w-36 h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm ${
                  filters.priority !== "all" ? 'border-amber-300 bg-amber-50' : ''
                }`}
              >
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-200 rounded-lg shadow-lg">
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            {filters.priority !== "all" && (
              <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full">Active</span>
            )}
          </div>
          
          {/* Maintenance Type filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Type:</span>
            <Select
              value={getPreventiveMaintenanceValue()}
              onValueChange={handlePreventiveMaintenanceChange}
            >
              <SelectTrigger 
                className={`w-44 h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm ${
                  filters.is_preventivemaintenance !== null ? 'border-purple-300 bg-purple-50' : ''
                }`}
              >
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-200 rounded-lg shadow-lg">
                <SelectItem value="null">All Types</SelectItem>
                <SelectItem value="true">Preventive Maintenance</SelectItem>
                <SelectItem value="false">Regular Jobs</SelectItem>
              </SelectContent>
            </Select>
            {filters.is_preventivemaintenance !== null && (
              <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full">Active</span>
            )}
          </div>

          {/* Clear All Filters Button */}
          {activeFilterCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 px-3 text-gray-600 hover:text-gray-800 hover:bg-gray-50 border-gray-300"
              onClick={handleClearFilters}
            >
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        {/* Secondary Filters Row */}
        <div className="flex flex-wrap gap-2">
          {/* Room filters */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Room:</span>
            <Input
              placeholder="Room ID"
              value={filters.room_id || ""}
              onChange={(e) => onFilterChange({
                ...filters,
                room_id: e.target.value || null
              })}
              className={`w-32 h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm ${
                filters.room_id ? 'border-indigo-300 bg-indigo-50' : ''
              }`}
            />
            <Input
              placeholder="Room Name"
              value={filters.room_name || ""}
              onChange={(e) => onFilterChange({
                ...filters,
                room_name: e.target.value || null
              })}
              className={`w-36 h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm ${
                filters.room_name ? 'border-indigo-300 bg-indigo-50' : ''
              }`}
            />
          </div>
          
          {/* Date Range filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Date:</span>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className={cn(
                    "w-48 h-9 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors shadow-sm justify-start text-left font-normal", 
                    !filters.dateRange?.from && !filters.dateRange?.to ? "text-gray-500" : "border-green-300 bg-green-50"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDateRange()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white border border-gray-200 rounded-lg shadow-lg" align="start">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  selected={filters.dateRange}
                  onSelect={(range) => {
                    handleDateRangeChange(range || {});
                    if (range?.to) {
                      setIsCalendarOpen(false);
                    }
                  }}
                  numberOfMonths={1}
                />
                <div className="flex items-center justify-between p-3 border-t border-gray-100">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      handleDateRangeChange({});
                      setIsCalendarOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => setIsCalendarOpen(false)}
                  >
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {(filters.dateRange?.from || filters.dateRange?.to) && (
              <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">Active</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Active Filters ({activeFilterCount})</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-gray-500 hover:text-gray-700"
              onClick={handleClearFilters}
            >
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.search && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                Search: {filters.search}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-blue-900" 
                  onClick={() => onFilterChange({...filters, search: ""})}
                />
              </Badge>
            )}
            
            {filters.status !== "all" && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                Status: {filters.status.replace("_", " ")}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-blue-900" 
                  onClick={() => onFilterChange({...filters, status: "all"})}
                />
              </Badge>
            )}
            
            {filters.priority !== "all" && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                Priority: {filters.priority}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-amber-900" 
                  onClick={() => onFilterChange({...filters, priority: "all"})}
                />
              </Badge>
            )}
            
            {filters.room_id && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
              >
                Room ID: {filters.room_id}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-indigo-900" 
                  onClick={() => onFilterChange({...filters, room_id: null})}
                />
              </Badge>
            )}

            {filters.room_name && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
              >
                Room: {filters.room_name}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-indigo-900" 
                  onClick={() => onFilterChange({...filters, room_name: null})}
                />
              </Badge>
            )}
            
            {filters.is_preventivemaintenance !== null && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
              >
                <Wrench className="h-3 w-3" />
                {filters.is_preventivemaintenance === true ? "Preventive Maintenance" : "Regular Jobs"}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-purple-900" 
                  onClick={() => onFilterChange({...filters, is_preventivemaintenance: null})}
                />
              </Badge>
            )}
            
            {(filters.dateRange?.from || filters.dateRange?.to) && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
              >
                <Calendar className="h-3 w-3" />
                {formatDateRange()}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-green-900" 
                  onClick={() => onFilterChange({...filters, dateRange: {}})}
                />
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobFilters;