# Siam SVG Room Polygon Certification — Phase 2

> Historical Phase 2 snapshot. Current product decisions cancel mappings 106 and 1313 and add Lobby/WC operational zones; see `app/lib/floorplans/siam/validation-report.md`.

Property: Lub d Bangkok Siam  
Property ID: `PE17D8D2C`  
Purpose: mapping preparation only; no application integration  
Overall status: **NOT READY FOR INTEGRATION — MANUAL APPROVAL REQUIRED**

## Inputs and storage

The 46 active guestroom candidates exist in `app/lib/floorplans/siam/room-polygons.json`, under the `rooms` array. They consist of 46 SVG-native point arrays plus room 1313/ID 146 with no points. The new identity-safe preparation structure is `app/lib/floorplans/siam/room-mapping.phase2.json`.

The Phase 2 file preserves all 46 point arrays byte-for-byte at the coordinate level. It does not modify the four source SVGs. It adds a unique `polygonId`, actual CSV identity, the four required data attributes, computational results, status, and review notes. Every active candidate defaults to `needs_review`.

## Identity validation

- Active polygon candidates: **46**.
- Candidate identities found in the supplied property CSV: **46/46**.
- Duplicate room IDs: **0**.
- Duplicate polygon IDs: **0**.
- Fabricated room IDs: **0**.
- Required data attributes present in the new configuration: **46/46** for each of `data-property-id`, `data-room-id`, `data-room-name`, and `data-floor`.
- Existing legacy JSON and SVG validation overlays still contain no runtime `data-*` attributes; the Phase 2 configuration is the prepared source for eventual binding.

Room 1313/ID 146 remains in the identity structure with `excluded_not_in_use`, `interactive: false`, `polygonId: null`, and `points: null`. Its CSV record remains unchanged and still says active. Architectural room 106 remains `unmapped`, with `roomId: null` and no interactive polygon identity.

## Geometry validation summary

| Check | Result | Certification effect |
|---|---:|---|
| Native viewBox coordinate systems | 46/46 valid | Computational pass |
| Point count | 46/46 have four points | Computational pass |
| SVG polygon closure | 46/46 implicitly closed | Computational pass |
| Positive polygon area | 46/46 | Computational pass |
| Self-intersections | 0 | Computational pass |
| Duplicate polygons | 0 | Computational pass |
| Guest-to-guest overlaps | 0 | Computational pass |
| Vertices outside viewBox | 0 | Computational pass |
| Gross room association in overlay | 46/46 visually match intended room | Candidate pass only |
| Confirmed main-corridor intrusion | 0 detected | Manual approval still required |
| Confirmed neighboring-room intrusion | 0 detected | Manual approval still required |
| Inner wall-face containment | Not architect-certified | Blocks `verified` status |
| Door threshold/bathroom ownership | Visually plausible, not architect-certified | Blocks `verified` status |

The SVG coordinate spaces are L1 `0 0 1610 915`, L2 `0 0 1475 1060`, L3 `0 0 1475 1050`, and L4 `0 0 1505 1090`. Certification previews use the exact uniform 0.8 render scale supplied with the updated source package. No CSS percentages are used.

All candidate geometries are axis-aligned rectangles. They visually align with the intended outer guestroom/suite extents and do not visibly cross a main corridor or neighboring guestroom. This does not prove inner-wall-face containment: borders are close to architectural wall strokes, and the larger L4 suites contain internal partitions and wet areas whose selectable ownership needs explicit architectural approval. No candidate has been automatically promoted to `verified`.

Transparent fills preserve visible walls, doors, labels, bathrooms, and furniture. Yellow means `needs_review`; gray means `unmapped` or `excluded_not_in_use`. No confirmed rejected/red geometry was found.

## Room-by-room certification status

| Floor | Room Name | Room ID | Polygon ID | Geometry Check | Visual Review | Final Status |
|---|---|---:|---|---|---|---|
| L1 | 1101 | 185 | `siam-l1-room-1101` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L1 | 1102 | 186 | `siam-l1-room-1102` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L1 | 1103 | 187 | `siam-l1-room-1103` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L1 | 1104 | 188 | `siam-l1-room-1104` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L1 | 1105 | 189 | `siam-l1-room-1105` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1201 | 159 | `siam-l2-room-1201` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1202 | 160 | `siam-l2-room-1202` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1203 | 161 | `siam-l2-room-1203` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1204 | 162 | `siam-l2-room-1204` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1205 | 163 | `siam-l2-room-1205` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1206 | 164 | `siam-l2-room-1206` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1207 | 165 | `siam-l2-room-1207` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1208 | 166 | `siam-l2-room-1208` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1209 | 167 | `siam-l2-room-1209` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1210 | 168 | `siam-l2-room-1210` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1211 | 169 | `siam-l2-room-1211` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L2 | 1212 | 170 | `siam-l2-room-1212` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1301 | 134 | `siam-l3-room-1301` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1302 | 135 | `siam-l3-room-1302` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1303 | 137 | `siam-l3-room-1303` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1304 | 136 | `siam-l3-room-1304` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1305 | 138 | `siam-l3-room-1305` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1306 | 139 | `siam-l3-room-1306` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1307 | 140 | `siam-l3-room-1307` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1308 | 141 | `siam-l3-room-1308` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1309 | 142 | `siam-l3-room-1309` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1310 | 143 | `siam-l3-room-1310` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1311 | 144 | `siam-l3-room-1311` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1312 | 145 | `siam-l3-room-1312` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1313 | 146 | — | No polygon | Excluded by business rule; CSV still active | excluded_not_in_use |
| L3 | 1314 | 147 | `siam-l3-room-1314` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L3 | 1315 | 191 | `siam-l3-room-1315` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1401 | 148 | `siam-l4-room-1401` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1402 | 153 | `siam-l4-room-1402` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1403 | 154 | `siam-l4-room-1403` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1404 | 149 | `siam-l4-room-1404` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1405 | 150 | `siam-l4-room-1405` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1406 | 151 | `siam-l4-room-1406` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1407 | 155 | `siam-l4-room-1407` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1408 | 156 | `siam-l4-room-1408` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1409 | 157 | `siam-l4-room-1409` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1410 | 158 | `siam-l4-room-1410` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1411 | 152 | `siam-l4-room-1411` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1412 | 190 | `siam-l4-room-1412` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1414 | 182 | `siam-l4-room-1414` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1415 | 183 | `siam-l4-room-1415` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L4 | 1416 | 184 | `siam-l4-room-1416` | Computational pass; wall-face approval pending | Gross alignment passes | needs_review |
| L1 | Architectural 106 | — | — | Existing outline only; no CSV identity | Visible in drawing | unmapped |

## Ambiguous boundary review list

1. **L1 101–105 and architectural 106:** confirm wall-face insets and the division between rooms 105/106. Room 106 must remain noninteractive until a real property record exists.
2. **L2 bathroom/door edges:** room candidates visually remain on the room side of the corridor walls, but thresholds and en-suite wall thickness require architectural approval.
3. **L3 312/314/315 and WC MEN:** confirm that the guest candidates stop at the corridor wall and that operational ID 198 remains outside guest coverage. ID 146/1313 has no geometry.
4. **L4 401, 403, 407, 414, and 416:** confirm the full suite ownership of internal wet areas, closets/fixtures, and entry zones. These are the highest-priority manual checks.

## Preview outputs

Full-floor previews:

- `L1_certification_preview.png`
- `L2_certification_preview.png`
- `L3_certification_preview.png`
- `L4_certification_preview.png`

Close-ups:

- `L1_101_106_closeup.png`
- `L2_bathroom_door_closeup.png`
- `L3_312_315_wc_closeup.png`
- `L4_large_suites_top_closeup.png`
- `L4_large_suites_bottom_closeup.png`

All paths above are relative to `floorplan-sources/siam/validation/`.

## Readiness assessment

The data is ready for **architectural review**, not application integration. Identity preparation is complete for all 46 active candidates, and computational geometry checks pass. Integration remains blocked until an authorized reviewer explicitly approves wall-face containment and ambiguous suite/bathroom boundaries, after which individual statuses may be changed from `needs_review` to `verified`. Interaction, responsive behavior, zoom/pan, selection, and bottom-sheet behavior remain outside this preparation phase.

