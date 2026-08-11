"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";
import Link from "next/link";
import {
  Package,
  Search,
  CalendarClock,
  Home,
  AlertCircle,
} from "lucide-react";
import {
  CardFooter,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import { useUser } from "@/app/lib/stores/mainStore";
import { PriorityBadge, StatusBadge } from "@/app/components/pcms-ui";
import {
  groupSearchResults,
  type JobSearchResult,
  type PropertySearchResult,
  type RoomSearchResult,
} from "@/app/lib/api/global-search-contracts";
import { fetchGlobalSearch } from "@/app/lib/api/global-search-client";

export default function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [activeTab, setActiveTab] = useState("all");
  const [jobs, setJobs] = useState<JobSearchResult[]>([]);
  const [properties, setProperties] = useState<PropertySearchResult[]>([]);
  const [rooms, setRooms] = useState<RoomSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setIsLoading);

  const { selectedPropertyId: selectedProperty } = useUser();

  useEffect(() => {
    const controller = new AbortController();
    const debounceTimer = window.setTimeout(() => {
    const fetchSearchResults = async () => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery || !selectedProperty) {
        setJobs([]);
        setProperties([]);
        setRooms([]);
        setIsLoading(false);
        return;
      }

      recordLoaderShown();
      setIsLoading(true);
      setError(null);

      try {
        const payload = await fetchGlobalSearch(
          { q: normalizedQuery, property_id: selectedProperty },
          controller.signal,
        );
        const grouped = groupSearchResults(payload.results);
        setJobs(grouped.jobs);
        setProperties(grouped.properties);
        setRooms(grouped.rooms);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Error fetching search results:", error);
        setError(
          "An error occurred while fetching search results. Please try again.",
        );
      } finally {
        clearLoadingAfterMinTime();
      }
    };

    fetchSearchResults();
    }, 300);
    return () => {
      window.clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [query, selectedProperty, recordLoaderShown, clearLoadingAfterMinTime]);

  const filteredJobs = jobs;
  const filteredProperties = properties;
  const filteredRooms = rooms;

  const totalResults =
    filteredJobs.length + filteredProperties.length + filteredRooms.length;

  // Safe highlight match function
  const highlightMatch = (text: string | undefined | null, query: string) => {
    if (!query || !text) return text || "";
    try {
      const parts = text.split(new RegExp(`(${query})`, "gi"));
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="bg-yellow-200 text-foreground">
            {part}
          </span>
        ) : (
          part
        ),
      );
    } catch {
      // In case of regex errors
      return text;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600"></div>
          <p className="text-muted-foreground">Searching...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <div className="rounded-full bg-red-100 p-4">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">Error</h2>
        <p className="text-center text-muted-foreground max-w-md">{error}</p>
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="mt-2"
        >
          Go Back
        </Button>
      </div>
    );
  }

  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <div className="rounded-full bg-muted p-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          Enter a search term
        </h2>
        <p className="text-center text-muted-foreground max-w-md">
          Use the search bar above to find jobs, properties, or rooms
        </p>
      </div>
    );
  }

  if (totalResults === 0) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <div className="rounded-full bg-muted p-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          No results found
        </h2>
        <p className="text-center text-muted-foreground max-w-md">
          We couldn&apos;t find anything matching &quot;{query}&quot;. Try using different
          keywords or filters.
        </p>
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="mt-2"
        >
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Search Results</h1>
          <p className="text-muted-foreground">
            Found {totalResults} {totalResults === 1 ? "result" : "results"} for
            &quot;{query}&quot;
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="all">All Results ({totalResults})</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({filteredJobs.length})</TabsTrigger>
          <TabsTrigger value="properties">
            Properties ({filteredProperties.length})
          </TabsTrigger>
          <TabsTrigger value="rooms">
            Rooms ({filteredRooms.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          {filteredJobs.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                Jobs
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredJobs.slice(0, 3).map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    query={query}
                    highlightMatch={highlightMatch}
                  />
                ))}
              </div>
              {filteredJobs.length > 3 && (
                <Button variant="outline" onClick={() => setActiveTab("jobs")}>
                  View all {filteredJobs.length} jobs
                </Button>
              )}
            </div>
          )}
          {filteredProperties.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                Properties
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredProperties.slice(0, 3).map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    query={query}
                    highlightMatch={highlightMatch}
                  />
                ))}
              </div>
              {filteredProperties.length > 3 && (
                <Button
                  variant="outline"
                  onClick={() => setActiveTab("properties")}
                >
                  View all {filteredProperties.length} properties
                </Button>
              )}
            </div>
          )}
          {filteredRooms.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                Rooms
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredRooms.slice(0, 3).map((room) => (
                    <RoomCard
                      key={String(room.id)}
                      room={room}
                      query={query}
                      highlightMatch={highlightMatch}
                    />
                ))}
              </div>
              {filteredRooms.length > 3 && (
                <Button variant="outline" onClick={() => setActiveTab("rooms")}>
                  View all {filteredRooms.length} rooms
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                query={query}
                highlightMatch={highlightMatch}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                query={query}
                highlightMatch={highlightMatch}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {filteredRooms.map((room) => (
                <RoomCard
                  key={String(room.id)}
                  room={room}
                  query={query}
                  highlightMatch={highlightMatch}
                />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Updated JobCard with safer property access
function JobCard({ job, query, highlightMatch }: JobCardProps) {
  const displayId = job.id;

  return (
    <Card className="overflow-hidden hover:shadow-soft transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold line-clamp-1">
            Job {highlightMatch(displayId, query)}
          </CardTitle>
          <StatusBadge status={job.status} />
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>Priority:</span>
          <PriorityBadge priority={job.priority} />
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {highlightMatch(job.description, query)}
        </p>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>
            {job.created_at
              ? new Date(job.created_at).toLocaleDateString()
              : "N/A"}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t bg-muted p-3">
        <Link href={job.url} className="w-full">
          <Button variant="ghost" className="w-full text-sm">
            View Details
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

// PropertyCard with safer property access
function PropertyCard({ property, query, highlightMatch }: PropertyCardProps) {
  if (!property) return null;

  return (
    <Card className="overflow-hidden hover:shadow-soft transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold line-clamp-1">
          {highlightMatch(property.name, query)}
        </CardTitle>
        <CardDescription className="line-clamp-1">
          ID: {property.id}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {highlightMatch(property.description, query)}
        </p>
        <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>Property</span>
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t bg-muted p-3">
        <Link
          href={property.url}
          className="w-full"
        >
          <Button variant="ghost" className="w-full text-sm">
            View Property
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

// RoomCard with safer property access
function RoomCard({ room, query, highlightMatch }: RoomCardProps) {
  if (!room) return null;

  const displayId = `#${room.id}`;

  return (
    <Card className="overflow-hidden hover:shadow-soft transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold line-clamp-1">
            {highlightMatch(room.name, query)}
          </CardTitle>
          <Badge variant={room.is_active ? "default" : "secondary"}>
            {room.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <CardDescription className="line-clamp-1">
          Room ID: {displayId} | Type: {highlightMatch(room.room_type, query)}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
          <Home className="h-4 w-4" />
          <span>Property: {room.property?.name ?? "N/A"}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>
            {room.created_at
              ? new Date(room.created_at).toLocaleDateString()
              : "N/A"}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-0 border-t bg-muted p-3">
        <Link href={room.url} className="w-full">
          <Button variant="ghost" className="w-full text-sm">
            View Details
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

// Types for props
interface JobCardProps {
  job: JobSearchResult;
  query: string;
  highlightMatch: (
    text: string | undefined | null,
    query: string,
  ) => React.ReactNode;
}

interface PropertyCardProps {
  property: PropertySearchResult;
  query: string;
  highlightMatch: (
    text: string | undefined | null,
    query: string,
  ) => React.ReactNode;
}

interface RoomCardProps {
  room: RoomSearchResult;
  query: string;
  highlightMatch: (
    text: string | undefined | null,
    query: string,
  ) => React.ReactNode;
}
