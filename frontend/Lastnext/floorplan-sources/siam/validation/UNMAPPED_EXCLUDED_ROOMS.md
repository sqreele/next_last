# Siam Unmapped and Excluded Rooms

> Historical exception snapshot. Current product decisions cancel mappings 106 and 1313 and resolve Lobby/L1 WC/L3 WC mapping as documented in `app/lib/floorplans/siam/validation-report.md`.

Property ID: `PE17D8D2C`

## Excluded guestroom

| Floor | Room Name | Room ID | CSV Active | Polygon | Status | Reason |
|---|---|---:|---|---|---|---|
| L3 | 1313 | 146 | Yes | None | `excluded_not_in_use` | Business rule says the room is not in use; no 313 room is shown on the drawing. |

The CSV/database record is preserved and unmodified. Room 1313 is not counted in the 46 active candidates.

## Unmapped architectural guestroom

| Floor | Architectural Label | Room ID | Interactive Polygon | Status | Reason |
|---|---|---|---|---|---|
| L1 | 106 | None | None | `unmapped` | Room is visible and bounded on the drawing, but no corresponding property CSV record exists. |

The existing gray validation outline is retained only for audit visibility. No room ID or interactive identity was invented.

## Operational records requiring separate approval

| Floor | Room Name | Room ID | Type | Current Status | Issue |
|---|---|---:|---|---|---|
| L1 | 1000 | 172 | Lobby Area | `needs_review` | Lobby is open to bar and circulation without a complete bounded room. |
| L1 | 1100 | 173 | Bath Room Floor 1 st | `needs_review` | One database record versus separate MALE and FEMALE rooms. |
| Unknown | 1200 | 174 | Bath Room Floor 3st | `needs_review` | Name prefix suggests L2 while type says floor 3. |
| L4 | 1400 | 175 | Kitchen Room | `unmapped` | No independently bounded L4 kitchen room label. |
| L3 | 1300 | 198 | Share bashroom men. | `mapped_noninteractive` | Gross match to WC MEN; boundary and operational behavior need approval. |

