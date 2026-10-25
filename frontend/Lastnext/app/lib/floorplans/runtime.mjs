import siamSource from "./siam/room-polygons.json" with { type: "json" };

const FLOOR_ORDER = ["L1", "L2", "L3", "L4"];

const isPoint = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((coordinate) => Number.isFinite(coordinate));

const assertPolygon = (polygon, label) => {
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(isPoint)) {
    throw new Error(`Invalid floor-plan polygon for ${label}`);
  }
};

const assetUrl = (sourcePath) => {
  const normalized = String(sourcePath || "").replace(/^public\//, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Invalid floor-plan SVG path: ${sourcePath}`);
  }
  return `/${normalized}`;
};

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const prepareDefinition = (source) => {
  if (!source || typeof source !== "object") {
    throw new Error("Floor-plan source must be an object");
  }
  if (!source.property_id || !source.property_name) {
    throw new Error("Floor-plan source is missing its Property identity");
  }

  const rooms = Array.isArray(source.rooms) ? source.rooms : [];
  const operationalAreas = Array.isArray(source.operational_areas)
    ? source.operational_areas
    : [];
  const cancelledMappings = Array.isArray(source.cancelled_mappings)
    ? source.cancelled_mappings
    : [];
  const unmappedOperationalRecords = Array.isArray(source.unmapped_operational_records)
    ? source.unmapped_operational_records
    : [];

  const seenZoneIds = new Set();
  operationalAreas.forEach((area) => {
    assertPolygon(area.polygon, area.zone_id || area.plan_label);
    if (!area.zone_id || seenZoneIds.has(area.zone_id)) {
      throw new Error(`Duplicate or missing floor-plan zone ID: ${area.zone_id}`);
    }
    seenZoneIds.add(area.zone_id);
  });
  rooms.forEach((room) => assertPolygon(room.polygon, room.plan_label || room.name));

  const floors = FLOOR_ORDER.map((floorId) => {
    const coordinateSpace = source.coordinate_spaces?.[floorId];
    if (!coordinateSpace || !Array.isArray(coordinateSpace.viewBox) || coordinateSpace.viewBox.length !== 4) {
      throw new Error(`Missing coordinate space for ${floorId}`);
    }

    return {
      id: floorId,
      svg_url: assetUrl(coordinateSpace.svg),
      view_box: coordinateSpace.viewBox,
      guest_rooms: rooms.filter(
        (room) => room.floor === floorId && room.status === "mapped" && room.interactive,
      ),
      operational_areas: operationalAreas.filter(
        (area) => area.floor === floorId && area.status.startsWith("mapped") && area.interactive,
      ),
      cancelled_mappings: cancelledMappings.filter((mapping) => mapping.floor === floorId),
    };
  });

  return deepFreeze({
    schema_version: source.schema_version,
    property_id: source.property_id,
    property_name: source.property_name,
    geometry_policy: source.geometry_policy,
    floors,
    unmapped_operational_records: unmappedOperationalRecords,
  });
};

const DEFINITIONS = new Map([
  [String(siamSource.property_id).toUpperCase(), prepareDefinition(siamSource)],
]);

export function getFloorPlanDefinition(propertyId) {
  const key = String(propertyId || "").trim().toUpperCase();
  return DEFINITIONS.get(key) ?? null;
}

export function listFloorPlanPropertyIds() {
  return Array.from(DEFINITIONS.keys());
}

