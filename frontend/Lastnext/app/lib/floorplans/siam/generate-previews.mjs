import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = dirname(fileURLToPath(import.meta.url));
const mapping = JSON.parse(readFileSync(join(outputDir, "room-polygons.json"), "utf8"));

const floorNotes = {
  L1: [
    { x: 742, y: 450, text: "REVIEW ID 172: lobby/bar boundary", tone: "review" },
    { x: 1375, y: 180, text: "REVIEW ID 173: one DB record / two WCs", tone: "review" }
  ],
  L2: [
    { x: 60, y: 1030, text: "REVIEW ID 174: CSV floor conflict (1200 vs Floor 3)", tone: "review" }
  ],
  L3: [
    { x: 980, y: 315, text: "ID 198 / 1300 mapped to WC MEN (noninteractive)", tone: "info" },
    { x: 60, y: 1020, text: "EXCLUDED ID 146 / 1313: out of use; no 313 on plan", tone: "excluded" }
  ],
  L4: [
    { x: 60, y: 1055, text: "UNMAPPED ID 175 / 1400: no bounded Kitchen Room", tone: "unmapped" }
  ]
};

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const points = (polygon) => polygon.map(([x, y]) => `${x},${y}`).join(" ");
const center = (polygon) => {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

for (const [floor, space] of Object.entries(mapping.coordinate_spaces)) {
  const [minX, minY, width, height] = space.viewBox;
  const mapped = mapping.rooms.filter((room) => room.floor === floor && room.status === "mapped");
  const operational = mapping.operational_records.filter((room) => room.floor === floor && room.polygon);
  const unmapped = mapping.architectural_unmapped.filter((room) => room.floor === floor && room.polygon);

  const mappedMarkup = mapped.map((room) => {
    const [x, y] = center(room.polygon);
    return `<g class="mapped"><polygon points="${points(room.polygon)}"/><text x="${x}" y="${y - 7}">${esc(room.plan_label)}</text><text class="id" x="${x}" y="${y + 10}">ID ${room.room_id}</text></g>`;
  }).join("\n");

  const operationalMarkup = operational.map((room) => {
    const [x, y] = center(room.polygon);
    return `<g class="operational"><polygon points="${points(room.polygon)}"/><text x="${x}" y="${y}">ID ${room.room_id} · ${esc(room.name)}</text></g>`;
  }).join("\n");

  const unmappedMarkup = unmapped.map((room) => {
    const [x, y] = center(room.polygon);
    return `<g class="unmapped"><polygon points="${points(room.polygon)}"/><text x="${x}" y="${y - 7}">${esc(room.plan_label)}</text><text class="id" x="${x}" y="${y + 10}">NO DB ROOM</text></g>`;
  }).join("\n");

  const noteMarkup = floorNotes[floor].map((note) =>
    `<g class="note ${note.tone}" transform="translate(${note.x} ${note.y})"><circle r="8"/><text x="13" y="4">${esc(note.text)}</text></g>`
  ).join("\n");

  const fileName = `preview-${floor.toLowerCase()}.svg`;
  const sourceHref = `../../../../public/floorplans/siam/floor-${floor.toLowerCase()}.svg`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <title>Lub d Bangkok Siam ${floor} room polygon validation preview</title>
  <desc>Architectural source with conservative room outlines, plan labels, database room IDs, and review markers.</desc>
  <style>
    .mapped polygon { fill:#22c55e; fill-opacity:.10; stroke:#078232; stroke-width:3; vector-effect:non-scaling-stroke }
    .mapped text, .operational text, .unmapped text { font:700 14px sans-serif; text-anchor:middle; paint-order:stroke; stroke:#fff; stroke-width:4; stroke-linejoin:round; fill:#064e3b }
    .mapped text.id, .unmapped text.id { font-size:11px }
    .operational polygon { fill:#3b82f6; fill-opacity:.08; stroke:#1d4ed8; stroke-width:3; stroke-dasharray:10 6; vector-effect:non-scaling-stroke }
    .operational text { fill:#1e3a8a }
    .unmapped polygon { fill:#ef4444; fill-opacity:.10; stroke:#dc2626; stroke-width:3; stroke-dasharray:9 6; vector-effect:non-scaling-stroke }
    .unmapped text { fill:#991b1b }
    .note circle { fill:#f59e0b; stroke:#92400e; stroke-width:2 }
    .note text { font:700 13px sans-serif; paint-order:stroke; stroke:#fff; stroke-width:4; stroke-linejoin:round; fill:#78350f }
    .note.info circle { fill:#3b82f6; stroke:#1e3a8a }
    .note.info text { fill:#1e3a8a }
    .note.unmapped circle { fill:#ef4444; stroke:#991b1b }
    .note.unmapped text { fill:#991b1b }
    .note.excluded circle { fill:#6b7280; stroke:#111827 }
    .note.excluded text { fill:#111827 }
  </style>
  <image href="${sourceHref}" xlink:href="${sourceHref}" x="0" y="0" width="${width}" height="${height}"/>
  ${mappedMarkup}
  ${operationalMarkup}
  ${unmappedMarkup}
  ${noteMarkup}
</svg>
`;
  writeFileSync(join(outputDir, fileName), svg);
}

