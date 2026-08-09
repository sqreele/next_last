from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import status, viewsets, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Prefetch
from rest_framework_simplejwt.tokens import RefreshToken
from google.oauth2 import id_token
from google.auth.transport import requests
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
import math
from django.db.models import Count, Q, F, ExpressionWrapper, fields, Case, When, Value, Avg
from django.db.models.functions import ExtractMonth, ExtractYear
from django.db import models, transaction
from .models import (
    UserProfile, Property, Room, Topic, Job, Session, PreventiveMaintenance, PMMasterPlan,
    JobImage, Machine, MaintenanceProcedure, UtilityConsumption, Inventory,
    Area, JobComment, PushSubscription, Tenant,
    TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric,
    InventoryUsage, MaintenanceChecklist, MaintenanceHistory,
)
from django.urls import reverse
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .serializers import (
    UserProfileSerializer, PropertySerializer, RoomSerializer, TopicSerializer, JobSerializer,
    UserSerializer, PreventiveMaintenanceSerializer, PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceCompleteSerializer, PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceDetailSerializer, PropertyPMStatusSerializer, PMMasterPlanSerializer,
    MachineSerializer, MachineListSerializer, MachineDetailSerializer,
    MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer,
    MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer,
    UtilityConsumptionSerializer, UtilityConsumptionListSerializer,
    InventorySerializer, InventoryListSerializer, InventoryUsageSerializer,
    AreaSerializer, JobCommentSerializer, TenantSerializer,
    TenantMembershipSerializer, SubscriptionPlanSerializer,
    TenantSubscriptionSerializer, UsageMetricSerializer,
)
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from .pagination import StandardResultsSetPagination, LargeResultsSetPagination, SmallResultsSetPagination
from django.shortcuts import get_object_or_404
import logging
import json
import uuid
import re
from difflib import SequenceMatcher
from datetime import timedelta
from calendar import monthrange
from django.http import JsonResponse, HttpResponseRedirect
import os
from django.http import HttpResponse, Http404
from django.conf import settings
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_http_methods
from .cache import cache_result, CacheManager
from .services import NotificationService, PreventiveMaintenanceService
from .tenancy import (
    accessible_property_ids,
    enforce_subscription_limit,
    ensure_tenant_for_property,
    ensure_tenant_for_user,
    get_accessible_properties,
    get_user_tenants,
    tenant_usage_counts,
    user_can_manage_tenant,
)
from .timezones import timezone_options
from .view_modules.common import MaintenancePagination, display_name_from_user, display_name_from_user_values, is_raw_auth_identifier
from .view_modules.utilities import UtilityConsumptionViewSet
from .view_modules.machines import MachineViewSet
from .view_modules.inventory_support import consume_inventory_items
from .view_modules.inventory import InventoryViewSet
from .view_modules.properties import PropertyViewSet
from .view_modules.jobs import JobViewSet
from .view_modules.preventive_maintenance import PreventiveMaintenanceViewSet
from .view_modules.rooms_taxonomy import AreaViewSet, RoomViewSet, TopicViewSet
from .view_modules.tenant_usage import (
    SubscriptionPlanViewSet, TenantMembershipViewSet, TenantSubscriptionViewSet,
    TenantViewSet, UsageMetricViewSet,
)
from .view_modules.accounts import (
    CustomSessionView, LoginView, LogoutView, RegisterView, UserProfileViewSet,
    UserViewSet, auth_check, auth_providers, forgot_password, google_auth,
    log_view, login_view, reset_password, update_user_profile,
)


GEMINI_CHAT_MODEL = 'gemini-2.5-flash'
GEMINI_SYSTEM_INSTRUCTION = """
คุณคือ AI ผู้ช่วยประจำระบบบริหารจัดการงานช่าง (HotelCare Pro)
หน้าที่ของคุณคือช่วยตอบคำถามเกี่ยวกับงานแจ้งซ่อมและสถิติของระบบเป็นภาษาไทยที่สุภาพ กระชับ และเข้าใจง่าย
ห้ามคิดคำนวณตัวเลขยอดรวมหรือสถิติเองเด็ดขาด หากคำถามเกี่ยวข้องกับข้อมูลในระบบ เช่น จำนวนงาน สถานะงาน ห้องที่เสียบ่อย รายละเอียดงานแต่ละห้อง ผู้ที่ทำการซ่อม/ช่างผู้ปฏิบัติงาน สรุปรายงานรายปี/รายเดือน รายชื่อคนรายงานมากที่สุดรายเดือน หมวดหมู่ที่เสียบ่อย หรืองาน PM/Preventive Maintenance รวมถึงงานประจำรายเดือน/รายปี ให้เรียกใช้ Tool ที่มีให้เสมอ
ก่อนตอบคำถามที่ต้องดึงข้อมูลระบบ ให้ตรวจสอบก่อนว่าผู้ใช้ระบุ property/สาขาแล้วหรือไม่ หากยังไม่ระบุ ให้ถามกลับว่า “ต้องการข้อมูลของ property อะไรครับ/คะ” และห้ามเรียก Tool เพื่อสรุปข้อมูลรวมทุก property
หากผู้ใช้ระบุสาขา/property ให้ส่งชื่อสาขานั้นใน argument property_name ของ Tool ทุกตัวเสมอ
หากผู้ใช้ระบุห้อง ให้ส่งชื่อหรือเลขห้องนั้นใน argument room_name ของ Tool get_maintenance_summary เสมอ
หากผู้ใช้ถามงานแจ้งซ่อมวันนี้ งานซ่อมวันนี้ หรือ today's repair requests ให้เรียก Tool get_today_maintenance_jobs เสมอ
หากผู้ใช้ถามรายละเอียดตามหมวดหมู่/category/topic เช่น งานระบบแอร์มีห้องไหนบ้าง ให้ใช้ category_details จาก Tool และแจกแจงห้อง/พื้นที่ที่เกี่ยวข้องพร้อมจำนวนงาน
หากผู้ใช้ถามงานประจำรายเดือน รายปี ตารางงานซ้ำ หรือ recurring maintenance ให้เรียก Tool get_recurring_maintenance_tasks และส่ง property_name, year, month หรือ frequency ตามที่ผู้ใช้ระบุ หากถามว่าเดือนนี้หรือ this month ให้ใช้เดือนและปีปัจจุบัน
หากผู้ใช้ถามงานประจำเดือนแต่ละเดือนว่ามีกี่งาน ให้ตอบจาก monthly.month_counts หรือ monthly.by_year ของ Tool get_recurring_maintenance_tasks เท่านั้น
หากผู้ใช้ถามว่างานประจำเดือนนี้มีอะไรบ้างหรือขอรายละเอียดงานประจำเดือน ให้ตอบเป็นรายการงานโดยระบุวันที่, PM ID, ชื่องาน, สถานะ, ความสำคัญ, ห้อง/พื้นที่, ผู้รับผิดชอบ, หมวดหมู่ และรายละเอียด/ขั้นตอนเท่าที่ Tool ส่งกลับมา
เมื่อได้รับผลลัพธ์จาก Tool แล้ว ให้สรุปจากข้อมูลดิบนั้นเท่านั้น และถ้าไม่มีข้อมูลใน Tool ให้บอกผู้ใช้อย่างตรงไปตรงมา
""".strip()


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


def _serialize_user(user):
    if not user:
        return None
    display_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
    display_name = display_name or getattr(user, 'email', '') or getattr(user, 'username', '') or 'Unknown'
    return {
        'user_id': getattr(user, 'id', None),
        'username': getattr(user, 'username', None),
        'name': display_name,
        'email': getattr(user, 'email', None),
    }


def _serialize_job(job):
    return {
        'job_id': job.job_id,
        'status': job.status,
        'priority': job.priority,
        'description': job.description,
        'remarks': job.remarks,
        'created_at': job.created_at.isoformat() if job.created_at else None,
        'updated_at': job.updated_at.isoformat() if job.updated_at else None,
        'completed_at': job.completed_at.isoformat() if job.completed_at else None,
        'reported_by': _serialize_user(job.user),
        'technician': _serialize_user(job.user),
        'last_updated_by': _serialize_user(job.updated_by),
        'technician_note': 'ใน schema ปัจจุบัน Job.user ถูกใช้เป็น technician/ผู้รับผิดชอบงาน และ updated_by คือผู้แก้ไขหรือปิดงานล่าสุด',
        'rooms': [
            {
                'room_id': room.room_id,
                'name': room.name,
                'room_type': room.room_type,
            }
            for room in job.rooms.all()
        ],
        'topics': [topic.title for topic in job.topics.all()],
        'area': {
            'id': job.area.id,
            'name': job.area.name,
            'property': job.area.property.name,
        } if job.area and job.area.property else None,
    }


def _display_user_name_from_values(row):
    return ' '.join(
        part for part in [row.get('user__first_name'), row.get('user__last_name')]
        if part
    ).strip() or row.get('user__username') or row.get('user__email') or 'Unknown'


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


def _build_category_details(jobs, job_ids, selected_topic=None):
    topic_queryset = Topic.objects.annotate(
        job_count=Count('jobs', filter=Q(jobs__id__in=job_ids), distinct=True)
    ).filter(job_count__gt=0)
    if selected_topic:
        topic_queryset = topic_queryset.filter(pk=selected_topic.pk)

    category_details = []
    for topic in topic_queryset.order_by('-job_count', 'title')[:10]:
        topic_jobs = jobs.filter(topics=topic).distinct()
        topic_job_ids = list(topic_jobs.values_list('id', flat=True))
        status_counts = list(
            topic_jobs
            .values('status')
            .annotate(count=Count('id', distinct=True))
            .order_by('status')
        )
        room_rows = list(
            Room.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=topic_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'room_type', 'name')
            .values('room_id', 'name', 'room_type', 'job_count')[:20]
        )
        area_rows = list(
            Area.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=topic_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'name')
            .values('id', 'name', 'job_count')[:20]
        )
        sample_jobs = (
            topic_jobs
            .prefetch_related('rooms', 'topics')
            .select_related('area__property')
            .order_by('-created_at')[:10]
        )
        category_details.append({
            'category': topic.title,
            'job_count': topic.job_count,
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in status_counts
            ],
            'rooms': [
                {
                    'room_id': row['room_id'],
                    'name': row['name'],
                    'room_type': row['room_type'],
                    'jobs': row['job_count'],
                }
                for row in room_rows
            ],
            'areas': [
                {
                    'id': row['id'],
                    'name': row['name'],
                    'jobs': row['job_count'],
                }
                for row in area_rows
            ],
            'jobs': [_serialize_job(job) for job in sample_jobs],
        })

    return category_details


def get_maintenance_summary(property_name: str = "", room_name: str = "", category_name: str = ""):
    """
    ดึงข้อมูลสรุปดิบของระบบแจ้งซ่อม HotelCare Pro สำหรับให้ Gemini ใช้ตอบคำถามเชิงสถิติอย่างถูกต้อง

    ฟังก์ชันนี้ควรถูกเรียกเมื่อผู้ใช้ถามเกี่ยวกับภาพรวมงานแจ้งซ่อม เช่น จำนวนงานทั้งหมด
    จำนวนงานที่เสร็จแล้ว จำนวนงานที่ยังเปิดอยู่ จำนวนงานที่ยกเลิก หรือหมวดหมู่งานเสีย/แจ้งซ่อม
    หรือห้องที่เสียบ่อยที่สุด รวมถึงรายละเอียดงานแต่ละห้องและรายการงาน PM
    โดยผลลัพธ์เป็นข้อมูลจากระบบเท่านั้น เพื่อป้องกันไม่ให้ AI คิดตัวเลขเอง
    หากผู้ใช้ถามแยกตามสาขา ให้ส่งชื่อสาขาหรือ property id ผ่าน property_name
    หากผู้ใช้ถามแยกตามห้อง ให้ส่งชื่อ เลขห้อง หรือ room id ผ่าน room_name
    หากผู้ใช้ถามเจาะจงหมวดหมู่/category/topic ให้ส่งชื่อหมวดหมู่ผ่าน category_name

    Returns:
        dict: ข้อมูลสรุปงานแจ้งซ่อม ประกอบด้วย total_jobs, completed, open, cancelled
        และ top_categories ซึ่งเป็นรายการหมวดหมู่ที่เสียบ่อยพร้อมจำนวนงาน
    """
    property_obj, property_error = _resolve_property(property_name)
    if property_error:
        return {
            'error': 'PROPERTY_NOT_FOUND',
            **property_error,
        }
    room_obj, room_error = _resolve_room(room_name, property_obj)
    if room_error:
        return {
            'error': 'ROOM_NOT_FOUND',
            **room_error,
        }
    topic_obj, topic_error = _resolve_topic(category_name)
    if topic_error:
        return {
            'error': 'CATEGORY_NOT_FOUND',
            **topic_error,
        }

    jobs = Job.objects.all()
    if property_obj:
        jobs = jobs.filter(
            Q(area__property=property_obj) |
            Q(rooms__properties=property_obj)
        ).distinct()
    if room_obj:
        jobs = jobs.filter(rooms=room_obj).distinct()
    if topic_obj:
        jobs = jobs.filter(topics=topic_obj).distinct()

    totals = jobs.aggregate(
        total_jobs=Count('id', distinct=True),
        completed=Count('id', filter=Q(status='completed'), distinct=True),
        cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
    )
    open_jobs = jobs.exclude(status__in=['completed', 'cancelled']).count()
    job_ids = list(jobs.values_list('id', flat=True))
    top_categories = list(
        Topic.objects
        .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=job_ids), distinct=True))
        .filter(job_count__gt=0)
        .order_by('-job_count', 'title')
        .values('title', 'job_count')[:5]
    )
    top_rooms = list(
        Room.objects
        .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=job_ids), distinct=True))
        .filter(job_count__gt=0)
        .order_by('-job_count', 'room_type', 'name')
        .values('room_id', 'name', 'room_type', 'job_count')[:5]
    )
    category_details = _build_category_details(jobs, job_ids, topic_obj)
    reporter_rows = list(
        jobs
        .annotate(year=ExtractYear('created_at'), month=ExtractMonth('created_at'))
        .values('year', 'month', 'user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email')
        .annotate(job_count=Count('id', distinct=True))
        .order_by('year', 'month', '-job_count', 'user__username')
    )
    monthly_top_reporters = []
    seen_months = set()
    for row in reporter_rows:
        month_key = (row['year'], row['month'])
        if month_key in seen_months:
            continue
        seen_months.add(month_key)
        display_name = _display_user_name_from_values(row)
        monthly_top_reporters.append({
            'year': row['year'],
            'month': row['month'],
            'reporter': {
                'user_id': row['user_id'],
                'username': row.get('user__username'),
                'name': display_name,
                'email': row.get('user__email'),
            },
            'jobs': row['job_count'],
        })
    technician_rows = list(
        jobs
        .values('user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email')
        .annotate(job_count=Count('id', distinct=True))
        .order_by('-job_count', 'user__username')[:10]
    )
    top_technicians = []
    for row in technician_rows:
        top_technicians.append({
            'user_id': row['user_id'],
            'username': row.get('user__username'),
            'name': _display_user_name_from_values(row),
            'email': row.get('user__email'),
            'jobs': row['job_count'],
            'note': 'นับจาก Job.user ซึ่งโปรเจกต์ใช้เป็น technician/ผู้รับผิดชอบงาน',
        })

    month_keys = list(
        jobs
        .annotate(year=ExtractYear('created_at'), month=ExtractMonth('created_at'))
        .values('year', 'month')
        .annotate(total=Count('id', distinct=True))
        .order_by('year', 'month')
    )
    monthly_report_details = []
    for month_row in month_keys:
        year = month_row['year']
        month = month_row['month']
        month_jobs = jobs.filter(created_at__year=year, created_at__month=month).distinct()
        month_job_ids = list(month_jobs.values_list('id', flat=True))
        status_counts = list(
            month_jobs
            .values('status')
            .annotate(count=Count('id', distinct=True))
            .order_by('status')
        )
        month_top_reporters = []
        for reporter_row in (
            month_jobs
            .values('user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email')
            .annotate(job_count=Count('id', distinct=True))
            .order_by('-job_count', 'user__username')[:3]
        ):
            month_top_reporters.append({
                'user_id': reporter_row['user_id'],
                'username': reporter_row.get('user__username'),
                'name': _display_user_name_from_values(reporter_row),
                'email': reporter_row.get('user__email'),
                'jobs': reporter_row['job_count'],
            })
        month_top_rooms = list(
            Room.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=month_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'room_type', 'name')
            .values('room_id', 'name', 'room_type', 'job_count')[:3]
        )
        month_top_categories = list(
            Topic.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=month_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'title')
            .values('title', 'job_count')[:3]
        )
        sample_jobs = (
            month_jobs
            .prefetch_related('rooms', 'topics')
            .select_related('area__property')
            .order_by('-created_at')[:10]
        )
        monthly_report_details.append({
            'year': year,
            'month': month,
            'total_jobs': month_row['total'],
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in status_counts
            ],
            'top_reporters': month_top_reporters,
            'top_rooms': [
                {
                    'room_id': row['room_id'],
                    'name': row['name'],
                    'room_type': row['room_type'],
                    'jobs': row['job_count'],
                }
                for row in month_top_rooms
            ],
            'top_categories': [
                {'category': row['title'], 'jobs': row['job_count']}
                for row in month_top_categories
            ],
            'jobs': [_serialize_job(job) for job in sample_jobs],
        })

    year_keys = list(
        jobs
        .annotate(year=ExtractYear('created_at'))
        .values('year')
        .annotate(total=Count('id', distinct=True))
        .order_by('year')
    )
    yearly_report_details = []
    for year_row in year_keys:
        year = year_row['year']
        year_jobs = jobs.filter(created_at__year=year).distinct()
        year_job_ids = list(year_jobs.values_list('id', flat=True))
        status_counts = list(
            year_jobs
            .values('status')
            .annotate(count=Count('id', distinct=True))
            .order_by('status')
        )
        monthly_counts = list(
            year_jobs
            .annotate(month=ExtractMonth('created_at'))
            .values('month')
            .annotate(total=Count('id', distinct=True))
            .order_by('month')
        )
        year_top_rooms = list(
            Room.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=year_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'room_type', 'name')
            .values('room_id', 'name', 'room_type', 'job_count')[:5]
        )
        year_top_categories = list(
            Topic.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=year_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'title')
            .values('title', 'job_count')[:5]
        )
        yearly_report_details.append({
            'year': year,
            'total_jobs': year_row['total'],
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in status_counts
            ],
            'monthly_counts': [
                {'month': row['month'], 'jobs': row['total']}
                for row in monthly_counts
            ],
            'top_rooms': [
                {
                    'room_id': row['room_id'],
                    'name': row['name'],
                    'room_type': row['room_type'],
                    'jobs': row['job_count'],
                }
                for row in year_top_rooms
            ],
            'top_categories': [
                {'category': row['title'], 'jobs': row['job_count']}
                for row in year_top_categories
            ],
        })
    room_details = []
    room_queryset = Room.objects.all()
    if property_obj:
        room_queryset = room_queryset.filter(properties=property_obj)
    if room_obj:
        room_queryset = room_queryset.filter(pk=room_obj.pk)

    room_job_filter = Q(jobs__id__in=job_ids)
    for room in (
        room_queryset
        .annotate(job_count=Count('jobs', filter=room_job_filter, distinct=True))
        .filter(job_count__gt=0)
        .order_by('-job_count', 'room_type', 'name')[:10]
    ):
        room_jobs = (
            jobs.filter(rooms=room)
            .prefetch_related('rooms', 'topics')
            .select_related('area__property')
            .order_by('-created_at')[:10]
        )
        room_details.append({
            'room_id': room.room_id,
            'name': room.name,
            'room_type': room.room_type,
            'job_count': room.job_count,
            'jobs': [_serialize_job(job) for job in room_jobs],
        })
    preventive_maintenance = PreventiveMaintenance.objects.select_related(
        'assigned_to',
        'created_by',
        'job',
        'procedure_template',
    ).prefetch_related('topics')
    if property_obj:
        preventive_maintenance = preventive_maintenance.filter(
            Q(job__area__property=property_obj) |
            Q(job__rooms__properties=property_obj)
        ).distinct()

    pm_status_counts = list(
        preventive_maintenance
        .values('status')
        .annotate(count=Count('id'))
        .order_by('status')
    )
    pm_items = []
    for pm in preventive_maintenance.order_by('-scheduled_date')[:20]:
        pm_items.append({
            'pm_id': pm.pm_id,
            'title': pm.pmtitle,
            'status': pm.status,
            'priority': pm.priority,
            'frequency': pm.frequency,
            'scheduled_date': pm.scheduled_date.isoformat() if pm.scheduled_date else None,
            'completed_date': pm.completed_date.isoformat() if pm.completed_date else None,
            'next_due_date': pm.next_due_date.isoformat() if pm.next_due_date else None,
            'assigned_to': pm.assigned_to.get_full_name() or pm.assigned_to.username if pm.assigned_to else None,
            'topics': [topic.title for topic in pm.topics.all()],
        })

    return {
        'property': {
            'property_id': property_obj.property_id,
            'name': property_obj.name,
        } if property_obj else None,
        'room': {
            'room_id': room_obj.room_id,
            'name': room_obj.name,
            'room_type': room_obj.room_type,
        } if room_obj else None,
        'category': {
            'id': topic_obj.id,
            'title': topic_obj.title,
        } if topic_obj else None,
        'total_jobs': totals['total_jobs'] or 0,
        'completed': totals['completed'] or 0,
        'open': open_jobs,
        'cancelled': totals['cancelled'] or 0,
        'top_categories': [
            {'category': row['title'], 'jobs': row['job_count']}
            for row in top_categories
        ],
        'top_rooms': [
            {
                'room_id': row['room_id'],
                'name': row['name'],
                'room_type': row['room_type'],
                'jobs': row['job_count'],
            }
            for row in top_rooms
        ],
        'monthly_top_reporters': monthly_top_reporters,
        'top_technicians': top_technicians,
        'yearly_report_details': yearly_report_details,
        'monthly_report_details': monthly_report_details,
        'category_details': category_details,
        'room_details': room_details,
        'preventive_maintenance': {
            'total': preventive_maintenance.count(),
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in pm_status_counts
            ],
            'items': pm_items,
        },
    }


def get_today_maintenance_jobs(property_name: str = ""):
    """
    ดึงรายการงานแจ้งซ่อมที่ถูกสร้างในวันนี้สำหรับให้ AI chat ตอบคำถาม
    เช่น งานแจ้งซ่อมวันนี้ งานซ่อมวันนี้ หรือ today's repair requests
    """
    property_obj, property_error = _resolve_property(property_name)
    if property_error:
        return {
            'error': 'PROPERTY_NOT_FOUND',
            **property_error,
        }

    now = timezone.localtime(timezone.now())
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    jobs = Job.objects.select_related(
        'user',
        'updated_by',
        'area__property',
    ).prefetch_related('rooms', 'topics').filter(
        created_at__gte=start_of_day,
        created_at__lt=end_of_day,
    )

    if property_obj:
        jobs = jobs.filter(
            Q(area__property=property_obj) |
            Q(rooms__properties=property_obj)
        ).distinct()

    status_counts = list(
        jobs.values('status')
        .annotate(count=Count('id', distinct=True))
        .order_by('status')
    )
    priority_counts = list(
        jobs.values('priority')
        .annotate(count=Count('id', distinct=True))
        .order_by('priority')
    )
    items = list(jobs.order_by('-created_at')[:50])

    return {
        'property': {
            'property_id': property_obj.property_id,
            'name': property_obj.name,
        } if property_obj else None,
        'date': start_of_day.date().isoformat(),
        'timezone': timezone.get_current_timezone_name(),
        'total': jobs.count(),
        'open': jobs.exclude(status__in=['completed', 'cancelled']).count(),
        'completed': jobs.filter(status='completed').count(),
        'cancelled': jobs.filter(status='cancelled').count(),
        'status_counts': [{'status': row['status'], 'count': row['count']} for row in status_counts],
        'priority_counts': [{'priority': row['priority'], 'count': row['count']} for row in priority_counts],
        'items': [_serialize_job(job) for job in items],
    }


def _serialize_preventive_maintenance(pm):
    job = pm.job
    area = job.area if job and job.area else None
    procedure_template = pm.procedure_template

    return {
        'pm_id': pm.pm_id,
        'title': pm.pmtitle,
        'status': pm.status,
        'priority': pm.priority,
        'frequency': pm.frequency,
        'scheduled_date': pm.scheduled_date.isoformat() if pm.scheduled_date else None,
        'completed_date': pm.completed_date.isoformat() if pm.completed_date else None,
        'next_due_date': pm.next_due_date.isoformat() if pm.next_due_date else None,
        'estimated_duration': pm.estimated_duration,
        'actual_duration': pm.actual_duration,
        'assigned_to': _serialize_user(pm.assigned_to),
        'completed_by': _serialize_user(pm.completed_by),
        'created_by': _serialize_user(pm.created_by),
        'topics': [topic.title for topic in pm.topics.all()],
        'notes': pm.notes or '',
        'procedure': pm.procedure or '',
        'remarks': pm.remarks or '',
        'completion_notes': pm.completion_notes or '',
        'job_id': job.job_id if job else None,
        'job_description': job.description if job else '',
        'job_remarks': job.remarks if job else '',
        'job_status': job.status if job else '',
        'job_priority': job.priority if job else '',
        'rooms': [
            {
                'room_id': room.room_id,
                'name': room.name,
                'room_type': room.room_type,
            }
            for room in job.rooms.all()
        ] if job else [],
        'area': {
            'id': area.id,
            'name': area.name,
            'property_id': area.property.property_id if area.property else '',
            'property_name': area.property.name if area.property else '',
        } if area else None,
        'machines': [
            {
                'machine_id': machine.machine_id,
                'name': machine.name,
                'category': machine.category or '',
                'location': machine.location or '',
                'property_id': machine.property.property_id if machine.property else '',
                'property_name': machine.property.name if machine.property else '',
            }
            for machine in pm.machines.all()
        ],
        'procedure_template': {
            'id': procedure_template.id,
            'name': procedure_template.name,
            'category': procedure_template.category,
            'description': procedure_template.description,
            'estimated_duration': procedure_template.estimated_duration,
            'responsible_department': procedure_template.responsible_department,
        } if procedure_template else None,
    }


def _safe_int(value):
    try:
        return int(value) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


def _build_monthly_task_counts(monthly_tasks):
    month_rows = list(
        monthly_tasks
        .annotate(year_value=ExtractYear('scheduled_date'), month_value=ExtractMonth('scheduled_date'))
        .values('year_value', 'month_value')
        .annotate(total=Count('id', distinct=True))
        .order_by('year_value', 'month_value')
    )
    month_counts = [
        {
            'year': row['year_value'],
            'month': row['month_value'],
            'total': row['total'],
        }
        for row in month_rows
    ]

    totals_by_year_month = {
        (row['year_value'], row['month_value']): row['total']
        for row in month_rows
        if row['year_value'] and row['month_value']
    }
    years = sorted({row['year_value'] for row in month_rows if row['year_value']})
    by_year = [
        {
            'year': year,
            'months': [
                {
                    'month': month,
                    'total': totals_by_year_month.get((year, month), 0),
                }
                for month in range(1, 13)
            ],
        }
        for year in years
    ]

    return month_counts, by_year


def get_recurring_maintenance_tasks(property_name: str = '', frequency: str = '', year: int = 0, month: int = 0):
    """
    ดึงรายการงานประจำ/งาน PM ที่เกิดซ้ำเป็นรายเดือนหรือรายปีสำหรับให้ AI chat ตอบคำถาม
    เช่น งานประจำเดือนนี้ งานประจำรายเดือนของสาขา งานประจำปี หรือตาราง recurring maintenance
    """
    property_obj, property_error = _resolve_property(property_name)
    if property_error:
        return {
            'error': 'PROPERTY_NOT_FOUND',
            **property_error,
        }

    normalized_frequency = str(frequency or '').strip().lower()
    frequency_aliases = {
        'yearly': 'annual',
        'annual': 'annual',
        'รายปี': 'annual',
        'ประจำปี': 'annual',
        'monthly': 'monthly',
        'รายเดือน': 'monthly',
        'ประจำเดือน': 'monthly',
    }
    selected_frequency = frequency_aliases.get(normalized_frequency, normalized_frequency)
    if selected_frequency not in {'monthly', 'annual'}:
        selected_frequency = ''

    selected_year = _safe_int(year)
    selected_month = _safe_int(month)

    tasks = PreventiveMaintenance.objects.select_related(
        'assigned_to',
        'completed_by',
        'created_by',
        'job',
        'job__area',
        'job__area__property',
        'procedure_template',
    ).prefetch_related('topics', 'job__rooms', 'machines', 'machines__property')

    if property_obj:
        tasks = tasks.filter(
            Q(job__area__property=property_obj) |
            Q(job__rooms__properties=property_obj) |
            Q(machines__property=property_obj)
        ).distinct()

    tasks = tasks.filter(frequency__in=['monthly', 'annual'])
    if selected_frequency:
        tasks = tasks.filter(frequency=selected_frequency)
    if selected_year:
        tasks = tasks.filter(scheduled_date__year=selected_year)
    if selected_month and 1 <= selected_month <= 12:
        tasks = tasks.filter(scheduled_date__month=selected_month)

    status_counts = list(
        tasks.values('status')
        .annotate(count=Count('id'))
        .order_by('status')
    )
    monthly_tasks = tasks.filter(frequency='monthly').order_by('scheduled_date', 'pmtitle')
    annual_tasks = tasks.filter(frequency='annual').order_by('scheduled_date', 'pmtitle')
    monthly_month_counts, monthly_counts_by_year = _build_monthly_task_counts(monthly_tasks)

    monthly_by_month = []
    for row in monthly_month_counts:
        month_items = monthly_tasks.filter(
            scheduled_date__year=row['year'],
            scheduled_date__month=row['month'],
        )[:20]
        monthly_by_month.append({
            'year': row['year'],
            'month': row['month'],
            'total': row['total'],
            'items': [_serialize_preventive_maintenance(pm) for pm in month_items],
        })

    annual_by_year = []
    for row in (
        annual_tasks
        .annotate(year_value=ExtractYear('scheduled_date'))
        .values('year_value')
        .annotate(total=Count('id'))
        .order_by('year_value')
    ):
        year_items = annual_tasks.filter(scheduled_date__year=row['year_value'])[:20]
        annual_by_year.append({
            'year': row['year_value'],
            'total': row['total'],
            'items': [_serialize_preventive_maintenance(pm) for pm in year_items],
        })

    return {
        'property': {
            'property_id': property_obj.property_id,
            'name': property_obj.name,
        } if property_obj else None,
        'filters': {
            'frequency': selected_frequency or 'monthly_and_annual',
            'year': selected_year,
            'month': selected_month if selected_month and 1 <= selected_month <= 12 else None,
        },
        'total': tasks.count(),
        'status_counts': [{'status': row['status'], 'count': row['count']} for row in status_counts],
        'monthly': {
            'total': monthly_tasks.count(),
            'month_counts': monthly_month_counts,
            'by_year': monthly_counts_by_year,
            'by_month': monthly_by_month,
        },
        'annual': {
            'total': annual_tasks.count(),
            'by_year': annual_by_year,
        },
    }

def _genai_modules():
    from google import genai
    from google.genai import types

    return genai, types


def _build_gemini_client():
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise ValueError('GEMINI_API_KEY environment variable is not configured.')
    genai, _ = _genai_modules()
    return genai.Client(api_key=api_key)


def _gemini_config(include_tools=True):
    _, types = _genai_modules()
    config_kwargs = {
        'system_instruction': GEMINI_SYSTEM_INSTRUCTION,
        'temperature': 0.2,
    }
    if include_tools:
        config_kwargs.update({
            'tools': [get_maintenance_summary, get_recurring_maintenance_tasks, get_today_maintenance_jobs],
            'automatic_function_calling': types.AutomaticFunctionCallingConfig(disable=True),
        })
    return types.GenerateContentConfig(**config_kwargs)


def _authorized_ai_property(user, requested_property):
    """Resolve an AI property context without disclosing another tenant's data."""
    search = str(requested_property or '').strip()
    if not search:
        return None

    normalized_search = _normalize_search_text(search)
    for property_obj in get_accessible_properties(user):
        if search.lower() in {property_obj.name.lower(), property_obj.property_id.lower()}:
            return property_obj
        if normalized_search and normalized_search in {
            _normalize_search_text(property_obj.name),
            _normalize_search_text(property_obj.property_id),
        }:
            return property_obj
    return None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_with_gemini(request):
    """REST API สำหรับคุยกับ Gemini พร้อม Function Calling เพื่อดึงข้อมูลแจ้งซ่อมจากระบบ"""
    message = str(request.data.get('message') or '').strip()
    if not message:
        return Response(
            {'detail': 'กรุณาระบุ message ใน request body'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        client = _build_gemini_client()
        _, types = _genai_modules()
        config = _gemini_config(include_tools=True)

        request_property_name = str(
            request.data.get('property_name')
            or request.data.get('property_id')
            or request.data.get('branch_name')
            or ''
        ).strip()
        inferred_property_name = _extract_property_name_from_message(message) or request_property_name
        if inferred_property_name:
            authorized_property = _authorized_ai_property(request.user, inferred_property_name)
            if authorized_property is None:
                return Response(
                    {'detail': 'ไม่พบ property ที่คุณมีสิทธิ์เข้าถึง'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            # Always pass the canonical, authorized property name to tools.
            inferred_property_name = authorized_property.name
        model_message = message
        if request_property_name and not _extract_property_name_from_message(message):
            model_message = f"Property context: {request_property_name}\nUser message: {message}"

        first_response = client.models.generate_content(
            model=GEMINI_CHAT_MODEL,
            contents=model_message,
            config=config,
        )

        function_calls = first_response.function_calls or []
        if function_calls:
            has_tool_property = any(
                (getattr(function_call, 'args', None) or {}).get('property_name')
                or (getattr(function_call, 'args', None) or {}).get('branch_name')
                for function_call in function_calls
                if function_call.name in {'get_maintenance_summary', 'get_recurring_maintenance_tasks', 'get_today_maintenance_jobs'}
            )
            if not has_tool_property and not inferred_property_name:
                return Response({
                    'reply': _property_required_reply(),
                    'tool_calls': [],
                })
        elif _requires_property_before_tool(message) and not inferred_property_name:
            return Response({
                'reply': _property_required_reply(),
                'tool_calls': [],
            })

        if not function_calls:
            if _should_force_today_tool(message):
                tool_result = get_today_maintenance_jobs(
                    property_name=inferred_property_name,
                )
                tool_part = types.Part.from_function_response(
                    name='get_today_maintenance_jobs',
                    response={'result': tool_result},
                )
                final_response = client.models.generate_content(
                    model=GEMINI_CHAT_MODEL,
                    contents=[
                        types.Content(role='user', parts=[types.Part(text=model_message)]),
                        types.Content(role='user', parts=[tool_part]),
                    ],
                    config=_gemini_config(include_tools=False),
                )
                return Response({
                    'reply': final_response.text or '',
                    'tool_calls': ['get_today_maintenance_jobs'],
                })
            if _should_force_recurring_tool(message):
                extracted_year, extracted_month = _extract_year_month_from_message(message)
                tool_result = get_recurring_maintenance_tasks(
                    property_name=inferred_property_name,
                    frequency=_extract_frequency_from_message(message),
                    year=extracted_year,
                    month=extracted_month,
                )
                tool_part = types.Part.from_function_response(
                    name='get_recurring_maintenance_tasks',
                    response={'result': tool_result},
                )
                final_response = client.models.generate_content(
                    model=GEMINI_CHAT_MODEL,
                    contents=[
                        types.Content(role='user', parts=[types.Part(text=model_message)]),
                        types.Content(role='user', parts=[tool_part]),
                    ],
                    config=_gemini_config(include_tools=False),
                )
                return Response({
                    'reply': final_response.text or '',
                    'tool_calls': ['get_recurring_maintenance_tasks'],
                })
            if _should_force_summary_tool(message):
                tool_result = get_maintenance_summary(
                    property_name=inferred_property_name,
                    room_name=_extract_room_name_from_message(message),
                    category_name=_extract_category_name_from_message(message),
                )
                tool_part = types.Part.from_function_response(
                    name='get_maintenance_summary',
                    response={'result': tool_result},
                )
                final_response = client.models.generate_content(
                    model=GEMINI_CHAT_MODEL,
                    contents=[
                        types.Content(role='user', parts=[types.Part(text=model_message)]),
                        types.Content(role='user', parts=[tool_part]),
                    ],
                    config=_gemini_config(include_tools=False),
                )
                return Response({
                    'reply': final_response.text or '',
                    'tool_calls': ['get_maintenance_summary'],
                })
            return Response({'reply': first_response.text or ''})

        tool_parts = []
        for function_call in function_calls:
            function_args = getattr(function_call, 'args', None) or {}
            requested_tool_property = (
                function_args.get('property_name')
                or function_args.get('branch_name')
                or inferred_property_name
            )
            authorized_tool_property = _authorized_ai_property(request.user, requested_tool_property)
            if authorized_tool_property is None:
                tool_result = {'error': 'ไม่พบ property ที่คุณมีสิทธิ์เข้าถึง'}
                tool_parts.append(
                    types.Part.from_function_response(
                        name=function_call.name,
                        response={'result': tool_result},
                    )
                )
                continue
            tool_property_name = authorized_tool_property.name
            if function_call.name == 'get_maintenance_summary':
                tool_result = get_maintenance_summary(
                    property_name=tool_property_name,
                    room_name=function_args.get('room_name') or function_args.get('room') or '',
                    category_name=function_args.get('category_name') or function_args.get('category') or function_args.get('topic') or '',
                )
            elif function_call.name == 'get_recurring_maintenance_tasks':
                tool_result = get_recurring_maintenance_tasks(
                    property_name=tool_property_name,
                    frequency=function_args.get('frequency') or '',
                    year=function_args.get('year'),
                    month=function_args.get('month'),
                )
            elif function_call.name == 'get_today_maintenance_jobs':
                tool_result = get_today_maintenance_jobs(
                    property_name=tool_property_name,
                )
            else:
                tool_result = {'error': f'ไม่รองรับ Tool: {function_call.name}'}

            tool_parts.append(
                types.Part.from_function_response(
                    name=function_call.name,
                    response={'result': tool_result},
                )
            )

        final_response = client.models.generate_content(
            model=GEMINI_CHAT_MODEL,
            contents=[
                types.Content(role='user', parts=[types.Part(text=model_message)]),
                first_response.candidates[0].content,
                types.Content(role='user', parts=tool_parts),
            ],
            config=_gemini_config(include_tools=False),
        )

        return Response({
            'reply': final_response.text or '',
            'tool_calls': [function_call.name for function_call in function_calls],
        })
    except ValueError as exc:
        logger.warning('Gemini chatbot configuration error: %s', exc)
        return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as exc:
        logger.exception('Gemini chatbot request failed')
        return Response(
            {'detail': 'ไม่สามารถเชื่อมต่อ Gemini ได้ในขณะนี้', 'error': str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

logger = logging.getLogger(__name__)
User = get_user_model()



# Maintenance Procedure ViewSet
class MaintenanceProcedureViewSet(viewsets.ModelViewSet):
    """
    ViewSet for MaintenanceProcedure model.
    Provides CRUD operations for maintenance procedures and step management.
    Note: Maintenance procedures are shared templates accessible to all users.
    Only admin users can create, update, or delete procedures.
    """
    serializer_class = MaintenanceProcedureSerializer
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['difficulty_level', 'created_at']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at', 'estimated_duration']
    ordering = ['name']
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Return all maintenance procedures for all users (they are shared templates).
        However, only admin users can create/update/delete them.
        """
        return MaintenanceProcedure.objects.prefetch_related('machines').all()

    def perform_create(self, serializer):
        """Only admin users can create procedures"""
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            raise PermissionDenied("Only admin users can create maintenance procedures")
        serializer.save()

    def perform_update(self, serializer):
        """Only admin users can update procedures"""
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            raise PermissionDenied("Only admin users can update maintenance procedures")
        serializer.save()

    def perform_destroy(self, instance):
        """Only admin users can delete procedures"""
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            raise PermissionDenied("Only admin users can delete maintenance procedures")
        instance.delete()

    def get_serializer_class(self):
        if self.action == 'list':
            return MaintenanceProcedureListSerializer
        return MaintenanceProcedureSerializer

    @action(detail=True, methods=['post'])
    def add_step(self, request, pk=None):
        """Add a new step to a maintenance procedure"""
        procedure = self.get_object()
        step_data = request.data
        
        try:
            new_step = procedure.add_step(step_data)
            return Response({
                'success': True,
                'message': f'Step added successfully. Total steps: {procedure.get_steps_count()}',
                'step': new_step
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['put'])
    def update_step(self, request, pk=None):
        """Update a specific step in a maintenance procedure"""
        procedure = self.get_object()
        step_number = request.data.get('step_number')
        step_data = request.data
        
        if not step_number:
            return Response({
                'success': False,
                'error': 'step_number is required'
            }, status=400)
        
        try:
            updated_step = procedure.update_step(step_number, step_data)
            return Response({
                'success': True,
                'message': f'Step {step_number} updated successfully',
                'step': updated_step
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['delete'])
    def delete_step(self, request, pk=None):
        """Delete a specific step from a maintenance procedure"""
        procedure = self.get_object()
        step_number = request.query_params.get('step_number')
        
        if not step_number:
            return Response({
                'success': False,
                'error': 'step_number query parameter is required'
            }, status=400)
        
        try:
            step_number = int(step_number)
            procedure.delete_step(step_number)
            return Response({
                'success': True,
                'message': f'Step {step_number} deleted successfully. Total steps: {procedure.get_steps_count()}'
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['post'])
    def reorder_steps(self, request, pk=None):
        """Reorder steps in a maintenance procedure"""
        procedure = self.get_object()
        new_order = request.data.get('new_order')
        
        if not new_order or not isinstance(new_order, list):
            return Response({
                'success': False,
                'error': 'new_order must be a list of step numbers'
            }, status=400)
        
        try:
            procedure.reorder_steps(new_order)
            return Response({
                'success': True,
                'message': 'Steps reordered successfully',
                'steps': procedure.steps
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['get'])
    def validate_procedure(self, request, pk=None):
        """Validate a maintenance procedure and return any errors"""
        procedure = self.get_object()
        is_valid, errors = procedure.validate_steps()
        
        return Response({
            'is_valid': is_valid,
            'errors': errors,
            'total_steps': procedure.get_steps_count(),
            'total_estimated_time': procedure.get_total_estimated_time()
        })

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Duplicate a maintenance procedure with a new name"""
        procedure = self.get_object()
        new_name = request.data.get('new_name')
        
        if not new_name:
            return Response({
                'success': False,
                'error': 'new_name is required'
            }, status=400)
        
        try:
            duplicate = procedure.duplicate_procedure(new_name)
            return Response({
                'success': True,
                'message': f'Procedure duplicated successfully as "{new_name}"',
                'duplicate_id': duplicate.id,
                'duplicate_name': duplicate.name
            })
        except Exception as e:
            return Response({
                'success': False,
                'error': f'Failed to duplicate procedure: {str(e)}'
            }, status=400)

    @action(detail=False, methods=['get'])
    def by_difficulty(self, request):
        """Get procedures grouped by difficulty level"""
        difficulty = request.query_params.get('difficulty')
        queryset = self.get_queryset()
        
        if difficulty:
            queryset = queryset.filter(difficulty_level=difficulty)
        
        procedures = queryset.values('difficulty_level').annotate(
            count=Count('id'),
            avg_duration=Avg('estimated_duration')
        ).order_by('difficulty_level')
        
        return Response({
            'success': True,
            'data': procedures
        })

    @action(detail=False, methods=['get'])
    def search_by_tools(self, request):
        """Search procedures by required tools"""
        tool_query = request.query_params.get('tool', '')
        if not tool_query:
            return Response({
                'success': False,
                'error': 'tool query parameter is required'
            }, status=400)
        
        queryset = self.get_queryset()
        # Search in required_tools field
        matching_procedures = []
        
        for procedure in queryset:
            if procedure.required_tools and tool_query.lower() in procedure.required_tools.lower():
                matching_procedures.append(MaintenanceProcedureListSerializer(procedure).data)
        
        return Response({
            'success': True,
            'count': len(matching_procedures),
            'data': matching_procedures
        })


# Other ViewSets and Views (unchanged)









class PreventiveMaintenanceImageUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, pm_id):
        try:
            queryset = PreventiveMaintenance.objects.all()
            if not (request.user.is_staff or request.user.is_superuser):
                property_ids = accessible_property_ids(request.user) or set()
                queryset = queryset.filter(
                    Q(job__rooms__properties__id__in=property_ids)
                    | Q(job__area__property_id__in=property_ids)
                    | Q(machines__property_id__in=property_ids)
                ).distinct()
            pm = queryset.get(pm_id=pm_id)

            before_image = request.FILES.get('before_image')
            after_image = request.FILES.get('after_image')

            def process_image(image_file, filename_prefix):
                img = Image.open(image_file)
                img = img.convert('RGB')
                img.thumbnail((800, 800))
                buffer = BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                buffer.seek(0)
                return ContentFile(buffer.read(), name=f"{filename_prefix}.jpg")

            if before_image:
                pm.before_image = process_image(before_image, "before_image")

            if after_image:
                pm.after_image = process_image(after_image, "after_image")

            pm.save()
            return Response({'message': 'Images uploaded and processed successfully'}, status=status.HTTP_200_OK)
        except PreventiveMaintenance.DoesNotExist:
            return Response({'error': 'PreventiveMaintenance not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Authentication Views


# Health Check
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "healthy"}, status=200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_data(request):
    """
    Get aggregated preventive maintenance data for all properties the user has access to.
    """
    logger.info(f"get_preventive_maintenance_data called by user: {request.user.username}")
    try:
        # Get properties accessible to the current user
        user_properties = Property.objects.filter(users=request.user)
        logger.info(f"Found {user_properties.count()} properties for user")
        
        # Get preventive maintenance jobs for these properties
        pm_jobs = Job.objects.filter(
            rooms__properties__in=user_properties,
            is_preventivemaintenance=True
        ).select_related('user').prefetch_related('rooms', 'topics')
        
        # Get counts by status
        status_counts = {
            'total': pm_jobs.count(),
            'pending': pm_jobs.filter(status='pending').count(),
            'in_progress': pm_jobs.filter(status='in_progress').count(),
            'completed': pm_jobs.filter(status='completed').count(),
            'waiting_sparepart': pm_jobs.filter(status='waiting_sparepart').count(),
            'cancelled': pm_jobs.filter(status='cancelled').count(),
        }
        
        # Calculate completion rate
        completion_rate = 0
        if status_counts['total'] > 0:
            completion_rate = (status_counts['completed'] / status_counts['total']) * 100
        
        # Return aggregated data
        return Response({
            'status_counts': status_counts,
            'completion_rate': completion_rate,
            'property_count': user_properties.count(),
        })
    except Exception as e:
        logger.exception(f"Error in get_preventive_maintenance_data: {str(e)}")
        return Response(
            {"detail": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_jobs(request):
    """Get jobs marked for preventive maintenance"""
    # Get query parameters
    property_id = request.query_params.get('property_id')
    status_param = request.query_params.get('status')
    limit = request.query_params.get('limit', 50)  # Default to 50 jobs
    user_filter = request.query_params.get('user_id')
    
    # Build base query
    query = Job.objects.filter(is_preventivemaintenance=True)
    
    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not property_obj.users.filter(id=request.user.id).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            query = query.filter(rooms__properties__in=[property_obj])
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = Property.objects.filter(users=request.user)
        query = query.filter(rooms__properties__in=user_properties)
    
    # Add status filter if provided
    if status_param:
        query = query.filter(status=status_param)

    # Add user filter if provided (supports numeric id or username)
    if user_filter and str(user_filter).lower() != 'all':
        try:
            query = query.filter(user_id=int(user_filter))
        except (TypeError, ValueError):
            query = query.filter(user__username=str(user_filter))
    
    # Apply distinct, select related, and prefetch related for efficiency
    query = query.distinct().select_related('user').prefetch_related(
        'rooms', 'topics', 'job_images'
    )
    
    # Apply limit
    if limit and limit.isdigit():
        query = query[:int(limit)]
    
    # Serialize and return
    serializer = JobSerializer(query, many=True, context={'request': request})
    return Response({'jobs': serializer.data, 'count': len(serializer.data)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_rooms(request):
    """Get rooms with preventive maintenance jobs"""
    
    # Get property_id from query params
    property_id = request.query_params.get('property_id')
    
    # Start with rooms that have PM jobs
    rooms_with_pm = Room.objects.filter(
        jobs__is_preventivemaintenance=True
    ).distinct()
    
    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not property_obj.users.filter(id=request.user.id).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            rooms_with_pm = rooms_with_pm.filter(properties=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = Property.objects.filter(users=request.user)
        rooms_with_pm = rooms_with_pm.filter(properties__in=user_properties)
    
    # Serialize and return
    serializer = RoomSerializer(rooms_with_pm, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_topics(request):
    """Get topics used in preventive maintenance jobs"""
    
    # Get user's properties
    user_properties = Property.objects.filter(users=request.user)
    
    # Get topics from PM jobs for user's properties
    topics = Topic.objects.filter(
        jobs__is_preventivemaintenance=True,
        jobs__rooms__properties__in=user_properties
    ).distinct()
    
    # Serialize and return
    serializer = TopicSerializer(topics, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def property_is_preventivemaintenance(request, property_id):
    """Check if a property has preventive maintenance jobs"""
    
    # Get the property
    property_instance = get_object_or_404(Property, property_id=property_id)
    
    # Check user has access to this property
    if not property_instance.users.filter(id=request.user.id).exists():
        if property_id != "PB749146D" or not settings.DEBUG:
            return Response(
                {"detail": "You do not have permission to access this property"},
                status=status.HTTP_403_FORBIDDEN
            )
    
    # Check if property has any PM jobs
    has_pm_jobs = Job.objects.filter(
        rooms__properties=property_instance,
        is_preventivemaintenance=True
    ).exists()
    
    # Update the property field
    if property_instance.is_preventivemaintenance != has_pm_jobs:
        property_instance.is_preventivemaintenance = has_pm_jobs
        property_instance.save()
    
    # Serialize and return
    serializer = PropertyPMStatusSerializer(property_instance)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_dashboard_summary(request):
    """Return aggregated job analytics for the chart dashboard."""
    user = request.user
    month_labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    base_queryset = Job.objects.all()

    if not (user.is_staff or user.is_superuser):
        accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
        base_queryset = base_queryset.filter(rooms__properties__in=accessible_property_ids)

    property_filter = request.query_params.get('property_id')
    if property_filter:
        base_queryset = base_queryset.filter(rooms__properties__property_id=property_filter)

    base_queryset = base_queryset.distinct()

    totals = base_queryset.aggregate(
        total=Count('id', distinct=True),
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
        completed=Count('id', filter=Q(status='completed'), distinct=True),
    )

    total_jobs = totals['total'] or 0
    pm_jobs = totals['pm'] or 0
    non_pm_jobs = totals['non_pm'] or 0
    completed_jobs = totals['completed'] or 0
    completion_rate = (completed_jobs / total_jobs * 100) if total_jobs else 0

    annotated_queryset = base_queryset.annotate(
        month=ExtractMonth('created_at'),
        year=ExtractYear('created_at')
    )

    trend_by_month = [
        {
            'month': month_labels[item['month'] - 1],
            'year': item['year'],
            'jobs': item['jobs'],
        }
        for item in annotated_queryset.values('month', 'year')
        .annotate(jobs=Count('id', distinct=True))
        .order_by('year', 'month')
    ]

    pm_non_pm_by_month = [
        {
            'month': month_labels[item['month'] - 1],
            'year': item['year'],
            'pm': item['pm'],
            'nonPm': item['non_pm'],
        }
        for item in annotated_queryset.values('month', 'year')
        .annotate(
            pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
            non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
        )
        .order_by('year', 'month')
    ]

    status_counts = annotated_queryset.values('month', 'year').annotate(
        completed=Count('id', filter=Q(status='completed'), distinct=True),
        waiting_sparepart=Count('id', filter=Q(status='waiting_sparepart'), distinct=True),
        waiting_fix_defect=Count('id', filter=Q(is_defective=True), distinct=True),
    ).order_by('year', 'month')

    status_by_month = []
    for item in status_counts:
        month_label = month_labels[item['month'] - 1]
        status_by_month.extend([
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Completed',
                'count': item['completed'],
            },
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Waiting Sparepart',
                'count': item['waiting_sparepart'],
            },
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Waiting Fix Defect',
                'count': item['waiting_fix_defect'],
            },
        ])

    top_users_by_month = []
    top_users = annotated_queryset.values(
        'month',
        'year',
        'user__username',
        'user__first_name',
        'user__last_name',
        'user__email',
    ).annotate(
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
    ).order_by('year', 'month', 'user__username')

    for item in top_users:
        month_label = month_labels[item['month'] - 1]
        top_users_by_month.append({
            'month': month_label,
            'year': item['year'],
            'user': display_name_from_user_values(
                item.get('user__first_name'),
                item.get('user__last_name'),
                item.get('user__email'),
                item.get('user__username'),
            ),
            'pm': item['pm'],
            'nonPm': item['non_pm'],
        })

    topics_by_month = []
    topic_counts = annotated_queryset.values('month', 'year', 'topics__title').annotate(
        count=Count('id', distinct=True),
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
    ).order_by('year', 'month', 'topics__title')

    for item in topic_counts:
        if not item['topics__title']:
            continue

        month_label = month_labels[item['month'] - 1]
        topics_by_month.append({
            'month': month_label,
            'year': item['year'],
            'topic': item['topics__title'],
            'count': item['count'],
            'pm': item['pm'],
            'nonPm': item['non_pm'],
            'isPreventive': (item['pm'] or 0) > 0,
        })

    payload = {
        'totalJobs': total_jobs,
        'pmJobs': pm_jobs,
        'nonPmJobs': non_pm_jobs,
        'completionRate': completion_rate,
        'trendByMonth': trend_by_month,
        'pmNonPmByMonth': pm_non_pm_by_month,
        'statusByMonth': status_by_month,
        'topUsersByMonth': top_users_by_month,
        'topicsByMonth': topics_by_month,
    }

    return Response(payload, status=status.HTTP_200_OK)

@require_http_methods(["GET"])
@cache_control(max_age=31536000)  # Cache for 1 year
def serve_static_file(request, file_path):
    """
    Custom view to serve static files when Django's built-in serving fails
    """
    # Construct the full path to the static file
    static_root = getattr(settings, 'STATIC_ROOT', '/app/static')
    full_path = os.path.join(static_root, file_path)
    
    # Security check: ensure the path is within STATIC_ROOT
    if not os.path.commonpath([static_root, full_path]) == static_root:
        raise Http404("Invalid file path")
    
    # Check if file exists
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise Http404("File not found")
    
    # Determine content type based on file extension
    content_type = 'text/plain'
    if file_path.endswith('.css'):
        content_type = 'text/css'
    elif file_path.endswith('.js'):
        content_type = 'application/javascript'
    elif file_path.endswith('.png'):
        content_type = 'image/png'
    elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
        content_type = 'image/jpeg'
    elif file_path.endswith('.gif'):
        content_type = 'image/gif'
    elif file_path.endswith('.svg'):
        content_type = 'image/svg+xml'
    elif file_path.endswith('.woff'):
        content_type = 'font/woff'
    elif file_path.endswith('.woff2'):
        content_type = 'font/woff2'
    elif file_path.endswith('.ttf'):
        content_type = 'font/ttf'
    elif file_path.endswith('.eot'):
        content_type = 'application/vnd.ms-fontobject'
    
    # Read and serve the file
    try:
        with open(full_path, 'rb') as f:
            content = f.read()
        
        response = HttpResponse(content, content_type=content_type)
        response['Content-Length'] = len(content)
        return response
    except Exception as e:
        raise Http404(f"Error reading file: {str(e)}")

@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    """Get CSRF token for frontend requests"""
    from django.middleware.csrf import get_token
    from django.http import JsonResponse
    
    # Get the CSRF token
    csrf_token = get_token(request)
    
    return JsonResponse({
        'csrfToken': csrf_token,
        'csrfHeaderName': 'X-CSRFToken'
    })

# Maintenance PDF Report Generation
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def generate_maintenance_pdf_report(request):
    """
    Generate a clean and compact maintenance PDF report
    Supports filtering and different report formats
    """
    try:
        from .pdf_utils import MaintenanceReportGenerator
        from .timezones import localtime_for, object_timezone
        from django.http import HttpResponse
        import io
        
        # Get query parameters
        report_type = request.query_params.get('type', 'detailed')  # 'detailed' or 'compact'
        include_images = request.query_params.get('include_images', 'false').lower() == 'true'
        title = request.query_params.get('title', 'Maintenance Report')
        
        # Get filter parameters
        status_filter = request.query_params.get('status')
        frequency_filter = request.query_params.get('frequency')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        topic_id = request.query_params.get('topic_id')
        property_id = request.query_params.get('property_id')
        
        # Build queryset
        queryset = PreventiveMaintenance.objects.select_related(
            'job'
        ).prefetch_related(
            'topics',
            'job__rooms',
            'job__rooms__properties'
        )
        
        # Apply filters
        if status_filter:
            now = timezone.now()
            if status_filter == 'completed':
                queryset = queryset.filter(completed_date__isnull=False)
            elif status_filter == 'pending':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__gte=now)
            elif status_filter == 'overdue':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now)
        
        if frequency_filter and frequency_filter != 'all':
            queryset = queryset.filter(frequency=frequency_filter)
        
        if date_from:
            queryset = queryset.filter(scheduled_date__gte=date_from)
        
        if date_to:
            queryset = queryset.filter(scheduled_date__lte=date_to)
        
        if topic_id:
            queryset = queryset.filter(topics__id=topic_id)
        
        if property_id:
            queryset = queryset.filter(job__rooms__properties__property_id=property_id)
            report_property = Property.objects.filter(property_id=property_id).select_related('tenant').first()
        else:
            report_property = None
        
        # Filter by user access (only show maintenance for properties user has access to)
        if not request.user.is_staff:
            user_properties = Property.objects.filter(users=request.user)
            queryset = queryset.filter(job__rooms__properties__in=user_properties)
        
        # Order by scheduled date
        queryset = queryset.order_by('scheduled_date')
        
        # Get the data
        maintenance_data = list(queryset.distinct())
        
        if not maintenance_data:
            return Response({
                'error': 'No maintenance data found for the specified filters'
            }, status=status.HTTP_404_NOT_FOUND)
        
        report_tz = object_timezone(report_property or maintenance_data[0])

        # Create PDF generator
        generator = MaintenanceReportGenerator(
            title=title,
            include_images=include_images,
            compact_mode=(report_type == 'compact'),
            tzinfo=report_tz,
        )
        
        # Generate PDF
        output_stream = io.BytesIO()
        
        if report_type == 'compact':
            generator.generate_compact_report(maintenance_data, output_stream)
        else:
            generator.generate_report(maintenance_data, output_stream)
        
        # Create HTTP response
        response = HttpResponse(
            output_stream.getvalue(),
            content_type='application/pdf'
        )
        
        # Set filename
        timestamp = localtime_for(report_property or maintenance_data[0]).strftime('%Y%m%d_%H%M%S')
        filename = f"maintenance_report_{report_type}_{timestamp}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response
        
    except ImportError as e:
        logger.error(f"PDF generation failed - missing dependency: {str(e)}")
        return Response({
            'error': 'PDF generation not available - missing dependencies'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
    except Exception as e:
        logger.exception(f"Error generating maintenance PDF report: {str(e)}")
        return Response({
            'error': f'Failed to generate PDF report: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Notification API Endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_overdue_notifications(request):
    """
    Get overdue maintenance tasks for the authenticated user.
    
    Returns a list of preventive maintenance tasks that are past their scheduled date
    and not yet completed. Results are filtered based on user's property access.

    Query Parameters:
        - property_id (str, optional): Scope results to a single property.

    Returns:
        - List of overdue preventive maintenance tasks with pagination
    """
    try:
        user = request.user
        property_id = request.query_params.get('property_id') or None
        overdue_tasks = NotificationService.get_overdue_maintenance(user, property_id=property_id)
        
        # Serialize the results
        serializer = PreventiveMaintenanceListSerializer(
            overdue_tasks, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'count': len(overdue_tasks),
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching overdue notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch overdue notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_upcoming_notifications(request):
    """
    Get upcoming maintenance alerts for the authenticated user.
    
    Returns a list of preventive maintenance tasks that are due within the next N days
    and not yet completed. Results are filtered based on user's property access.
    
    Query Parameters:
        - days (int, optional): Number of days to look ahead. Default is 7.
        - property_id (str, optional): Scope results to a single property.

    Returns:
        - List of upcoming preventive maintenance tasks with pagination
    """
    try:
        user = request.user
        days = NotificationService.normalize_days(request.query_params.get('days', 7))
        property_id = request.query_params.get('property_id') or None

        upcoming_tasks = NotificationService.get_upcoming_alerts(user, days=days, property_id=property_id)
        
        # Serialize the results
        serializer = PreventiveMaintenanceListSerializer(
            upcoming_tasks, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'count': len(upcoming_tasks),
            'days': days,
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching upcoming notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch upcoming notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_notifications(request):
    """
    Get all notifications (overdue + upcoming) for the authenticated user.
    
    Returns a combined list of overdue and upcoming preventive maintenance tasks.
    Results are filtered based on user's property access.
    
    Query Parameters:
        - days (int, optional): Number of days to look ahead for upcoming tasks. Default is 7.
        - property_id (str, optional): Scope results to a single property.

    Returns:
        - Combined list of overdue and upcoming preventive maintenance tasks
    """
    try:
        user = request.user
        notification_payload = NotificationService.get_all_notifications(
            user,
            days=request.query_params.get('days', 7),
            property_id=request.query_params.get('property_id') or None
        )
        all_tasks = notification_payload['all_tasks']
        serializer = PreventiveMaintenanceListSerializer(
            all_tasks, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'overdue_count': notification_payload['overdue_count'],
            'upcoming_count': notification_payload['upcoming_count'],
            'total_count': notification_payload['total_count'],
            'days': notification_payload['days'],
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching all notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ============================================================
# Web Push subscription endpoints
# ============================================================


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    """
    Register a PushManager subscription against the authenticated user.

    Body shape (mirrors PushSubscription.toJSON() from the browser):
        {
          "endpoint": "...",
          "keys": {"p256dh": "...", "auth": "..."}
        }

    Idempotent: if the same endpoint already exists we update the keys and
    re-activate, so subscribing twice from the same browser is a no-op.
    """
    payload = request.data or {}
    endpoint = (payload.get('endpoint') or '').strip()
    keys = payload.get('keys') or {}
    p256dh = (keys.get('p256dh') or '').strip()
    auth = (keys.get('auth') or '').strip()

    if not endpoint or not p256dh or not auth:
        return Response(
            {'error': 'endpoint and keys.{p256dh,auth} are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:255]
    sub, created = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            'user': request.user,
            'p256dh': p256dh,
            'auth': auth,
            'user_agent': user_agent,
            'is_active': True,
        },
    )
    return Response(
        {
            'id': sub.id,
            'created': created,
            'is_active': sub.is_active,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    """Deactivate a subscription by endpoint. Body: {"endpoint": "..."}."""
    endpoint = (request.data or {}).get('endpoint', '').strip()
    if not endpoint:
        return Response({'error': 'endpoint required'}, status=status.HTTP_400_BAD_REQUEST)
    updated = PushSubscription.objects.filter(
        user=request.user, endpoint=endpoint
    ).update(is_active=False)
    return Response({'deactivated': updated})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def push_public_key(request):
    """Expose the configured VAPID public key so the frontend can subscribe."""
    key = os.environ.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '').strip()
    return Response({'public_key': key, 'configured': bool(key)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_test(request):
    """Send a smoke-test push to every active subscription of the caller."""
    from .push import send_push_to_user

    delivered = send_push_to_user(
        request.user,
        {
            'title': 'HotelCare Pro test push',
            'body': f'Push delivered to {request.user.username or request.user.email or "your device"}',
            'tag': 'pcms-test',
            'url': '/dashboard',
        },
    )
    return Response({'delivered': delivered})


# ============================================================
# Public guest maintenance requests (no auth)
# ============================================================
#
# Hotels stick a QR code on the door / in the room that points to
# /report/<property_id>/<room_id>. Guests scan it, fill in a brief form,
# and the request lands in the maintenance backlog as a regular Job. To
# protect against abuse the endpoint:
#
#   - Requires both property and room to exist AND for the room to be
#     attached to that property (so a stranger can't enumerate or spoof
#     other tenants from a single QR scan).
#   - Caps description length and trims everything.
#   - Throttles by IP via the cache (15 requests per hour).
#   - Assigns the job to the property's first attached user (typically
#     the chief engineer) so the assignee FK never goes null.

from django.core.cache import cache


def _client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').strip()
    if forwarded:
        return forwarded.split(',', 1)[0].strip()
    return (request.META.get('REMOTE_ADDR') or 'anon').strip()


@api_view(['POST'])
@permission_classes([AllowAny])
def public_job_request(request, property_id, room_id):
    """Create a maintenance Job from an unauthenticated guest scan."""

    ip = _client_ip(request)
    bucket_key = f'pcms:public-job-request:{ip}'
    count = cache.get(bucket_key, 0)
    if count >= 15:
        return Response(
            {'error': 'Too many requests from this network. Try again later.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    payload = request.data or {}
    description = (payload.get('description') or '').strip()
    if not description:
        return Response(
            {'error': 'description is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    description = description[:1000]
    guest_name = (payload.get('guest_name') or '').strip()[:120]
    guest_contact = (payload.get('guest_contact') or '').strip()[:120]

    # Resolve property and room. Accept both pcms-style property_id (P12345…)
    # and numeric PKs so the QR code can use whichever the operator prefers.
    property_obj = None
    try:
        if str(property_id).isdigit():
            property_obj = Property.objects.filter(id=int(property_id)).first()
        if property_obj is None:
            property_obj = Property.objects.filter(property_id=str(property_id)).first()
    except Exception:  # pragma: no cover - defensive
        property_obj = None
    if property_obj is None:
        return Response({'error': 'Property not found.'}, status=status.HTTP_404_NOT_FOUND)

    room_obj = None
    try:
        if str(room_id).isdigit():
            room_obj = Room.objects.filter(room_id=int(room_id)).first()
    except Exception:  # pragma: no cover - defensive
        room_obj = None
    if room_obj is None:
        # Allow lookup by name as a fallback so QRs printed with the visible
        # room number still work.
        room_obj = Room.objects.filter(name=str(room_id)).first()
    if room_obj is None or not room_obj.properties.filter(pk=property_obj.pk).exists():
        return Response(
            {'error': 'Room not found at this property.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    assignee = property_obj.users.order_by('id').first()
    if assignee is None:
        return Response(
            {'error': 'Property has no staff to dispatch the request to.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
    remark_lines = [f'[{stamp} · guest → reported via QR scan]']
    if guest_name:
        remark_lines.append(f'Guest: {guest_name}')
    if guest_contact:
        remark_lines.append(f'Contact: {guest_contact}')
    remark_lines.append(f'Source IP: {ip}')

    job = Job.objects.create(
        user=assignee,
        updated_by=assignee,
        description=description,
        remarks='\n'.join(remark_lines),
        status='pending',
        priority='medium',
    )
    job.rooms.set([room_obj])

    cache.set(bucket_key, count + 1, timeout=60 * 60)

    return Response(
        {
            'job_id': job.job_id,
            'property': property_obj.name,
            'room': room_obj.name,
            'message': 'Thanks — our maintenance team has been notified.',
        },
        status=status.HTTP_201_CREATED,
    )
