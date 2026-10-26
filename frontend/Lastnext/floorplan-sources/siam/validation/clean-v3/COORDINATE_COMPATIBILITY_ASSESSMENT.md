# Coordinate Compatibility Assessment — Siam clean-v3

## Readiness: NEEDS ADJUSTMENT

The new SVGs **must not replace the existing SVGs while the current polygon coordinates remain unchanged**. The drawing scale and orientation are compatible, but every one of the 46 interactive polygons needs the floor translation below.

| Floor | Required Δx | Required Δy | Shift magnitude | Interactive polygons | Transformed points inside new viewBox |
|---|---:|---:|---:|---:|---:|
| L1 | -41.88374 | 23.9302 | 48.24 | 5 | PASS |
| L2 | 4.51165 | 17.186 | 17.77 | 12 | PASS |
| L3 | 4.51165 | 6.6046 | 8.00 | 14 | PASS |
| L4 | -32.4651 | -3.3954 | 32.64 | 15 | PASS |

Transform rule: `x_new = x_old + Δx`; `y_new = y_old + Δy`. Scale is 1.0 on both axes; rotation is 0°. Values derive from the old and clean SVG PDF-space matrices and are corroborated by the matching vector path data.

## Findings

- Unchanged reuse misaligns **all 46** interactive polygons. Even when an unchanged polygon remains numerically inside the new viewBox, it no longer occupies the same architectural room.
- Translation-corrected coordinates for all 46 polygons remain inside their new floor viewBoxes.
- No interactive polygon is missing from the mapping. No polygon appears to require manual retracing based on geometry compatibility; all 46 require coordinate transformation.
- Manual wall-face/door/bathroom-boundary review remains required after translation. This validation does not promote any mapping from `needs_review` or certify architectural approval.
- Architectural room 106 remains a noninteractive reference: no room ID, polygon ID, or data attributes. It is shown only as a gray validation outline on L1.
- Room 1313 / Room ID 146 remains `interactive: false`, `mappingStatus: excluded_not_in_use`, with no points or polygon ID. L3 has no architectural room 313.

## Replacement recommendation

Do not copy clean-v3 into `public/floorplans/siam` yet. First create a reviewed mapping revision that applies the exact per-floor translations, regenerate application-level overlays, and manually verify each room boundary. Only then can replacement readiness be reconsidered. No original SVG or mapping file was changed for this validation.
