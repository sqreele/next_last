// ./app/components/jobs/RoomAutocomplete.tsx
"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/app/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { Button } from "@/app/components/ui/button";
import { Check, ChevronsUpDown, Building } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { useUser, useProperties } from "@/app/lib/stores/mainStore";
import { Room } from "@/app/lib/types";

interface RoomAutocompleteProps {
  rooms: Room[];
  selectedRoom: Room | null;
  onSelect: (room: Room | null) => void;
  disabled?: boolean;
  debug?: boolean;
}

const RoomAutocomplete = ({
  rooms = [],
  selectedRoom,
  onSelect,
  disabled = false,
  debug = false, // Set default to false in production
}: RoomAutocompleteProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { selectedPropertyId: selectedProperty } = useUser();
  const { properties: userProperties = [] } = useProperties();
  // Removed fallback mode to enforce strict property-based filtering

  // Safer debug logging
  const debugLog = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[RoomAutocomplete] ${message}`, data !== undefined ? data : "");
    }
  }, [debug]);

  // Safer room array handling
  const safeRooms = useMemo(() => (Array.isArray(rooms) ? rooms : []), [rooms]);

  // Log data for debugging on component mount and when key props change
  useEffect(() => {
    if (debug) {
      debugLog("CONTEXT/PROPS:", {
        selectedProperty,
        userProperties,
        totalRooms: safeRooms.length,
        selectedRoom
      });
    }
  }, [selectedProperty, safeRooms.length, debug, debugLog, selectedRoom, userProperties]);

  // Enhanced roomBelongsToProperty to handle Django model relationships
  const roomBelongsToProperty = useCallback((room: Room, propertyId: string | null): boolean => {
    // Early returns
    if (!propertyId) return true; // Show all if no property selected
    if (!room) return false;

    // Handle numeric property ID
    const numericPropId = !isNaN(Number(propertyId)) ? Number(propertyId) : null;
    const propIdStr = String(propertyId);

    debugLog(`Checking if room ${room.name} (ID: ${room.room_id}) belongs to property ${propertyId}`);

    // Check direct property_id on room if present
    if (room.property_id !== undefined && room.property_id !== null) {
      if (String(room.property_id) === propIdStr) {
        debugLog(`✓ MATCH: room.property_id matches selected property`);
        return true;
      }
      if (numericPropId !== null && Number(room.property_id) === numericPropId) {
        debugLog(`✓ MATCH: numeric room.property_id matches selected property`);
        return true;
      }
    }

    // Check the room.properties array (if it exists)
    if (room.properties && Array.isArray(room.properties)) {
      for (const prop of room.properties) {
        if (prop === null || prop === undefined) continue;

        if (typeof prop === 'object') {
          if ('property_id' in prop && (prop.property_id === propertyId || String(prop.property_id) === propIdStr)) {
            debugLog(`✓ MATCH: Found property_id match in room.properties`);
            return true;
          }
          if ('id' in prop && (prop.id === propertyId || String(prop.id) === propIdStr)) {
            debugLog(`✓ MATCH: Found id match in room.properties`);
            return true;
          }
          if (numericPropId !== null) {
            if ('id' in prop && Number(prop.id) === numericPropId) {
              debugLog(`✓ MATCH: Found numeric id match in room.properties`);
              return true;
            }
            if ('property_id' in prop && Number(prop.property_id) === numericPropId) {
              debugLog(`✓ MATCH: Found numeric property_id match in room.properties`);
              return true;
            }
          }
        }

        if (typeof prop === 'string' || typeof prop === 'number') {
          if (String(prop) === propIdStr) {
            debugLog(`✓ MATCH: Found direct ID match in room.properties`);
            return true;
          }
          if (numericPropId !== null && Number(prop) === numericPropId) {
            debugLog(`✓ MATCH: Found numeric direct ID match in room.properties`);
            return true;
          }
        }
      }
    }

    // No match found
    return false;
  }, [debugLog]);

  // Reset selected room when property changes if it doesn't belong
  useEffect(() => {
    if (selectedRoom && selectedProperty &&
        !roomBelongsToProperty(selectedRoom, selectedProperty)) {
      debugLog(`Selected room ${selectedRoom.name} doesn't belong to property ${selectedProperty}, resetting selection`);
      onSelect(null);
    }
  }, [selectedProperty, selectedRoom, onSelect, roomBelongsToProperty, debugLog]);

  // Filter rooms based on property and search query
  const filteredRooms = useMemo(() => {
    if (safeRooms.length === 0) {
      debugLog("No rooms available to filter.");
      return [];
    }

    debugLog(`Filtering ${safeRooms.length} rooms for property: ${selectedProperty || 'any'}, query: "${searchQuery}"`);

    const results = safeRooms.filter((room) => {
      if (!room || typeof room.name !== 'string') {
        return false;
      }

      // Filter by selected property
      if (!roomBelongsToProperty(room, selectedProperty)) {
        return false;
      }

      // Then filter by search query
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const nameMatch = room.name.toLowerCase().includes(search);
        const typeMatch = typeof room.room_type === 'string' && room.room_type.toLowerCase().includes(search);
        const idMatch = String(room.room_id ?? '').toLowerCase().includes(search);
        return nameMatch || typeMatch || idMatch;
      }

      return true;
    });

    debugLog(`Filtering result: ${results.length} rooms match.`);

    // Sort rooms by name for better usability
    return results.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [safeRooms, searchQuery, selectedProperty, roomBelongsToProperty, debugLog]);

  // Get property name with better error handling
  const getPropertyName = useCallback((): string => {
    if (!selectedProperty) return "All Properties";
    
    // Check userProperties array for matching property
    if (Array.isArray(userProperties) && userProperties.length > 0) {
      // Try to find by property_id first
      const propertyById = userProperties.find(p => p.property_id === selectedProperty);
      if (propertyById?.name) return propertyById.name;
      
      // Try to find by id if property_id didn't match
      const propertyByAltId = userProperties.find(p => p.id === selectedProperty);
      if (propertyByAltId?.name) return propertyByAltId.name;
    }
    
    // Fallback to showing the ID
    return `Property ID ${selectedProperty}`;
  }, [selectedProperty, userProperties]);

  return (
    <div className="space-y-2">
      {/* Info text showing current property */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <Building className="h-3 w-3" />
        <span>
          Showing rooms for: <span className="font-medium text-gray-700">{getPropertyName()}</span>
          {(selectedProperty || searchQuery) && (<span className="ml-1">({filteredRooms.length} found)</span>)}
        </span>
      </div>

      {/* Debug Info */}
      {debug && (
        <div className="text-xs text-gray-500 bg-gray-100 p-1 rounded mb-1">
          Debug: Prop: {selectedProperty || "any"} | Rooms: {safeRooms.length} | 
          Filtered: {filteredRooms.length}
        </div>
      )}

      {/* Popover and Command */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || safeRooms.length === 0}
            className={cn(
              "w-full justify-between h-11 text-sm bg-white border-gray-300 font-normal",
              !selectedRoom?.name && "text-muted-foreground"
            )}
            data-testid="room-select-button"
          >
            {selectedRoom?.name
              ? `${selectedRoom.name}${selectedRoom.room_type ? ` (${selectedRoom.room_type})` : ''}`
              : "Select room..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width)] p-0 bg-white border border-input shadow-md">
          <Command shouldFilter={false} className="border-0">
            <CommandInput
              placeholder="Search room number, name, or type..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-10 text-sm"
              data-testid="room-search-input"
            />
            <CommandList>
              <CommandEmpty className="py-4 px-4 text-sm text-center text-muted-foreground">
                {safeRooms.length === 0 ? "No rooms available." :
                 filteredRooms.length === 0 && (selectedProperty || searchQuery) ? `No rooms match criteria.` :
                 "No rooms found."}
              </CommandEmpty>
              <CommandGroup className="max-h-60 overflow-y-auto">
                {filteredRooms.map((room) => (
                  <CommandItem
                    key={`room-${room.room_id}`}
                    value={String(room.room_id)}
                    onSelect={(currentValue) => {
                        const roomToSelect = filteredRooms.find(r => String(r.room_id) === currentValue);
                        onSelect(roomToSelect || null);
                        setSearchQuery("");
                        setOpen(false);
                    }}
                    className="text-sm"
                    data-testid={`room-option-${room.room_id}`}
                  >
                    <Check 
                      className={cn(
                        "mr-2 h-4 w-4", 
                        selectedRoom?.room_id === room.room_id ? "opacity-100" : "opacity-0"
                      )} 
                    />
                    <span>{room.name}</span>
                    {room.room_type && <span className="ml-2 text-xs text-muted-foreground">({room.room_type})</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default RoomAutocomplete;