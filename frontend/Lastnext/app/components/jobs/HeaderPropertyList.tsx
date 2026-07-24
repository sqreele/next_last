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
import { useMainStore } from "@/app/lib/stores/mainStore";
import {
  filterPropertiesForUser,
  getPropertyId,
} from "@/app/lib/security/propertyAccess";

const HeaderPropertyList = React.memo(() => {
  // Use more specific selectors to prevent unnecessary re-renders
  const selectedProperty = useMainStore((state) => state.selectedPropertyId);
  const setSelectedProperty = useMainStore(
    (state) => state.setSelectedPropertyId,
  );
  const userProperties = useMainStore((state) => state.properties);
  const userProfile = useMainStore((state) => state.userProfile);
  const propertyLoading = useMainStore((state) => state.propertyLoading);

  // Debug logging to help identify infinite loops
  useEffect(() => {}, [
    selectedProperty,
    userProperties?.length,
    propertyLoading,
  ]);

  // Helper function to safely get the display name from any property object format
  const getPropertyName = useCallback((property: any): string => {
    if (!property) return "Select Property";
    if (typeof property === "string" || typeof property === "number")
      return `Property ${property}`;
    return property.name || `Property ${getPropertyId(property)}`;
  }, []);

  // Memoize the properties array to prevent unnecessary re-renders
  const safeProperties = useMemo(
    () =>
      filterPropertiesForUser(
        Array.isArray(userProperties) ? userProperties : [],
        userProfile,
      ),
    [userProperties, userProfile],
  );

  // Find current property by selectedProperty ID - memoized with stable dependencies
  const currentProperty = useMemo(() => {
    if (!safeProperties.length) return null;

    if (selectedProperty) {
      for (const prop of safeProperties) {
        const propId = getPropertyId(prop);
        if (propId === selectedProperty) {
          return prop;
        }
      }
    }

    return safeProperties[0];
  }, [safeProperties, selectedProperty]);

  // Handle property selection - memoized with stable dependencies
  const handlePropertySelect = useCallback(
    (property: any) => {
      const propId = getPropertyId(property);
      if (propId && propId !== selectedProperty) {
        setSelectedProperty(propId);
      }
    },
    [setSelectedProperty, selectedProperty],
  );

  const isSelectorLocked = safeProperties.length === 1;

  // Loading state if properties are not yet available
  if (propertyLoading) {
    return (
      <Button
        variant="outline"
        disabled
        className="flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-card border-border text-muted-foreground"
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
        className="flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-card border-border text-muted-foreground"
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
            disabled={isSelectorLocked}
            aria-label={
              isSelectorLocked
                ? "Property selector locked to your assigned property"
                : "Select property"
            }
            className="flex items-center justify-between gap-2 w-full sm:w-auto h-12 px-4 bg-card border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-100"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">
                {getPropertyName(currentProperty)}
              </span>
            </div>
            {!isSelectorLocked && (
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-full min-w-[200px] max-w-[90vw] bg-card border-border shadow-soft rounded-md mt-1"
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
                  : "hover:bg-muted text-muted-foreground",
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

HeaderPropertyList.displayName = "HeaderPropertyList";

export default HeaderPropertyList;
