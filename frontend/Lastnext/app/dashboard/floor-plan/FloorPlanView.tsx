"use client";

import * as React from "react";
import { AlertTriangle, Map, RotateCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { Skeleton } from "@/app/components/ui/loading";
import { useProperties, useUser } from "@/app/lib/stores/mainStore";
import type {
  FloorPlanDefinition,
  FloorPlanMappedRoom,
  FloorPlanOperationalArea,
  FloorPlanPoint,
} from "@/app/lib/floorplans/runtime.mjs";
import { cn } from "@/app/lib/utils/cn";

type FloorPlanApiResponse = FloorPlanDefinition & {
  property: { property_id: string; name: string };
};

type SelectableMapping = FloorPlanMappedRoom | FloorPlanOperationalArea;

const polygonPoints = (points: FloorPlanPoint[]) =>
  points.map(([x, y]) => `${x},${y}`).join(" ");

const mappingLabel = (mapping: SelectableMapping) =>
  "zone_id" in mapping
    ? mapping.plan_label
    : `${mapping.plan_label} · ${mapping.name}`;

function FloorPlanCanvas({
  floor,
}: {
  floor: FloorPlanDefinition["floors"][number];
}) {
  const [minX, minY, width, height] = floor.view_box;

  const renderMapping = (
    mapping: SelectableMapping,
    kind: "guest" | "operational",
  ) => (
    <a
      key={"zone_id" in mapping ? mapping.zone_id : `room-${mapping.room_id}`}
      href={`/dashboard/rooms/${mapping.room_id}`}
      aria-label={`Open ${mappingLabel(mapping)}`}
      className="group outline-hidden"
    >
      <title>{`${mappingLabel(mapping)} · Room ID ${mapping.room_id}`}</title>
      <polygon
        points={polygonPoints(mapping.polygon)}
        className={cn(
          "cursor-pointer stroke-[3] transition-[fill-opacity,stroke-width] focus-visible:stroke-[6] group-hover:stroke-[5]",
          kind === "operational"
            ? "fill-blue-500/20 stroke-blue-700 group-hover:fill-blue-500/35"
            : "fill-emerald-500/15 stroke-emerald-700 group-hover:fill-emerald-500/30",
        )}
        vectorEffect="non-scaling-stroke"
      />
    </a>
  );

  return (
    <div className="overflow-auto rounded-xl border border-border bg-white shadow-inner">
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        className="block h-auto min-w-[680px] w-full sm:min-w-0"
        role="img"
        aria-label={`${floor.id} interactive floor plan`}
      >
        <image
          href={floor.svg_url}
          x={minX}
          y={minY}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
        {floor.guest_rooms.map((room) => renderMapping(room, "guest"))}
        {floor.operational_areas.map((area) =>
          renderMapping(area, "operational"),
        )}
      </svg>
    </div>
  );
}

export function FloorPlanView() {
  const { selectedPropertyId } = useUser();
  const { properties } = useProperties();
  const [plan, setPlan] = React.useState<FloorPlanApiResponse | null>(null);
  const [selectedFloorId, setSelectedFloorId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const propertyName = React.useMemo(
    () => properties.find((property) => property.property_id === selectedPropertyId)?.name,
    [properties, selectedPropertyId],
  );

  React.useEffect(() => {
    setPlan(null);
    setSelectedFloorId(null);
    setError(null);

    if (!selectedPropertyId) return;

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/floorplans/${encodeURIComponent(selectedPropertyId)}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load this floor plan");
        }
        const nextPlan = payload as FloorPlanApiResponse;
        setPlan(nextPlan);
        setSelectedFloorId(nextPlan.floors[0]?.id || null);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this floor plan",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [selectedPropertyId, reloadKey]);

  const selectedFloor = plan?.floors.find((floor) => floor.id === selectedFloorId) || null;

  if (!selectedPropertyId) {
    return (
      <div className="px-3 py-3 sm:px-4 md:px-5">
        <FeedbackState
          variant="unavailable"
          title="Select a property"
          description="Choose an active property from the header to open its floor plan."
          showRefresh={false}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-5 px-3 py-3 sm:px-4 md:px-5 lg:mx-auto lg:max-w-[1600px]">
      <header className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Property map</p>
          <h1>Floor Plan</h1>
          <p className="pcms-page-description">
            {propertyName || selectedPropertyId} · Select a floor, then tap a room or operational area.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4" aria-label="Loading floor plan">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-[60dvh] min-h-96 rounded-xl" />
        </div>
      ) : error ? (
        <FeedbackState
          variant="error"
          title="Floor plan unavailable"
          description={error}
          action={
            <Button type="button" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          }
          showRefresh={false}
        />
      ) : plan && selectedFloor ? (
        <>
          <section className="pcms-section-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Map className="h-5 w-5 text-primary" aria-hidden="true" />
              {plan.property.name}
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Floor selection">
              {plan.floors.map((floor) => {
                const active = floor.id === selectedFloor.id;
                return (
                  <Button
                    key={floor.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    variant={active ? "default" : "outline"}
                    className="h-11 min-w-16 shrink-0"
                    onClick={() => setSelectedFloorId(floor.id)}
                  >
                    {floor.id}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3" role="tabpanel" aria-label={`${selectedFloor.id} floor plan`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">{selectedFloor.id}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedFloor.guest_rooms.length} rooms · {selectedFloor.operational_areas.length} operational areas
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground" aria-label="Map legend">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-emerald-700 bg-emerald-500/20" />Guest room</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-blue-700 bg-blue-500/25" />Operational area</span>
              </div>
            </div>
            <FloorPlanCanvas floor={selectedFloor} />
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground sm:hidden">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Swipe horizontally to inspect the full drawing. Tap a highlighted zone to open its room.
            </p>
          </section>
        </>
      ) : (
        <FeedbackState
          variant="unavailable"
          title="No floor plan available"
          description="This property does not have a prepared floor plan yet."
          showRefresh={false}
        />
      )}
    </div>
  );
}

