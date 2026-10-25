# Lub d Bangkok Siam floor-plan validation

Property ID: `PE17D8D2C`  
Scope: SVG mapping preparation and validation; no Dashboard deployment or database mutation.

## Source decision

The authoritative source for mapping is `Siam_Updated_Vector_FloorPlans_L1-L4.zip` (2026-10-24), whose packaged SVG files are byte-for-byte identical to the four public SVGs. Its manifest identifies the upstream file as `Master Plan L1-L4(1).pdf` and marks all four pages as vector.

The earlier `StayMaint_Clean_Floor_Plans.pdf` (2026-10-21) is a four-page rasterized PDF with one full-page image per page. Visual comparison found this sequence:

1. L1
2. L3
3. L2
4. L3 duplicated

It therefore has no valid fourth-floor geometry. The new package preserves the recognizable L1–L3 layouts and adds the distinct 4xx L4 layout.

## SVG asset inventory and vector validation

| Asset | Bytes | SHA-256 | Native size / viewBox | Groups | Paths | XML | Raster images |
| --- | ---: | --- | --- | ---: | ---: | --- | --- |
| `floor-l1.svg` | 4,963,126 | `1e0b4307bc77e08b8f613c144a61fae1345aa42c52b8d248bd0eca87ccf12796` | 1610×915 / `0 0 1610 915` | 769 | 26,083 | valid | none |
| `floor-l2.svg` | 4,245,564 | `e181e906191eb3bc5eab0a7e12923e3aceaa110e65fa3ba92d8335ae56175be8` | 1475×1060 / `0 0 1475 1060` | 813 | 22,071 | valid | none |
| `floor-l3.svg` | 3,588,634 | `a0ec2b1970dfb3c7887d56137a37fec6aa9296c25a0f15373701be120e581925` | 1475×1050 / `0 0 1475 1050` | 447 | 18,802 | valid | none |
| `floor-l4.svg` | 7,263,164 | `60a9bae50d0fbfd2f9720eec4a3a9cb3485bf209801ab54a0656d3635ed7641d` | 1505×1090 / `0 0 1505 1090` | 698 | 40,465 | valid | none |

All source SVGs are path/group-only vector exports: no `<image>` elements, data URIs, or external raster references were found. Labels are converted to path outlines, so the source has no editable `<text>` nodes. XML parsing succeeds for the four sources and four generated previews. The public SVGs were not modified.

## Floor identification and architectural content

| Floor | Drawing evidence | Confirmed guest labels | Vertical circulation and operational features | Remaining annotations |
| --- | --- | --- | --- | --- |
| L1 | Title fragment says L1; room labels are 101–106 | 101, 102, 103, 104, 105; **106 cancelled from mapping** | central lift; stair by bar/lobby; terrace ramp; mapped lobby and male/female WCs; bar, service, office, maid, linen, pump and electric rooms | grids, dimensions, level marker, F.H.C., furniture/fixture tags, title/scale fragment |
| L2 | Room labels are 201–212 | 201–212 | central lift; two stair zones; corridors; theater room | grids, dimensions, level callouts, F.H.C., door/window/fixture tags |
| L3 | Room labels are 301–312, 314–315; no 313 | 301–312, 314, 315; database room **1313 cancelled from mapping** | central lift; two stair zones; corridors; mapped WC MEN and WC WOMEN | grids, dimensions, level callouts, F.H.C., `SEE DETAIL ST.1`, door/window/fixture tags |
| L4 | Distinct plan with 4xx labels | 401–412, 414–416 | central lift; stairs; corridors; in-room wet areas | grids, fixture/furniture tags, F.H.C., title fragment; no bounded room labeled Kitchen Room |

Walls, room partitions, door leaves/swings, stairs, lifts, sanitary fixtures, and room boundaries remain vector geometry. No architectural geometry was edited or simplified.

## CSV validation

Only rows whose `Properties` value begins with `PE17D8D2C - Lub d Bangkok Siam` were used. The CSV columns were interpreted as follows:

- `Room ID` → database `room_id`
- `Name` → database room name; the first digit is the floor namespace (`1101` → architectural `101`)
- `Room Type` → room type
- `Is Active` → boolean (`Yes`)
- `Properties` → property ID/name

All 52 rows in the supplied CSV belong to the requested property and are active. They comprise 47 guest-room records and five operational records. Product scope cancels room ID 146 (`1313`) from all active mapping collections without changing its CSV/database record, leaving 46 mapped guest rooms.

## Mapping coverage

| Floor | Eligible guest records | Mapped | Coverage | Exceptions |
| --- | ---: | ---: | ---: | --- |
| L1 | 5 | 5 | 100% | 106 cancelled; Lobby ID 172 mapped; WC MALE and WC FEMALE mapped as separate zones sharing ID 173 |
| L2 | 12 | 12 | 100% | Operational ID 174 has conflicting floor evidence |
| L3 | 14 | 14 | 100% | ID 146/1313 cancelled; WC MEN mapped to ID 198; WC WOMEN mapped without a DB room identity |
| L4 | 15 | 15 | 100% | Operational ID 175/Kitchen Room is unmapped |
| **Total** | **46** | **46** | **100%** | Two cancelled mappings (106 and 1313); five operational SVG zones mapped |

The 46 eligible guest polygons are mutually non-overlapping and all vertices lie inside their floor viewBox. They use the source SVG coordinate systems and are inset from visible outer wall faces. Door swings, corridors, neighboring guest rooms, and open common areas are excluded. Larger L4 guest suites use their outer suite boundary and include their own en-suite/internal zones, not adjacent circulation.

## Operational mapping decisions

- **L1 Lobby Area:** `siam-l1-lobby` is mapped to Room ID **172 / 1000**. Because Lobby and Bar are physically open, the lower edge is an explicit product/UI boundary rather than a closed architectural wall.
- **L1 WC MALE:** `siam-l1-wc-male` is mapped to Room ID **173 / 1100**.
- **L1 WC FEMALE:** `siam-l1-wc-female` is also mapped to Room ID **173 / 1100**. The two SVG zones intentionally share one database identity because only one L1 bathroom record exists.
- **L3 WC MEN:** `siam-l3-wc-male` is mapped to Room ID **198 / 1300**.
- **L3 WC WOMEN:** `siam-l3-wc-female` has validated SVG geometry but remains noninteractive because no matching database Room ID exists. No identity was invented.

## Cancelled and unresolved records

- Architectural L1 room **106** is cancelled from all active mapping collections by product decision. The drawing itself is not modified.
- Database room **146 / 1313** is cancelled from all active mapping collections by product decision. Its CSV/database row is not modified, and no 313 exists on the drawing.
- ID **174 / 1200 / Bath Room Floor 3st** remains unresolved: the name namespace suggests L2 while the room type says floor 3. No floor or polygon is assigned.
- ID **175 / 1400 / Kitchen Room** remains unresolved because no independently bounded `KITCHEN ROOM` label exists on L4.

## Prepared artifacts

- `room-polygons.json`: database associations and native-coordinate polygons for 46 guest rooms plus five operational SVG zones
- `coverage-report.json`: machine-readable coverage totals by floor
- `preview-l1.svg`, `preview-l2.svg`, `preview-l3.svg`, `preview-l4.svg`: separate validation overlays with green guest rooms, blue operational geometry, and remaining review markers
- `generate-previews.mjs`: deterministic preview generator; it references the unmodified public SVGs

## Remaining work before integration

1. Create a dedicated database Room record for L3 WC WOMEN if it must query jobs or become interactive; do not reuse WC MEN ID 198.
2. Resolve the floor identity of ID 174 and the missing L4 Kitchen Room boundary for ID 175.
3. Obtain sign-off on guest-room wall insets, the product-defined Lobby/Bar split, and the four WC boundaries.
4. If previews must be portable outside this repository, package or inline the source SVGs; the current preview files intentionally reference the original public assets.
5. Define and test the Dashboard rendering/hit-testing contract before production integration.
