export type FloorPlanPoint = readonly [x: number, y: number];
export type FloorPlanViewBox = readonly [
  minX: number,
  minY: number,
  width: number,
  height: number,
];

export interface FloorPlanMappedRoom {
  floor: string;
  room_id: number;
  name: string;
  plan_label: string;
  room_type: string;
  is_active?: boolean;
  interactive: true;
  status: string;
  polygon: FloorPlanPoint[];
  notes?: string;
}

export interface FloorPlanOperationalArea {
  floor: string;
  zone_id: string;
  plan_label: string;
  room_id: number;
  name: string;
  room_type: string;
  interactive: true;
  status: string;
  polygon: FloorPlanPoint[];
  notes?: string;
}

export interface FloorPlanCancelledMapping {
  floor: string;
  plan_label: string;
  room_id: number | null;
  name: string | null;
  interactive: false;
  status: "cancelled";
  notes: string;
}

export interface FloorPlanDefinition {
  schema_version: number;
  property_id: string;
  property_name: string;
  geometry_policy: string;
  floors: Array<{
    id: string;
    svg_url: string;
    view_box: FloorPlanViewBox;
    guest_rooms: FloorPlanMappedRoom[];
    operational_areas: FloorPlanOperationalArea[];
    cancelled_mappings: FloorPlanCancelledMapping[];
  }>;
  unmapped_operational_records: Array<Record<string, unknown>>;
}

export function getFloorPlanDefinition(propertyId: string): FloorPlanDefinition | null;
export function listFloorPlanPropertyIds(): string[];

