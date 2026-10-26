# SVG Comparison Report — Siam clean-v3

Status: **NEEDS ADJUSTMENT**

Property: Lub d Bangkok Siam (PE17D8D2C)

Scope: validation only; this report does not architecturally approve any room.

## Floor assignment

The four clean files are unambiguously assigned by filename, visible room numbering, and near-total same-floor vector-path identity:

- `floor-l1.svg` → L1 (architectural labels 101–106)
- `floor-l2.svg` → L2 (201–212)
- `floor-l3.svg` → L3 (301–312, 314–315; no 313)
- `floor-l4.svg` → L4 (401–412, 414–416)

The corresponding-floor unique path-definition match is 99.99% on every floor. Cross-floor matches are at most 1.49%, confirming the assignments.

## XML, dimensions, and geometry

All eight old/new SVGs were parsed successfully with Python standard-library ElementTree. Each root is an SVG element; each clean root has numeric `width`, `height`, and a zero-origin `viewBox` whose width and height equal those dimensions.

| Floor | Existing viewBox | Clean viewBox | Existing size | Clean size | Path elements old/new | Clean unique paths shared with old |
|---|---:|---:|---:|---:|---:|---:|
| L1 | 0 0 1610 915 | 0 0 1543.6744 806.4651 | 1610×915 | 1543.6744×806.4651 | 26083 / 26084 | 16872/16874 (99.99%) |
| L2 | 0 0 1475 1060 | 0 0 1443.6744 1073.907 | 1475×1060 | 1443.6744×1073.907 | 22071 / 22072 | 19518/19520 (99.99%) |
| L3 | 0 0 1475 1050 | 0 0 1448.3256 1066.9302 | 1475×1050 | 1448.3256×1066.9302 | 18802 / 18803 | 16643/16645 (99.99%) |
| L4 | 0 0 1505 1090 | 0 0 1434.3721 973.907 | 1505×1090 | 1434.3721×973.907 | 40465 / 40466 | 30387/30389 (99.99%) |

| Floor | Old paths | New paths | Old groups | New groups | Old clips | New clips | Old uses | New uses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| L1 | 26083 | 26084 | 769 | 770 | 11 | 12 | 186 | 186 |
| L2 | 22071 | 22072 | 813 | 814 | 9 | 10 | 137 | 137 |
| L3 | 18802 | 18803 | 447 | 448 | 9 | 10 | 162 | 162 |
| L4 | 40465 | 40466 | 698 | 699 | 11 | 12 | 110 | 110 |

The clean files contain one additional path, group, and clip path per floor. Inspection shows these are the new crop wrapper/full-page clip. All but two path instances per floor are byte-identical `d` data; the two exceptions are crop/clip paths. No raster `image` elements are present in the architectural SVGs. The floor drawing scale remains 1:1 and the underlying vector geometry is retained; the page crop and coordinate origin changed.

## Architectural comparison

The clean drawings show the same walls, room labels, fixtures, doors, circulation, and service areas as the corresponding existing drawings. The source geometry is repositioned by a floor-specific translation and clipped to a new page extent. This is a coordinate-system change even though the architecture is substantively the same.

Checksums and exact element counts are recorded in `validation-data.json`.
