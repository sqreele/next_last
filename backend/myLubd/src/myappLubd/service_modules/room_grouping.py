"""RoomGroupingService domain operations."""
from typing import Dict, List, Optional
import re
from collections import defaultdict


class RoomGroupingService:
    """
    Centralized room-floor grouping rules per property format.
    """

    PROPERTY_A = "A"  # 1xxx format: second digit = floor
    PROPERTY_B = "B"  # 2xx-6xx format: first digit = floor

    @staticmethod
    def get_floor_from_room_code(room_code: str, property_type: str) -> Optional[int]:
        """
        Parse floor number from room code using property-specific rules.
        Returns None when the room code does not match the expected pattern.
        """
        code = str(room_code).strip()

        if property_type == RoomGroupingService.PROPERTY_A:
            if re.fullmatch(r"1\d{3}", code):
                return int(code[1])
            return None

        if property_type == RoomGroupingService.PROPERTY_B:
            if re.fullmatch(r"\d{3}", code):
                return int(code[0])
            return None

        return None

    @staticmethod
    def group_room_codes_by_floor(
        room_codes: List[str],
        property_type: str
    ) -> Dict[int, List[str]]:
        """
        Group room codes by floor descending.
        """
        grouped: Dict[int, List[str]] = defaultdict(list)

        for room_code in room_codes:
            floor = RoomGroupingService.get_floor_from_room_code(room_code, property_type)
            if floor is not None:
                grouped[floor].append(str(room_code).strip())

        sorted_grouped: Dict[int, List[str]] = {}
        for floor in sorted(grouped.keys(), reverse=True):
            sorted_grouped[floor] = sorted(
                grouped[floor],
                key=lambda code: int(code)
            )

        return sorted_grouped
