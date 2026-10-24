# Siam SVG Room Mapping Validation Report

**Property:** Lub d Bangkok Siam  
**Property ID:** `PE17D8D2C`  
**Branch audited:** `feature/siam-accurate-svg-floorplan` at `c4949169`  
**Audit date:** 2026-10-24  
**Scope:** Verification only. No Operations Overview, API, authentication, database, or deployment changes were made.

## Executive result

**Approval decision: NOT READY**

The four architectural assets are valid vector SVGs, their floor identities are supported by the room labels and layouts, and L4 is demonstrably distinct from L3. The mapping JSON contains 46 non-overlapping guest-room coordinate arrays associated with the correct CSV records, plus one noninteractive operational polygon. At the native coordinate level, the guest candidates visually land on the expected rooms.

The mapping is not ready for integration because none of the 46 candidates has a polygon ID or the required `data-property-id`, `data-room-id`, and `data-room-name` metadata. The candidates are four-point preparation rectangles and have not received wall-face-level architectural sign-off. The source package itself says the room mapping was “not yet verified.” Mobile/touch interaction does not exist and is not testable. The physical building was not surveyed, so this audit establishes fidelity to the supplied drawings, not as-built accuracy.

## Audit environment

The audit ran from `/root/next_last_siam_svg/frontend/Lastnext` on `feature/siam-accurate-svg-floorplan`. `/root/next_last` was not used. The worktree was clean before the report and preview outputs were created. No branch switch, reset, stash, commit, or push was performed.

## A. SVG Asset Inventory

| File | Floor evidence independent of filename | Width × height | viewBox | Aspect ratio | Paths / groups / uses | Embedded images | XML |
|---|---|---:|---|---:|---:|---:|---|
| `public/floorplans/siam/floor-l1.svg` | 101–106, lobby/bar, MALE/FEMALE, L1 title fragment | 1610 × 915 | `0 0 1610 915` | 1.759563 | 26,083 / 769 / 186 | 0 | PASS |
| `public/floorplans/siam/floor-l2.svg` | 201–212, theater and L2 circulation layout | 1475 × 1060 | `0 0 1475 1060` | 1.391509 | 22,071 / 813 / 137 | 0 | PASS |
| `public/floorplans/siam/floor-l3.svg` | 301–312 and 314–315, WC MEN/WOMEN | 1475 × 1050 | `0 0 1475 1050` | 1.404762 | 18,802 / 447 / 162 | 0 | PASS |
| `public/floorplans/siam/floor-l4.svg` | Distinct 401–412 and 414–416 suites | 1505 × 1090 | `0 0 1505 1090` | 1.380734 | 40,465 / 698 / 110 | 0 | PASS |

Checksums:

- L1: `1e0b4307bc77e08b8f613c144a61fae1345aa42c52b8d248bd0eca87ccf12796`
- L2: `e181e906191eb3bc5eab0a7e12923e3aceaa110e65fa3ba92d8335ae56175be8`
- L3: `a0ec2b1970dfb3c7887d56137a37fec6aa9296c25a0f15373701be120e581925`
- L4: `60a9bae50d0fbfd2f9720eec4a3a9cb3485bf209801ab54a0656d3635ed7641d`

All four public SVGs are byte-for-byte identical to the corresponding SVG members in `Siam_Updated_Vector_FloorPlans_L1-L4.zip`. No `<image>` elements, PNG/JPEG references, or raster data URIs were found. The exports contain path outlines rather than editable SVG text.

### Transforms and layers

| Floor | Transform attributes | Unique matrices | Maximum XML depth | Invalid/singular matrices |
|---|---:|---:|---:|---:|
| L1 | 26,192 | 867 | 4 | 0 |
| L2 | 22,146 | 1,174 | 4 | 0 |
| L3 | 18,898 | 892 | 4 | 0 |
| L4 | 40,518 | 1,673 | 4 | 0 |

All transforms use six-value SVG `matrix(...)` syntax. The common Y-axis inversions are consistent with CAD/PDF export and render correctly. Clip paths are present (11/9/9/11 for L1–L4). No invalid or zero-determinant matrix was found.

The files retain Inkscape group labels derived from CAD layers. Repeated architectural layers include `A-WALL`, `A-WALL-HATE`, `A-DOOR`, `0-M-OP-Door`, `A-STAIR`, `A-Lift`, `A-WINS`, `A-WC`, `A-COLM`, `A-FUR`, `A-FLR PATTERN`, `Dim`, `Text`, and `TITLE`. Layers are visually and semantically identifiable, but the groups have no stable `id` attributes suitable for runtime querying.

## B. Architectural Accuracy

### Available sources

- `floorplan-sources/siam/StayMaint_Clean_Floor_Plans.pdf`: available; four raster-image pages.
- `Siam_Updated_Clean_Vector_FloorPlans.pdf`: available only inside `Siam_Updated_Vector_FloorPlans_L1-L4.zip`; four vector pages.
- Manifest-named upstream `Master Plan L1-L4(1).pdf`: **MISSING as a standalone repository file**. Direct comparison with that original is therefore not possible.
- The ZIP also contains four 0.8-scale PNG previews. Their dimensions exactly track the SVG viewBoxes: 1288×732, 1180×848, 1180×840, and 1204×872.

### PDF-to-SVG findings

The older `StayMaint_Clean_Floor_Plans.pdf` visually contains L1, L3, L2, and a duplicate L3 page. It is not a valid L1–L4 source and cannot prove L4. The updated ZIP manifest assigns pages 1–4 to L1–L4, and its SVGs match the public assets byte-for-byte. Visual comparison of the supplied updated previews shows walls, partitions, doors, stairs, lift cores, corridors, sanitary layouts, and room labels preserved in the SVGs. No missing structural wall, door, stair, lift, or corridor was identified relative to the supplied rendered sources.

This conclusion is **geometric equivalence to the supplied PDF-derived artifacts**, not verification against the physical building or an as-built survey.

L4 is not an L3 duplicate: it has 4xx labels, a different suite mix and wet-area arrangement, materially different path/group counts, a different viewBox, and a different SHA-256 hash.

### Remaining architectural annotations

- L1: grid/dimension lines, level marker, F.H.C., fixture/furniture tags, title and scale fragments.
- L2: grid/dimension lines, level callouts, F.H.C., window/door/fixture tags.
- L3: grid/dimension lines, level callouts, F.H.C., `SEE DETAIL ST.1`, window/door/fixture tags.
- L4: grid lines, F.H.C., fixture/furniture tags, and title fragment.

These annotations remain vector geometry and sometimes intersect or sit close to room geometry. They should be hidden only through a reviewed presentation-layer strategy; the original SVG geometry must not be deleted.

## C. Room Mapping Coverage

The CSV has 52 rows, all with property text beginning `PE17D8D2C - Lub d Bangkok Siam`, all marked `Yes`, with no duplicate room IDs or names. It contains 47 guest records and five operational/facility records. Active guest scope is recalculated as 47 minus excluded room 1313/ID 146 = 46.

“Correctly Mapped” below requires identity, geometry, stable polygon ID, required metadata, and wall-level sign-off. The 46 arrays pass identity and gross visual placement, but not all acceptance requirements.

| Floor | Expected Active Rooms | Polygons Found | Correctly Mapped | Needs Review | Missing |
|---|---:|---:|---:|---:|---:|
| L1 | 5 | 5 | 0 | 5 | 0 |
| L2 | 12 | 12 | 0 | 12 | 0 |
| L3 | 14 | 14 | 0 | 14 | 0 |
| L4 | 15 | 15 | 0 | 15 | 0 |
| **Total** | **46** | **46** | **0** | **46** | **0** |

Additional geometry not counted in guest coverage:

- L1 architectural room 106 has a gray candidate outline but no matching CSV record.
- L3 ID 198 / name 1300 has a noninteractive operational polygon for WC MEN.
- L3 ID 146 / name 1313 has no polygon and is correctly excluded from interactive coverage, although the CSV still marks it active.

## D. Room-by-Room Mapping

Every mapped record below is sourced from `app/lib/floorplans/siam/room-polygons.json`. The displayed architectural number is the CSV name without its floor-namespace prefix (for example, CSV `1101` corresponds visually to `101`). No database value was renamed.

| Floor | Room Name | Room ID | Room Type | SVG Polygon ID | Alignment | Mapping Status |
|---|---|---:|---|---|---|---|
| L1 | 1101 | 185 | The Sidekick | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L1 | 1102 | 186 | The Sidekick | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L1 | 1103 | 187 | The Sidekick | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L1 | 1104 | 188 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L1 | 1105 | 189 | The Sidekick | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1201 | 159 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1202 | 160 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1203 | 161 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1204 | 162 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1205 | 163 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1206 | 164 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1207 | 165 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1208 | 166 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1209 | 167 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1210 | 168 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1211 | 169 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L2 | 1212 | 170 | The Upgrade | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1301 | 134 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1302 | 135 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1303 | 137 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1304 | 136 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1305 | 138 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1306 | 139 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1307 | 140 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1308 | 141 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1309 | 142 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1310 | 143 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1311 | 144 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1312 | 145 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1313 | 146 | Tribe Hideout (4Shared-Beds) | — | N/A; no 313 room on drawing and no polygon | EXCLUDED; CSV ACTIVE discrepancy |
| L3 | 1314 | 147 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L3 | 1315 | 191 | Tribe Hideout (4Shared-Beds) | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1401 | 148 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1402 | 153 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1403 | 154 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1404 | 149 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1405 | 150 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1406 | 151 | The Duo | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1407 | 155 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1408 | 156 | The Triplex | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1409 | 157 | The Triplex | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1410 | 158 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1411 | 152 | The Duo | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1412 | 190 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1414 | 182 | The Duo | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1415 | 183 | The Compact | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |
| L4 | 1416 | 184 | The Duo | MISSING | Gross visual match; wall-face certification pending | NEEDS_REVIEW |

## E. Geometry Problems and Data Inconsistencies

### Confirmed checks that passed

- All 46 guest polygons have at least three vertices and positive area.
- All 46 guest polygons lie within their declared SVG viewBox.
- No duplicate guest polygon geometry was found.
- No guest-to-guest bounding-box overlap was found.
- The validation overlays use the exact SVG-native coordinates scaled uniformly by 0.8 to the packaged preview dimensions. There are no CSS-percentage coordinates.
- Gross visual inspection shows no candidate extending into a neighboring guestroom or across a main corridor.
- The source’s internal CAD transform matrices do not change the root coordinate system used by the mapping arrays; rendered overlays remain aligned under uniform scaling.

### Blocking or uncertain findings

1. **No production polygon IDs or metadata.** `room-polygons.json:14-63` stores anonymous point arrays. `preview-l1.svg` through `preview-l4.svg` generate plain `<polygon>` elements without `id`, `data-property-id`, `data-room-id`, or `data-room-name`. This fails the interactive identity contract.
2. **Wall-face accuracy is not certified.** Every guest candidate is an axis-aligned four-point rectangle. The overlays appear grossly aligned, but several borders sit very close to visible wall strokes. The larger L4 suites (401, 403, 407, 414, 416) include internal partitions and require explicit confirmation of which en-suite/internal zones belong to the selectable room footprint. A screenshot alone is insufficient proof.
3. **No vector collision test against wall paths.** The CAD wall paths have many nested transforms and are not represented as closed semantic room boundaries. The audit can prove no candidate-to-candidate overlap, but cannot mathematically prove that every candidate excludes all wall thickness and door threshold geometry without an architect-approved boundary layer.
4. **Architectural room 106 has no CSV record.** It is visible on L1 and recorded under `architectural_unmapped` at `room-polygons.json:73`. No `1106` record exists; no ID may be invented.
5. **Room 1313 discrepancy.** `rooms_2026_10_21_1005.csv:14` marks room ID 146/name 1313 active (`Yes`), while business instruction says NOT IN USE. The mapping correctly supplies no polygon and excludes it from 46-room coverage. The database record was not changed.
6. **Ambiguous/facility records.** ID 172 Lobby Area is open to bar/circulation; ID 173 is one bathroom record against separate L1 MALE/FEMALE rooms; ID 174 has name `1200` but type `Bath Room Floor 3st`; ID 175 Kitchen Room has no separately bounded L4 kitchen label. These remain noninteractive/unmapped.
7. **Operational ID 198.** Name `1300`, type `Share bashroom men.`, is visually associated with L3 WC MEN, but its rectangle is noninteractive and still requires boundary sign-off.
8. **No standalone original PDF.** The manifest-named upstream `Master Plan L1-L4(1).pdf` is absent, limiting provenance verification to the packaged vector PDF/SVG/previews.

No confirmed red-status polygon (outside the building, crossing a main corridor, or overlapping another guest candidate) was found. Yellow in the previews means geometric candidate requiring manual certification; gray means unmapped/excluded. Architectural wall and door linework remains visible above or through the transparent fills.

## F. Mobile Readiness

### Verified asset compatibility

- PASS: every SVG has a valid `viewBox`, so it can scale on desktop, tablet, and mobile without changing mapping coordinates.
- PASS: mapping coordinates share each SVG’s native coordinate system; uniform responsive scaling preserves alignment.
- PASS: the source is vector-only, so zoom does not rasterize architectural linework.
- CONDITIONAL: fixed `width`/`height` attributes exist, but a future container can override rendered dimensions while retaining the viewBox. Responsive behavior must be implemented deliberately.
- CONDITIONAL: some room targets are narrow at whole-floor mobile scale; touch hit areas and label density need product/accessibility design.

### NOT TESTABLE

No Siam floor-plan component exists outside the preparation directory. Repository search found no implementation consuming these mappings. Therefore the following are **NOT TESTABLE**, not PASS:

- pinch zoom;
- pan and gesture arbitration;
- tap/keyboard selection;
- selected/hover/focus states;
- Room Details Bottom Sheet;
- zoom/pan transform synchronization between architecture and hit targets;
- screen-reader names and focus order;
- desktop/tablet/mobile layout integration.

## G. Approval Decision and Acceptance Criteria

### **NOT READY**

Blockers before integration approval:

1. Assign a stable unique polygon ID to every one of the 46 active guest polygons.
2. Define and validate `data-property-id="PE17D8D2C"`, exact numeric `data-room-id`, and exact CSV `data-room-name` for every interactive element, or an equivalently strict runtime binding with automated tests.
3. Obtain architectural/manual sign-off that each polygon is inside the intended room’s inner wall faces and does not include corridor, neighboring room, unrelated shaft, or public-area geometry. Pay particular attention to the large L4 suites.
4. Resolve room 106 against authoritative property data without inventing an ID.
5. Confirm the operational treatment of IDs 172, 173, 174, 175, and 198.
6. Preserve ID 146/1313 as noninteractive while resolving the database/business-status discrepancy outside this audit.
7. Supply or archive the manifest-named original PDF if provenance against the upstream drawing is required.
8. After a component exists, test responsive scaling, pinch zoom, pan, tap/keyboard selection, bottom-sheet behavior, and accessibility on representative desktop, tablet, iOS, and Android environments.

Approval can move to **CONDITIONAL** after metadata and architectural boundary sign-off are complete. It can move to **APPROVED** only after all 46 active rooms pass the interactive and responsive acceptance tests and all blocking data discrepancies are resolved or explicitly accepted by the product/property owner.

## Validation Preview Outputs

- `floorplan-sources/siam/validation/L1_mapping_preview.png`
- `floorplan-sources/siam/validation/L2_mapping_preview.png`
- `floorplan-sources/siam/validation/L3_mapping_preview.png`
- `floorplan-sources/siam/validation/L4_mapping_preview.png`

The previews are audit artifacts generated from the packaged architectural PNG renderings plus the existing mapping coordinates. They do not modify the source SVGs and are not proof of physical-building accuracy.
