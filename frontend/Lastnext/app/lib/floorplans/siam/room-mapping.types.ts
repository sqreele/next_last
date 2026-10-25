export type SiamFloor = "L1" | "L2" | "L3" | "L4";

export type RoomMappingStatus =
  | "verified"
  | "needs_review"
  | "rejected"
  | "excluded_not_in_use"
  | "unmapped";

export type SvgPoint = readonly [x: number, y: number];

export interface RoomIdentityDataAttributes {
  "data-property-id": string;
  "data-room-id": string;
  "data-room-name": string;
  "data-floor": SiamFloor;
}

export interface GeometryValidationResult {
  coordinateSystem: string;
  pointCount: number;
  implicitlyClosedBySvgPolygon: true;
  selfIntersectionCount: number;
  withinViewBox: boolean;
  duplicatePolygon: boolean;
  overlapWithGuestPolygonIds: string[];
  grossVisualAlignment: "candidate_matches_intended_room";
  wallFaceContainment: "manual_approval_required";
  corridorIntrusion: "not_detected_in_overlay_manual_approval_required";
  doorAndBathroomBoundary: "manual_approval_required";
}

export interface ActiveRoomPolygonCandidate {
  propertyId: string;
  floor: SiamFloor;
  roomId: number;
  roomName: string;
  architecturalLabel: string;
  roomType: string;
  isActiveInCsv: boolean;
  interactive: true;
  polygonId: string;
  points: SvgPoint[];
  dataAttributes: RoomIdentityDataAttributes;
  mappingStatus: "needs_review" | "verified" | "rejected";
  geometryValidation: GeometryValidationResult;
  validationNotes: string[];
}

export interface ExcludedRoomMapping {
  propertyId: string;
  floor: SiamFloor;
  roomId: number;
  roomName: string;
  architecturalLabel: null;
  roomType: string;
  isActiveInCsv: boolean;
  interactive: false;
  polygonId: null;
  points: null;
  dataAttributes: null;
  mappingStatus: "excluded_not_in_use";
  validationNotes: string[];
}

export interface UnmappedArchitecturalRoom {
  propertyId: string;
  floor: SiamFloor;
  roomId: null;
  roomName: null;
  architecturalLabel: string;
  interactive: false;
  polygonId: null;
  points: SvgPoint[];
  dataAttributes: null;
  mappingStatus: "unmapped";
  validationNotes: string[];
}

export interface FloorCoordinateSpace {
  svg: string;
  viewBox: readonly [minX: number, minY: number, width: number, height: number];
}

export type OperationalAreaMappingStatus =
  | "mapped"
  | "mapped_shared_room"
  | "mapped_no_database_room";

export interface OperationalAreaMapping {
  propertyId: string;
  floor: SiamFloor;
  zoneId: string;
  architecturalLabel: string;
  roomId: number | null;
  roomName: string | null;
  roomType: string;
  interactive: boolean;
  polygonId: string;
  points: SvgPoint[];
  dataAttributes: RoomIdentityDataAttributes | null;
  mappingStatus: OperationalAreaMappingStatus;
  validationNotes: string[];
}

export interface CancelledMapping {
  propertyId: string;
  floor: SiamFloor;
  architecturalLabel: string;
  roomId: number | null;
  roomName: string | null;
  interactive: false;
  mappingStatus: "cancelled";
  reason: string;
}

export interface SiamRoomMappingConfiguration {
  schemaVersion: 2;
  propertyId: string;
  propertyName: string;
  purpose: "mapping_preparation_only";
  sourceMapping: string;
  sourceCsv: string;
  defaultCandidateStatus: "needs_review";
  coordinateSpaces: Record<SiamFloor, FloorCoordinateSpace>;
  activeCandidateCount: number;
  rooms: Array<ActiveRoomPolygonCandidate | ExcludedRoomMapping>;
  operationalAreas: OperationalAreaMapping[];
  cancelledMappings: CancelledMapping[];
  unmappedArchitecturalRooms: UnmappedArchitecturalRoom[];
}

