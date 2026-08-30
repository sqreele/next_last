"use client";

import React, { useCallback, useMemo, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { Check, ChevronDown, Building2, Loader2 } from "lucide-react";
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

    return null;
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
        className="h-11 w-full gap-2 rounded-md border-border bg-card px-3 text-muted-foreground sm:w-auto"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
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
        className="h-11 w-full gap-2 rounded-md border-border bg-card px-3 text-muted-foreground sm:w-auto"
      >
        <Building2 className="h-4 w-4" aria-hidden="true" />
        No Properties
      </Button>
    );
  }

  return (
    <div className="relative w-full min-w-0 sm:w-auto">
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
            className="h-11 w-full min-w-0 justify-between gap-2 rounded-md border-border bg-card px-3 shadow-none hover:border-primary/30 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100 sm:w-auto sm:max-w-56"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate text-sm font-semibold text-foreground">
                {getPropertyName(currentProperty)}
              </span>
            </div>
            {!isSelectorLocked && (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="mt-1 max-h-[min(60dvh,28rem)] w-full min-w-[220px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border-border bg-popover p-1.5 shadow-soft"
          align="start"
        >
          {safeProperties.map((property: any, index: number) => (
            <DropdownMenuItem
              key={getPropertyId(property) || `property-${index}`}
              onClick={() => handlePropertySelect(property)}
              aria-current={selectedProperty === getPropertyId(property) ? "true" : undefined}
              className={cn(
                "min-h-12 cursor-pointer gap-2 rounded-md px-3 py-2.5 text-sm focus:bg-muted focus:text-foreground",
                selectedProperty === getPropertyId(property)
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{getPropertyName(property)}</span>
              {selectedProperty === getPropertyId(property) ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

HeaderPropertyList.displayName = "HeaderPropertyList";

export default HeaderPropertyList;
