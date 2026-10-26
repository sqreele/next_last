# Siam clean-v3 validation outputs

Overall replacement readiness: **NEEDS ADJUSTMENT**.

- `SVG_COMPARISON_REPORT.md`: XML, size, assignment, and vector-geometry comparison.
- `COORDINATE_COMPATIBILITY_ASSESSMENT.md`: migration transform and recommendation.
- `ROOM_BY_ROOM_ALIGNMENT_ISSUES.csv`: all 46 interactive polygons plus the room 106 and room 1313 exclusions.
- `L1-polygon-overlay.svg` through `L4-polygon-overlay.svg`: red unchanged legacy polygons, green translation-corrected candidates, and gray noninteractive references.
- `source-floor-l1.svg` through `source-floor-l4.svg`: byte-for-byte clean-v3 copies used by the portable overlay previews.
- `validation-data.json`: checksums, element counts, transforms, and original/transformed points.

Open each overlay beside its sibling `source-floor-*.svg`. All overlay elements have `pointer-events="none"`; they are validation artifacts, not application assets.
