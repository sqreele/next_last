"""Room-number conventions shared by API floor choices and admin reports."""
import re


def floor_from_room_name(room_name):
    room_name = str(room_name or '').strip()
    if not room_name:
        return None

    match = re.search(r'\d+', room_name)
    if not match:
        return None

    room_code = match.group(0)
    if len(room_code) == 4 and room_code.startswith('1') and room_code[1].isdigit():
        return room_code[1]
    if len(room_code) >= 3:
        return room_code[0]
    return None
