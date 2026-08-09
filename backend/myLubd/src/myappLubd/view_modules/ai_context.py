import re
from datetime import timedelta
from difflib import SequenceMatcher

from django.db.models import Q
from django.utils import timezone

from ..models import Area, Property, Room, Topic


def _normalize_search_text(value):
    return ''.join(char.lower() for char in str(value or '') if char.isalnum())


def _resolve_property(property_name=None):
    search = str(property_name or '').strip()
    if not search:
        return None, None

    properties = list(Property.objects.all())
    normalized_search = _normalize_search_text(search)

    for prop in properties:
        if search.lower() == prop.name.lower() or search.lower() == prop.property_id.lower():
            return prop, None

    for prop in properties:
        if normalized_search and (
            normalized_search in _normalize_search_text(prop.name)
            or normalized_search in _normalize_search_text(prop.property_id)
        ):
            return prop, None

    best_property = None
    best_score = 0
    for prop in properties:
        score = max(
            SequenceMatcher(None, normalized_search, _normalize_search_text(prop.name)).ratio(),
            SequenceMatcher(None, normalized_search, _normalize_search_text(prop.property_id)).ratio(),
        )
        if score > best_score:
            best_property = prop
            best_score = score

    if best_property and best_score >= 0.72:
        return best_property, None

    return None, {
        'requested_property': search,
        'available_properties': [
            {'property_id': prop.property_id, 'name': prop.name}
            for prop in properties
        ],
    }


def _resolve_room(room_name=None, property_obj=None):
    search = str(room_name or '').strip()
    if not search:
        return None, None

    rooms = Room.objects.all()
    if property_obj:
        rooms = rooms.filter(properties=property_obj)
    rooms = list(rooms.distinct())
    normalized_search = _normalize_search_text(search)

    for room in rooms:
        if search.lower() == room.name.lower() or search == str(room.room_id):
            return room, None

    for room in rooms:
        if normalized_search and (
            normalized_search in _normalize_search_text(room.name)
            or normalized_search in _normalize_search_text(room.room_type)
            or normalized_search == str(room.room_id)
        ):
            return room, None

    best_room = None
    best_score = 0
    for room in rooms:
        score = max(
            SequenceMatcher(None, normalized_search, _normalize_search_text(room.name)).ratio(),
            SequenceMatcher(None, normalized_search, _normalize_search_text(room.room_type)).ratio(),
        )
        if score > best_score:
            best_room = room
            best_score = score

    if best_room and best_score >= 0.72:
        return best_room, None

    return None, {
        'requested_room': search,
        'available_rooms': [
            {
                'room_id': room.room_id,
                'name': room.name,
                'room_type': room.room_type,
            }
            for room in rooms
        ],
    }


def _resolve_topic(category_name=None):
    search = str(category_name or '').strip()
    if not search:
        return None, None

    topics = list(Topic.objects.all())
    normalized_search = _normalize_search_text(search)
    alias_map = {
        'air': ['air', 'hvac', 'ac', 'แอร์', 'ปรับอากาศ'],
        'ac': ['air', 'hvac', 'ac', 'แอร์', 'ปรับอากาศ'],
        'hvac': ['air', 'hvac', 'ac', 'แอร์', 'ปรับอากาศ'],
        'ระบบแอร์': ['air', 'hvac', 'ac', 'แอร์', 'ปรับอากาศ'],
        'แอร์': ['air', 'hvac', 'ac', 'แอร์', 'ปรับอากาศ'],
        'เครื่องปรับอากาศ': ['air', 'hvac', 'ac', 'แอร์', 'ปรับอากาศ'],
    }

    for topic in topics:
        if search.lower() == topic.title.lower():
            return topic, None

    for topic in topics:
        normalized_title = _normalize_search_text(topic.title)
        if normalized_search and (
            normalized_search in normalized_title
            or normalized_title in normalized_search
        ):
            return topic, None

    aliases = alias_map.get(search.lower()) or alias_map.get(search)
    if aliases:
        for topic in topics:
            title = topic.title.lower()
            normalized_title = _normalize_search_text(topic.title)
            if any(alias.lower() in title or _normalize_search_text(alias) in normalized_title for alias in aliases):
                return topic, None

    best_topic = None
    best_score = 0
    for topic in topics:
        score = SequenceMatcher(None, normalized_search, _normalize_search_text(topic.title)).ratio()
        if score > best_score:
            best_topic = topic
            best_score = score

    if best_topic and best_score >= 0.55:
        return best_topic, None

    return None, {
        'requested_category': search,
        'available_categories': [
            {'id': topic.id, 'title': topic.title}
            for topic in topics
        ],
    }


def _should_force_summary_tool(message):
    normalized = message.lower()
    if _should_force_today_tool(message):
        return False
    keywords = [
        'category',
        'topic',
        'pm',
        'preventive',
        'สาขา',
        'property',
        'ห้อง',
        'room',
        'รายงาน',
        'สรุปรายงาน',
        'ผู้รายงาน',
        'ผู้ซ่อม',
        'คนซ่อม',
        'ช่าง',
        'ทำการซ่อม',
        'ผู้ปฏิบัติงาน',
        'คนแจ้ง',
        'แจ้งมากที่สุด',
        'แต่ละเดือน',
        'รายเดือน',
        'รายปี',
        'แยกปี',
        'แยกเดือน',
        'เสียบ่อย',
        'รายละเอียดงาน',
        'รายละเอียดของงาน',
        'หมวดหมู่',
        'ประเภทงาน',
        'ระบบแอร์',
        'แอร์',
        'งานซ่อม',
        'งานประจำ',
        'ประจำเดือน',
        'ประจำปี',
        'รายเดือน',
        'รายปี',
        'recurring',
        'routine',
        'schedule',
    ]
    return any(keyword in normalized for keyword in keywords)


def _should_force_today_tool(message):
    normalized = str(message or '').lower()
    today_keywords = ['วันนี้', 'today', 'todays', "today's"]
    maintenance_keywords = ['แจ้งซ่อม', 'งานซ่อม', 'repair request', 'work order', 'maintenance job']
    return (
        any(keyword in normalized for keyword in today_keywords)
        and any(keyword in normalized for keyword in maintenance_keywords)
    )


def _should_force_recurring_tool(message):
    normalized = message.lower()
    if any(keyword in normalized for keyword in ['แจ้งซ่อม', 'งานซ่อม', 'repair request', 'work order']):
        return False

    explicit_recurring_keywords = [
        'งานประจำ',
        'ตารางงาน',
        'งานซ้ำ',
        'recurring',
        'routine',
        'schedule',
    ]
    if any(keyword in normalized for keyword in explicit_recurring_keywords):
        return True

    pm_keywords = ['pm', 'preventive', 'preventive maintenance']
    frequency_keywords = ['ประจำเดือน', 'ประจำปี', 'รายเดือน', 'รายปี', 'เดือนนี้', 'เดือนหน้า', 'monthly', 'annual', 'yearly', 'this month', 'next month']
    return (
        any(keyword in normalized for keyword in pm_keywords)
        and any(keyword in normalized for keyword in frequency_keywords)
    )


def _extract_year_month_from_message(message):
    text = str(message or '')
    normalized = text.lower()
    year = None
    month = None
    year_match = re.search(r'(20\d{2}|25\d{2})', text)
    if year_match:
        year = int(year_match.group(1))
        if year >= 2400:
            year -= 543

    today = timezone.localdate()
    if any(keyword in normalized for keyword in ['เดือนนี้', 'this month', 'current month']):
        year = year or today.year
        month = today.month
    elif any(keyword in normalized for keyword in ['เดือนหน้า', 'next month']):
        next_month = today.replace(day=28) + timedelta(days=4)
        year = year or next_month.year
        month = next_month.month

    month_match = re.search(r'(?:เดือน|month)\s*(\d{1,2})', text, flags=re.IGNORECASE)
    if month_match:
        parsed_month = int(month_match.group(1))
        if 1 <= parsed_month <= 12:
            month = parsed_month
    thai_months = {
        'มกราคม': 1,
        'ม.ค.': 1,
        'กุมภาพันธ์': 2,
        'ก.พ.': 2,
        'มีนาคม': 3,
        'มี.ค.': 3,
        'เมษายน': 4,
        'เม.ย.': 4,
        'พฤษภาคม': 5,
        'พ.ค.': 5,
        'มิถุนายน': 6,
        'มิ.ย.': 6,
        'กรกฎาคม': 7,
        'ก.ค.': 7,
        'สิงหาคม': 8,
        'ส.ค.': 8,
        'กันยายน': 9,
        'ก.ย.': 9,
        'ตุลาคม': 10,
        'ต.ค.': 10,
        'พฤศจิกายน': 11,
        'พ.ย.': 11,
        'ธันวาคม': 12,
        'ธ.ค.': 12,
    }
    for month_name, month_number in thai_months.items():
        if month_name in text:
            month = month_number
            break
    if month and not year:
        year = today.year
    return year, month


def _extract_frequency_from_message(message):
    normalized = str(message or '').lower()
    if any(keyword in normalized for keyword in ['รายปี', 'ประจำปี', 'annual', 'yearly']):
        return 'annual'
    if any(keyword in normalized for keyword in ['รายเดือน', 'ประจำเดือน', 'เดือนนี้', 'เดือนหน้า', 'monthly', 'this month', 'next month']):
        return 'monthly'
    return ''


def _extract_property_name_from_message(message):
    text = str(message or '')
    normalized_text = _normalize_search_text(text)
    if not normalized_text:
        return ''

    properties = list(Property.objects.all())
    for prop in properties:
        candidates = [prop.name, prop.property_id]
        for candidate in candidates:
            normalized_candidate = _normalize_search_text(candidate)
            if normalized_candidate and normalized_candidate in normalized_text:
                return str(candidate)

    match = re.search(r'(?:property|สาขา)\s*[:：-]?\s*([A-Za-z0-9ก-๙ _.-]+)', text, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()

    return ''


def _property_required_reply():
    properties = list(Property.objects.order_by('name').values('property_id', 'name')[:20])
    if properties:
        property_list = ', '.join(
            f"{prop['name']} ({prop['property_id']})" if prop.get('property_id') else prop['name']
            for prop in properties
        )
        return f'ต้องการข้อมูลของ property อะไรครับ/คะ? กรุณาระบุชื่อสาขาหรือ property id ก่อน เช่น {property_list}'
    return 'ต้องการข้อมูลของ property อะไรครับ/คะ? กรุณาระบุชื่อสาขาหรือ property id ก่อน'


def _requires_property_before_tool(message):
    return _should_force_today_tool(message) or _should_force_recurring_tool(message) or _should_force_summary_tool(message)

def _extract_room_name_from_message(message):
    match = re.search(r'(?:ห้อง|room)\s*([A-Za-z0-9ก-๙_-]+)', message, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    return ''


def _extract_category_name_from_message(message):
    text = str(message or '')
    normalized_text = _normalize_search_text(text)
    if not normalized_text:
        return ''

    for topic in Topic.objects.all():
        normalized_title = _normalize_search_text(topic.title)
        if normalized_title and normalized_title in normalized_text:
            return topic.title

    matches = re.findall(
        r'งาน\s*([A-Za-z0-9ก-๙ _.-]+?)(?:มี|อยู่|ของ|$)',
        text,
        flags=re.IGNORECASE,
    )
    for candidate in reversed(matches):
        category = candidate.strip()
        normalized_category = category.lower()
        if category and not any(skip in normalized_category for skip in ['category', 'topic', 'หมวดหมู่', 'ประเภท', 'แต่ละ', 'เเต่ละ']):
            return category

    return ''

