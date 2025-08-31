"use client";

import React, { useCallback, useMemo, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { ChevronDown, Building2, Loader2 } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { useMainStore } from '@/app/lib/stores/mainStore';

const HeaderPropertyList = React.memo(() => {
  // Use more specific selectors to prevent unnecessary re-renders
  const selectedProperty = useMainStore(state => state.selectedPropertyId);
  const setSelectedProperty = useMainStore(state => state.setSelectedPropertyId);
  const userProperties = useMainStore(state => state.properties);
  const propertyLoading = useMainStore(state => state.propertyLoading);
  
  // Debug logging to help identify infinite loops
  useEffect(() => {
    console.log('HeaderPropertyList render:', {
      selectedProperty,
      propertiesCount: userProperties?.length || 0,
      propertyLoading,
      timestamp: Date.now()
    });
  });
  
  // Check if user has properties - memoized to prevent unnecessary recalculations
  const hasProperties = useMemo(() => 
    userProperties && userProperties.length > 0, 
    [userProperties]
  );
  
  // Helper function to safely get the string ID from any property object format
  const getPropertyId = useCallback((property: any): string => {
    if (!property) return "";
    if (typeof property === "string" || typeof property === "number") return String(property);
    if (typeof property.property_id === "string" || typeof property.property_id === "number") {
      return String(property.property_id);
    }
    if (typeof property.id === "string" || typeof property.id === "number") {
      return String(property.id);
    }
    return "";
  }, []);

  // Helper function to safely get the display name from any property object format
  const getPropertyName = useCallback((property: any): string => {
    if (!property) return "Select Property";
    if (typeof property === "string" || typeof property === "number") return `Property ${property}`;
    return property.name || `Property ${getPropertyId(property)}`;
  }, [getPropertyId]);

  // Find current property by selectedProperty ID - memoized with stable dependencies
  const currentProperty = useMemo(() => {
    if (!userProperties || !userProperties.length) return null;
    
    if (selectedProperty) {
      for (const prop of userProperties) {
        const propId = getPropertyId(prop);
        if (propId === selectedProperty) {
          return prop;
        }
      }
    }
    
    return userProperties[0];
  }, [userProperties, selectedProperty, getPropertyId]);

  // Handle property selection - memoized with stable dependencies
  const handlePropertySelect = useCallback(
    (property: any) => {
      const propId = getPropertyId(property);
      if (propId && propId !== selectedProperty) {
        console.log('Setting selected property:', propId);
        setSelectedProperty(propId);
      }
    },
    [getPropertyId, setSelectedProperty, selectedProperty]
  );

  // Memoize the properties array to prevent unnecessary re-renders
  const safeProperties = useMemo(() => 
    Array.isArray(userProperties) ? userProperties : [], 
    [userProperties]
  );

  // Loading state if properties are not yet available
  if (propertyLoading || !hasProperties) {
    return (
      <Button
        variant="outline"
        disabled
        className="flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-white border-gray-300 text-gray-500"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  // If no properties available, show disabled button
  if (!safeProperties || safeProperties.length === 0) {
    return (
      <Button
        variant="outline"
        disabled
        className="flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-white border-gray-300 text-gray-500"
      >
        <Building2 className="h-4 w-4" />
        No Properties
      </Button>
    );
  }

  return (
    <div className="relative w-full sm:w-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center justify-between gap-2 w-full sm:w-auto h-12 px-4 bg-white border-gray-300 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 flex-shrink-0 text-gray-600" />
              <span className="truncate text-gray-700">
                {getPropertyName(currentProperty)}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-full min-w-[200px] max-w-[90vw] bg-white border-gray-200 shadow-md rounded-md mt-1"
          align="start"
        >
          {safeProperties.map((property: any, index: number) => (
            <DropdownMenuItem
              key={getPropertyId(property) || `property-${index}`}
              onClick={() => handlePropertySelect(property)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-base cursor-pointer min-h-[44px]",
                selectedProperty === getPropertyId(property)
                  ? "bg-blue-600 text-white"
                  : "hover:bg-gray-100 text-gray-700"
              )}
            >
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{getPropertyName(property)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

HeaderPropertyList.displayName = 'HeaderPropertyList';

export default HeaderPropertyList;