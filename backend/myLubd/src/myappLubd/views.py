from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import status, viewsets, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Prefetch
from rest_framework_simplejwt.tokens import RefreshToken
from google.oauth2 import id_token
from google.auth.transport import requests
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
from django.utils.dateparse import parse_date
import math
import csv
from django.db.models import Count, Q, F, ExpressionWrapper, fields, Case, When, Value, Avg, Exists, OuterRef
from django.db.models.functions import ExtractMonth, ExtractYear
from django.db import models, transaction
from .models import (
    UserProfile, Property, Room, Topic, Job, Session, PreventiveMaintenance,
    PreventiveMaintenanceImage, PMMasterPlan, JobImage, Machine,
    MaintenanceProcedure, UtilityConsumption, Inventory,
    Area, JobComment, PushSubscription, Tenant,
    TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric,
    InventoryUsage, MaintenanceChecklist, MaintenanceHistory,
)
from django.urls import reverse
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .serializers import (
    CurrentUserProfileSerializer, CurrentUserProfileUpdateSerializer,
    UserProfileSerializer, PropertySerializer, RoomSerializer, TopicSerializer, JobSerializer,
    JobDashboardSerializer,
    UserSerializer, PreventiveMaintenanceSerializer, PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceCompleteSerializer, PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceDetailSerializer, PropertyPMStatusSerializer, PMMasterPlanSerializer,
    MachineSerializer, MachineListSerializer, MachineDetailSerializer,
    MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer,
    MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer,
    UtilityConsumptionSerializer, UtilityConsumptionListSerializer,
    InventorySerializer, InventoryListSerializer, InventoryUsageSerializer,
    AreaSerializer, JobCommentSerializer, TenantSerializer, JobAssignmentCandidateSerializer,
    TenantMembershipSerializer, SubscriptionPlanSerializer,
    TenantSubscriptionSerializer, UsageMetricSerializer,
)
from .job_property import resolve_job_property
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
from datetime import datetime, time, timedelta
from calendar import monthrange
from contextvars import ContextVar
from django.http import JsonResponse, HttpResponseRedirect, StreamingHttpResponse
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
    get_operable_properties,
    get_property_summary_recipients,
    get_user_tenants,
    TENANT_OPERATOR_ROLES,
    TENANT_WIDE_PROPERTY_ROLES,
    tenant_usage_counts,
    user_can_manage_tenant,
)
from .timezones import object_timezone, property_timezone, timezone_options


GEMINI_CHAT_MODEL = 'gemini-2.5-flash'
_ai_accessible_properties = ContextVar('ai_accessible_properties', default=None)


class IsPlatformSuperuser(BasePermission):
    """Restrict mutations of globally shared resources to break-glass users."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
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

    properties_queryset = Property.objects.all()
    # This context is set only by the authenticated AI dispatcher.  It is not a
    # tool argument, so a model/provider cannot widen the server-controlled
    # property scope.
    ai_scope = _ai_accessible_properties.get()
    if ai_scope is not None:
        properties_queryset = properties_queryset.filter(pk__in=ai_scope.values('pk'))
    properties = list(properties_queryset)
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


def _ai_scoped_properties():
    """Return the provider-visible Property scope for the current AI request."""
    ai_scope = _ai_accessible_properties.get()
    return ai_scope if ai_scope is not None else Property.objects.all()


def _resolve_explicit_ai_property(property_reference):
    """Resolve explicit client context exactly inside the authorized scope."""
    reference = str(property_reference or '').strip()
    if not reference:
        return None
    return _ai_scoped_properties().filter(
        Q(property_id__iexact=reference) | Q(name__iexact=reference)
    ).first()


def _resolve_room(room_name=None, property_obj=None):
    search = str(room_name or '').strip()
    if not search:
        return None, None

    rooms = Room.objects.select_related('property')
    if property_obj:
        rooms = rooms.filter(property=property_obj)
    else:
        ai_scope = _ai_accessible_properties.get()
        if ai_scope is not None:
            rooms = rooms.filter(property__in=ai_scope)
    rooms = list(rooms)
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
        'name': display_name,
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

    properties = list(_ai_scoped_properties())
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
    properties = list(
        _ai_scoped_properties().order_by('name').values('property_id', 'name')[:20]
    )
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
    ai_scope = _ai_accessible_properties.get()
    if ai_scope is not None:
        jobs = jobs.filter(property__in=ai_scope)
    if property_obj:
        jobs = jobs.filter(property=property_obj)
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
                'name': display_name,
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
            'name': _display_user_name_from_values(row),
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
                'name': _display_user_name_from_values(reporter_row),
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
        room_queryset = room_queryset.filter(property=property_obj)
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
            Q(job__property=property_obj)
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

    ai_scope = _ai_accessible_properties.get()
    if ai_scope is not None:
        jobs = jobs.filter(property__in=ai_scope)
    if property_obj:
        jobs = jobs.filter(property=property_obj)

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

    ai_scope = _ai_accessible_properties.get()
    if ai_scope is not None:
        # Linked Jobs are scoped exclusively by canonical Job.property.  A PM
        # with no linked Job may still be scoped by its native Machine property.
        tasks = tasks.filter(
            Q(job__property__in=ai_scope)
            | Q(job__isnull=True, machines__property__in=ai_scope)
        )

    if property_obj:
        tasks = tasks.filter(
            Q(job__property=property_obj) |
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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_with_gemini(request):
    """REST API สำหรับคุยกับ Gemini พร้อม Function Calling เพื่อดึงข้อมูลแจ้งซ่อมจากระบบ"""
    # Establish the canonical authorization boundary before any AI processing.
    # A.2h-2 propagates this scope through each context helper.
    accessible_properties = get_accessible_properties(request.user)
    ai_scope_token = _ai_accessible_properties.set(accessible_properties)
    message = str(request.data.get('message') or '').strip()
    if not message:
        return Response(
            {'detail': 'กรุณาระบุ message ใน request body'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        request_property_name = str(
            request.data.get('property_name')
            or request.data.get('property_id')
            or request.data.get('branch_name')
            or ''
        ).strip()
        request_property = _resolve_explicit_ai_property(request_property_name)
        if request_property_name and request_property is None:
            # Do not reveal whether the identifier exists outside this user's
            # canonical TenantMembership-derived scope.
            return Response(
                {'detail': 'ไม่พบ property ที่ได้รับอนุญาต'},
                status=status.HTTP_404_NOT_FOUND,
            )

        canonical_request_property = (
            request_property.property_id if request_property is not None else ''
        )
        inferred_property_name = (
            canonical_request_property
            or _extract_property_name_from_message(message)
        )
        model_message = message
        if canonical_request_property:
            model_message = (
                f"Property context: {canonical_request_property}\n"
                f"User message: {message}"
            )

        client = _build_gemini_client()
        _, types = _genai_modules()
        config = _gemini_config(include_tools=True)

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
            tool_property_name = (
                canonical_request_property
                or function_args.get('property_name')
                or function_args.get('branch_name')
                or inferred_property_name
            )
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
        return Response(
            {'detail': 'ระบบ AI ยังไม่พร้อมใช้งานในขณะนี้'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as exc:
        logger.exception('Gemini chatbot request failed')
        return Response(
            {'detail': 'ไม่สามารถเชื่อมต่อ Gemini ได้ในขณะนี้'},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    finally:
        _ai_accessible_properties.reset(ai_scope_token)

logger = logging.getLogger(__name__)
User = get_user_model()

RAW_AUTH_PREFIXES = ('google-oauth2_', 'auth0_', 'auth0|')


def is_raw_auth_identifier(value):
    if value is None:
        return False
    text = str(value).strip()
    return (
        text.startswith(RAW_AUTH_PREFIXES)
        or text.lower() in {'null', 'undefined', '[object object]'}
    )


def display_name_from_user_values(first_name='', last_name='', email='', username='', fallback='Unknown Technician'):
    full_name = f"{first_name or ''} {last_name or ''}".strip()
    for candidate in (full_name, email, username):
        value = str(candidate or '').strip()
        if value and not is_raw_auth_identifier(value):
            return value
    return fallback


def display_name_from_user(user, fallback='Unknown Technician'):
    if not user:
        return fallback

    profile = getattr(user, 'userprofile', None)
    profile_full_name = getattr(profile, 'full_name', None)
    full_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
    for candidate in (
        profile_full_name,
        full_name,
        getattr(user, 'email', None),
        getattr(user, 'username', None),
    ):
        value = str(candidate or '').strip()
        if value and not is_raw_auth_identifier(value):
            return value
    return fallback


def _job_property_ids(job):
    return {job.property_id} if job is not None and job.property_id else set()


def _pm_property_ids(pm):
    property_q = Q(machines__preventive_maintenances=pm)
    if pm.job_id:
        property_q |= Q(jobs=pm.job)
    return set(Property.objects.filter(property_q).values_list('id', flat=True))


def _ensure_user_can_use_property(user, property_obj):
    if user.is_superuser:
        return
    if not get_operable_properties(user).filter(id=property_obj.id).exists():
        raise PermissionDenied("Your role cannot modify data for this property.")


def _ensure_user_can_operate_property(user, property_obj):
    """Canonical write gate for Property-owned operational resources."""
    if property_obj is None:
        raise ValidationError({'property': 'Property must be provided.'})
    if user.is_superuser:
        return
    if not get_operable_properties(user).filter(pk=property_obj.pk).exists():
        raise PermissionDenied("Your role cannot modify data for this property.")


def _job_assignment_candidates(property_obj):
    """Active users whose canonical membership can operate one Property."""
    if property_obj is None or property_obj.tenant_id is None:
        return User.objects.none()

    operator_roles = TENANT_OPERATOR_ROLES
    tenant_wide_operator_roles = TENANT_WIDE_PROPERTY_ROLES & operator_roles
    return User.objects.filter(
        Q(
            tenant_memberships__tenant_id=property_obj.tenant_id,
            tenant_memberships__is_active=True,
            tenant_memberships__role__in=tenant_wide_operator_roles,
        )
        | Q(
            tenant_memberships__tenant_id=property_obj.tenant_id,
            tenant_memberships__is_active=True,
            tenant_memberships__role__in=operator_roles,
            tenant_memberships__properties=property_obj,
        ),
        is_active=True,
    ).distinct().order_by('first_name', 'last_name', 'username', 'pk')


def consume_inventory_items(*, user, items, job=None, preventive_maintenance=None, source='manual'):
    """Consume inventory in a transaction and return usage ledger rows."""
    if not items:
        return []
    if job is not None and preventive_maintenance is not None:
        raise ValidationError("Inventory usage can be linked to a job or PM, not both.")

    usage_records = []
    with transaction.atomic():
        for raw_item in items:
            item_id = raw_item.get('item_id') or raw_item.get('inventory') or raw_item.get('inventory_item_id')
            quantity = int(raw_item.get('quantity') or 0)
            if not item_id:
                raise ValidationError({'inventory_usage': 'item_id is required for each consumed inventory item.'})
            if quantity <= 0:
                raise ValidationError({'inventory_usage': 'quantity must be greater than zero.'})

            inventory = (
                Inventory.objects.select_for_update()
                .filter(Q(item_id__iexact=str(item_id)) | Q(id=item_id if str(item_id).isdigit() else None))
                .first()
            )
            if inventory is None:
                raise ValidationError({'inventory_usage': f'Inventory item not found: {item_id}'})
            if inventory.property is None:
                raise ValidationError({'inventory_usage': f'Inventory item {inventory.item_id} is not assigned to a property.'})

            _ensure_user_can_use_property(user, inventory.property)
            job_property_ids = _job_property_ids(job) if job is not None else set()
            pm_property_ids = _pm_property_ids(preventive_maintenance) if preventive_maintenance is not None else set()

            if job is not None and job_property_ids and inventory.property_id not in job_property_ids:
                raise ValidationError({'inventory_usage': f'{inventory.item_id} does not belong to the job property.'})
            if preventive_maintenance is not None and pm_property_ids and inventory.property_id not in pm_property_ids:
                raise ValidationError({'inventory_usage': f'{inventory.item_id} does not belong to the PM property.'})
            if inventory.quantity < quantity:
                raise ValidationError({
                    'inventory_usage': f'Insufficient stock for {inventory.item_id}: {inventory.quantity} available, {quantity} requested.'
                })

            inventory.quantity -= quantity
            inventory.save(update_fields=['quantity', 'status', 'updated_at'])
            if job is not None:
                inventory.jobs.add(job)
            if preventive_maintenance is not None:
                inventory.preventive_maintenances.add(preventive_maintenance)

            usage_records.append(InventoryUsage.objects.create(
                inventory=inventory,
                job=job,
                preventive_maintenance=preventive_maintenance,
                property=inventory.property,
                quantity=quantity,
                unit_cost=raw_item.get('unit_cost') if raw_item.get('unit_cost') not in ('', None) else inventory.unit_price,
                source=source,
                notes=raw_item.get('notes') or '',
                consumed_by=user,
            ))
    return usage_records


# Pagination class
class MaintenancePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    page_query_param = 'page'  # Explicitly set page query param name
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page.paginator.per_page
        logger.info(f"[Pagination] Page: {self.page.number}, Page Size: {page_size}, Total: {self.page.paginator.count}, Total Pages: {self.page.paginator.num_pages}")
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': page_size,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })

def canonical_pm_queryset(user, property_filter=None):
    """Return PM rows with one canonical property and TenantMembership scope."""
    job_machine_conflict = Machine.objects.filter(
        preventive_maintenances=OuterRef('pk')
    ).exclude(property_id=OuterRef('job__property_id'))

    queryset = PreventiveMaintenance.objects.select_related(
        'job__property',
        'created_by',
        'completed_by',
        'verified_by',
        'assigned_to',
        'procedure_template',
    ).prefetch_related(
        'topics',
        'machines',
        'machines__property',
        'job__rooms',
        'images__uploaded_by',
    ).annotate(
        machine_property_count=Count('machines__property_id', distinct=True),
        has_job_machine_conflict=Exists(job_machine_conflict),
    ).filter(
        machine_property_count__lte=1,
    ).filter(
        Q(job__isnull=True) | Q(has_job_machine_conflict=False),
    ).filter(
        Q(job__property__isnull=False) | Q(machine_property_count=1),
    )

    if not user.is_superuser:
        property_ids = accessible_property_ids(user)
        inaccessible_machines = Machine.objects.filter(
            preventive_maintenances=OuterRef('pk')
        ).exclude(property_id__in=property_ids)
        queryset = queryset.annotate(
            has_inaccessible_machine=Exists(inaccessible_machines)
        ).filter(
            has_inaccessible_machine=False,
        ).filter(
            Q(job__isnull=True) | Q(job__property_id__in=property_ids)
        ).filter(
            Q(job__property_id__in=property_ids) | Q(machines__property_id__in=property_ids)
        )

    if property_filter:
        machines_outside_property = Machine.objects.filter(
            preventive_maintenances=OuterRef('pk')
        ).exclude(property__property_id=property_filter)
        queryset = queryset.annotate(
            has_machine_outside_property=Exists(machines_outside_property)
        ).filter(
            has_machine_outside_property=False,
        ).filter(
            Q(job__isnull=True) | Q(job__property__property_id=property_filter)
        ).filter(
            Q(job__property__property_id=property_filter)
            | Q(machines__property__property_id=property_filter)
        )

    return queryset.distinct()


# Preventive Maintenance ViewSet
class PreventiveMaintenanceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for PreventiveMaintenance model.
    Provides standard CRUD operations plus custom endpoints:
    - stats: Get statistics about preventive maintenance
    - upcoming: Get list of upcoming maintenance tasks
    - overdue: Get list of overdue maintenance tasks
    - complete: Mark a maintenance task as completed
    - upload_images: Upload before/after images for maintenance tasks
    - reschedule: Reschedule a maintenance task
    - by_priority: Get tasks sorted by priority
    """
    serializer_class = PreventiveMaintenanceSerializer
    pagination_class = MaintenancePagination
    lookup_field = 'pm_id'
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['topics__id', 'frequency']
    search_fields = ['pm_id', 'pmtitle', 'notes']
    ordering_fields = ['scheduled_date', 'created_at', 'frequency']
    ordering = ['-scheduled_date']
    permission_classes = [IsAuthenticated]

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method in {'GET', 'HEAD', 'OPTIONS'} or request.user.is_superuser:
            return

        property_ids = set(obj.machines.values_list('property_id', flat=True))
        if obj.job_id and obj.job.property_id:
            property_ids.add(obj.job.property_id)
        operable_ids = set(
            get_operable_properties(request.user)
            .filter(pk__in=property_ids)
            .values_list('pk', flat=True)
        )
        if not property_ids or operable_ids != property_ids:
            raise PermissionDenied("Your role cannot modify maintenance for this property")


    def _get_master_plan_queryset(self):
        queryset = PMMasterPlan.objects.select_related(
            'created_by', 'assigned_to', 'procedure_template'
        ).prefetch_related(
            'topics', 'machines', 'machines__property__tenant', 'generated_maintenances'
        ).annotate(
            machine_property_count=Count('machines__property_id', distinct=True)
        ).filter(
            machine_property_count=1
        )
        property_filter = self.request.query_params.get('property_id')
        user = self.request.user
        if not user.is_superuser:
            property_ids = accessible_property_ids(user)
            inaccessible_machines = Machine.objects.filter(
                pm_master_plans=OuterRef('pk')
            ).exclude(property_id__in=property_ids)
            queryset = queryset.annotate(
                has_inaccessible_machine=Exists(inaccessible_machines)
            ).filter(
                has_inaccessible_machine=False,
                machines__property_id__in=property_ids,
            )
        if property_filter:
            machines_outside_property = Machine.objects.filter(
                pm_master_plans=OuterRef('pk')
            ).exclude(property__property_id=property_filter)
            queryset = queryset.annotate(
                has_machine_outside_property=Exists(machines_outside_property)
            ).filter(
                has_machine_outside_property=False,
                machines__property__property_id=property_filter,
            )
        return queryset.distinct()

    def _serialize_projected_plan_item(self, occurrence):
        due = occurrence['due_date']
        return {
            'pm_id': occurrence.get('generated_pm_id'),
            'plan_id': occurrence['plan_id'],
            'pmtitle': occurrence['title'],
            'scheduled_date': due.isoformat(),
            'completed_date': None,
            'next_due_date': due.isoformat(),
            'status': occurrence['calendar_status'],
            'frequency': occurrence['frequency'],
            'calendar_date': due.isoformat(),
            'occurrence_type': occurrence['occurrence_type'],
            'calendar_status': occurrence['calendar_status'],
            'generated_pm_id': occurrence.get('generated_pm_id'),
            'lead_time_days': occurrence.get('lead_time_days'),
            'machine_ids': occurrence.get('machine_ids', []),
        }

    def list(self, request, *args, **kwargs):
        """
        List preventive maintenance items with pagination.
        Logs pagination parameters for debugging.
        """
        page_param = request.query_params.get('page')
        page_size_param = request.query_params.get('page_size')
        logger.info(f"[PM List] Pagination params - page: {page_param}, page_size: {page_size_param}")
        logger.info(f"[PM List] All query params: {dict(request.query_params)}")
        
        queryset = self.filter_queryset(self.get_queryset())
        logger.info(f"[PM List] Filtered queryset count: {queryset.count()}")
        
        # Apply pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            logger.info(f"[PM List] Pagination applied - page size: {len(page)}")
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        # If pagination is not applied, return all results (shouldn't happen with page param)
        logger.warning(f"[PM List] Pagination not applied - returning all {queryset.count()} results")
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
            'total_pages': 1,
            'current_page': 1,
            'page_size': len(serializer.data),
            'next': None,
            'previous': None,
        })

    def get_object(self):
        """
        Override to support case-insensitive PM ID lookup.
        Returns the object the view is displaying.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        pm_id = self.kwargs[lookup_url_kwarg]
        
        # Try case-insensitive lookup using iexact
        obj = queryset.filter(pm_id__iexact=pm_id).first()
        
        if obj is None:
            from django.http import Http404
            raise Http404(f"No PreventiveMaintenance matches the given query with PM ID: {pm_id}")
        
        # May raise a permission denied
        self.check_object_permissions(self.request, obj)
        
        return obj

    def _get_base_queryset(self):
        """Return PMs scoped to the authenticated user's accessible properties."""
        property_filter = self.request.query_params.get('property_id')
        machine_filter = self.request.query_params.get('machine_id')
        queryset = canonical_pm_queryset(self.request.user, property_filter)

        if machine_filter:
            queryset = queryset.filter(machines__machine_id=machine_filter)

        return queryset.distinct()

    def get_queryset(self):
        """
        Return a queryset filtered by request parameters.
        Supports filtering by:
        - status (completed, pending, overdue)
        - topic_id
        - date_from & date_to
        - pm_id (exact match)
        """
        queryset = self._get_base_queryset()

        pm_id = self.request.query_params.get('pm_id')
        status_param = self.request.query_params.get('status')
        topic_id = self.request.query_params.get('topic_id')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if pm_id:
            queryset = queryset.filter(pm_id__icontains=pm_id)

        if status_param:
            now = timezone.now()
            if status_param == 'completed':
                queryset = queryset.filter(completed_date__isnull=False)
            elif status_param == 'pending':
                queryset = queryset.filter(
                    completed_date__isnull=True,
                    scheduled_date__gte=now,
                ).exclude(status='cancelled')
            elif status_param == 'overdue':
                queryset = queryset.filter(
                    completed_date__isnull=True,
                    scheduled_date__lt=now,
                ).exclude(status='cancelled')

        if topic_id:
            queryset = queryset.filter(topics__id=topic_id)

        if date_from:
            queryset = queryset.filter(scheduled_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(scheduled_date__lte=date_to)

        return queryset.distinct()

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return PreventiveMaintenanceListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return PreventiveMaintenanceCreateUpdateSerializer
        elif self.action in ['retrieve']:
            return PreventiveMaintenanceDetailSerializer
        elif self.action == 'complete':
            return PreventiveMaintenanceCompleteSerializer
        return self.serializer_class

    def _extract_machine_ids_from_request(self):
        """
        Normalize machine_ids coming from the request into a clean list of strings.
        Handles QueryDicts (getlist), regular dicts, and single values.
        """
        data = self.request.data

        def _normalize(value):
            if value is None:
                return []
            if isinstance(value, (list, tuple, set)):
                return [str(item).strip() for item in value if str(item).strip()]
            string_value = str(value).strip()
            return [string_value] if string_value else []

        if hasattr(data, "getlist"):
            machine_ids = data.getlist("machine_ids")
            return _normalize(machine_ids)

        if isinstance(data, dict):
            return _normalize(data.get("machine_ids"))

        return []

    def _log_machine_id_state(self, action, instance=None):
        machine_ids = self._extract_machine_ids_from_request()
        user = getattr(self.request, "user", None)
        username = getattr(user, "username", "anonymous")
        property_hint = self.request.data.get("property_id") if isinstance(self.request.data, dict) else None

        log_payload = {
            "user": username,
            "action": action,
            "machine_ids_received": machine_ids,
            "machine_id_count": len(machine_ids),
            "property_hint": property_hint,
            "request_keys": list(self.request.data.keys()) if hasattr(self.request.data, "keys") else "unavailable",
        }

        if instance is not None:
            linked_ids = list(instance.machines.values_list("machine_id", flat=True))
            log_payload.update(
                {
                    "instance_pm_id": instance.pm_id,
                    "instance_machine_count": len(linked_ids),
                    "instance_machine_ids": linked_ids,
                }
            )

        if machine_ids:
            logger.info("[PM MACHINE TRACE] %s", log_payload)
        else:
            logger.warning("[PM MACHINE TRACE] Missing machine_ids in request", extra={"machine_trace": log_payload})

    def perform_create(self, serializer):
        """Add the current user as the creator when creating a record, logging machine associations"""
        self._log_machine_id_state(action="create_start")
        instance = serializer.save(created_by=self.request.user)
        self._log_machine_id_state(action="create_complete", instance=instance)
        return instance

    def perform_update(self, serializer):
        """Add the current user as the updater when updating a record, logging machine associations"""
        self._log_machine_id_state(action="update_start")
        instance = serializer.save(updated_by=self.request.user)
        self._log_machine_id_state(action="update_complete", instance=instance)
        return instance

    def update(self, request, *args, **kwargs):
        """Lock the PM so legacy image updates share the global image cap safely."""
        partial = kwargs.pop('partial', False)
        scoped_instance = self.get_object()
        with transaction.atomic():
            instance = PreventiveMaintenance.objects.select_for_update().get(
                pk=scoped_instance.pk,
            )
            self.check_object_permissions(request, instance)
            serializer = self.get_serializer(
                instance,
                data=request.data,
                partial=partial,
            )
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get statistics about preventive maintenance tasks
        """
        now = timezone.now()
        queryset = self.get_queryset()
        property_ref = request.query_params.get('property_id')
        stats_property = None
        if property_ref:
            stats_property = (
                get_accessible_properties(request.user)
                .select_related('tenant')
                .filter(property_id=property_ref)
                .first()
            )

        total = queryset.count()
        completed = queryset.filter(completed_date__isnull=False).count()
        cancelled = queryset.filter(completed_date__isnull=True, status='cancelled').count()
        overdue = queryset.filter(
            completed_date__isnull=True,
            scheduled_date__lt=now,
        ).exclude(status='cancelled').count()
        pending = total - completed - overdue - cancelled

        # Clear PreventiveMaintenance.Meta.ordering before grouping. Otherwise
        # PostgreSQL includes scheduled_date in GROUP BY and returns duplicate
        # rows for the same frequency. Count distinct PMs so machine/topic joins
        # cannot inflate the distribution.
        frequency_queryset = (
            queryset.order_by()
            .values('frequency')
            .annotate(count=Count('pk', distinct=True))
            .order_by('frequency')
        )
        frequency_distribution = [
            {'frequency': item['frequency'], 'count': item['count']}
            for item in frequency_queryset
        ]

        completed_tasks = queryset.filter(completed_date__isnull=False)
        completed_count = completed_tasks.count()
        on_time_count = completed_tasks.filter(completed_date__lte=F('scheduled_date')).count()
        completion_rate = (on_time_count / completed_count * 100) if completed_count > 0 else 0

        seven_days_later = now + timedelta(days=7)
        upcoming_queryset = queryset.filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=seven_days_later
        ).exclude(status='cancelled').order_by('scheduled_date')[:5]

        upcoming_serializer = PreventiveMaintenanceListSerializer(
            upcoming_queryset, many=True, context={'request': request}
        )

        avg_completion_times = {}
        for freq in ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom']:
            tasks = completed_tasks.filter(frequency=freq)
            if tasks.count() > 0:
                sum_days = sum(
                    (task.completed_date - task.scheduled_date).days
                    for task in tasks
                    if task.scheduled_date and task.completed_date
                )
                avg_completion_times[freq] = round(sum_days / tasks.count(), 1) if tasks.count() > 0 else 0

        response_data = {
            'can_operate': request.user.is_superuser or get_operable_properties(request.user).filter(
                property_id=property_ref
            ).exists(),
            'timezone': str(property_timezone(stats_property)) if stats_property else None,
            'counts': {
                'total': total,
                'completed': completed,
                'pending': pending,
                'overdue': overdue,
                'cancelled': cancelled,
            },
            'frequency_distribution': frequency_distribution,
            'completion_rate': round(completion_rate, 1),
            'avg_completion_times': avg_completion_times,
            'upcoming': upcoming_serializer.data
        }
        return Response(response_data)


    @action(detail=False, methods=['get', 'post'], url_path='plans')
    def plans(self, request):
        """List or create PM master plans / recurring rules."""
        if request.method.lower() == 'get':
            queryset = self._get_master_plan_queryset()
            plan_id = request.query_params.get('plan_id')
            if plan_id:
                queryset = queryset.filter(plan_id__iexact=plan_id)
            serializer = PMMasterPlanSerializer(queryset, many=True, context={'request': request})
            return Response(serializer.data)

        if not request.user.is_superuser and not request.query_params.get('property_id'):
            raise ValidationError({'property_id': 'An active property is required.'})
        serializer = PMMasterPlanSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        plan = serializer.save(created_by=request.user)
        return Response(PMMasterPlanSerializer(plan, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=['get', 'put', 'patch', 'delete'],
        url_path=r'plans/(?P<plan_id>[^/.]+)',
    )
    def plan_detail(self, request, plan_id=None):
        """Retrieve or mutate one canonically scoped PM master plan."""
        if not request.user.is_superuser and not request.query_params.get('property_id'):
            raise ValidationError({'property_id': 'An active property is required.'})
        plan = get_object_or_404(self._get_master_plan_queryset(), plan_id__iexact=plan_id)

        if request.method.lower() == 'get':
            return Response(PMMasterPlanSerializer(plan, context={'request': request}).data)

        if not request.user.is_superuser:
            plan_property_ids = set(plan.machines.values_list('property_id', flat=True))
            operable_property_ids = set(
                get_operable_properties(request.user)
                .filter(pk__in=plan_property_ids)
                .values_list('pk', flat=True)
            )
            if not plan_property_ids or operable_property_ids != plan_property_ids:
                raise PermissionDenied("Your role cannot modify this PM master plan")

        if request.method.lower() == 'delete':
            plan.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = PMMasterPlanSerializer(
            plan,
            data=request.data,
            partial=request.method.lower() == 'patch',
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        updated_plan = serializer.save()
        return Response(PMMasterPlanSerializer(updated_plan, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='projection')
    def projection(self, request):
        """Return virtual PM master-plan occurrences without creating actual PM records."""
        from datetime import datetime
        from_param = request.query_params.get('from')
        days_param = request.query_params.get('days', '365')
        try:
            days = max(1, min(int(days_param), 366))
        except (TypeError, ValueError):
            days = 365
        if from_param:
            try:
                start_dt = datetime.fromisoformat(from_param.replace('Z', '+00:00'))
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
            except ValueError:
                start_dt = timezone.now()
        else:
            start_dt = timezone.now()
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(days=days)
        occurrences = []
        for plan in self._get_master_plan_queryset().filter(active=True):
            occurrences.extend(PreventiveMaintenanceService.project_master_plan(plan, start_dt, end_dt))
        occurrences.sort(key=lambda item: item['due_date'])
        return Response({
            'from': start_dt.date().isoformat(),
            'to': (end_dt - timedelta(days=1)).date().isoformat(),
            'total': len(occurrences),
            'items': [self._serialize_projected_plan_item(item) for item in occurrences],
        })

    @action(detail=False, methods=['post'], url_path='materialize-plans')
    def materialize_plans(self, request):
        """Generate actual PM forms whose master-plan occurrences are inside their lead window."""
        property_id = str(request.data.get('property_id') or '').strip() or None
        if not request.user.is_superuser:
            if not property_id:
                raise ValidationError({'property_id': 'An active property is required.'})
            if not get_operable_properties(request.user).filter(property_id=property_id).exists():
                raise PermissionDenied("Your role cannot materialize preventive maintenance plans for this property")
        dry_run = str(request.data.get('dry_run', '')).lower() in {'1', 'true', 'yes'}
        result = PreventiveMaintenanceService.materialize_master_plan_occurrences(
            cutoff=timezone.now(),
            user=request.user,
            dry_run=dry_run,
            property_id=property_id,
        )
        return Response(result)

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """
        Get upcoming preventive maintenance tasks
        """
        days = int(request.query_params.get('days', 30))
        now = timezone.now()
        end_date = now + timedelta(days=days)

        queryset = self.get_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=end_date
        ).exclude(status='cancelled').order_by('scheduled_date')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PreventiveMaintenanceListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = PreventiveMaintenanceListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='schedule')
    def schedule(self, request):
        """
        Calendar-friendly view of preventive maintenance work.

        Groups PMs into per-day buckets so the frontend can render a calendar
        without doing the bucketing client-side. Buckets are ordered by date
        and include both open and recently-completed PMs so users can see
        what was done in the visible window.

        Query params:
            property_id External active Property identifier (required).
            from   ISO date (default = start of current property-local week).
            days   Window length in days (default 30, capped at 180).
            status `open` (default) | `completed` | `all`.

        Date-only inputs and response buckets use the selected property's
        tenant timezone. The upper date boundary is exclusive.
        """
        from datetime import date, datetime, time

        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'An active property is required.'})

        if request.user.is_superuser:
            schedule_property = Property.objects.select_related('tenant').filter(
                property_id=property_id
            ).first()
        else:
            schedule_property = get_accessible_properties(request.user).select_related('tenant').filter(
                property_id=property_id
            ).first()
        if schedule_property is None:
            raise PermissionDenied('You do not have access to this property schedule.')

        schedule_timezone = property_timezone(schedule_property)

        days_param = request.query_params.get('days', '30')
        try:
            requested_days = int(days_param)
        except (TypeError, ValueError):
            raise ValidationError({'days': 'Days must be a whole number from 1 to 180.'})
        if requested_days < 1:
            raise ValidationError({'days': 'Days must be a whole number from 1 to 180.'})
        days = min(requested_days, 180)

        from_param = request.query_params.get('from')
        if from_param:
            try:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', from_param):
                    raise ValueError
                start_date = date.fromisoformat(from_param)
            except ValueError:
                raise ValidationError({'from': 'From must be an ISO date in YYYY-MM-DD format.'})
        else:
            start_date = timezone.localtime(timezone.now(), schedule_timezone).date()
            start_date -= timedelta(days=start_date.weekday())
        start_dt = timezone.make_aware(datetime.combine(start_date, time.min), schedule_timezone)
        end_dt = start_dt + timedelta(days=days)

        status_filter = (request.query_params.get('status') or 'open').lower()
        if status_filter not in {'open', 'completed', 'all'}:
            raise ValidationError({'status': 'Status must be open, completed, or all.'})

        # A completed recurring PM keeps its original scheduled date and stores
        # its next occurrence in next_due_date. Include both fields in the
        # candidate query; filtering only on scheduled_date made the machine's
        # "Next Due" value disappear from the calendar.
        scheduled_in_window = Q(scheduled_date__gte=start_dt, scheduled_date__lt=end_dt)
        next_due_in_window = Q(next_due_date__gte=start_dt, next_due_date__lt=end_dt)
        if status_filter == 'open':
            occurrence_filter = (
                Q(completed_date__isnull=True) & scheduled_in_window
            ) | (Q(completed_date__isnull=False) & next_due_in_window)
        elif status_filter == 'completed':
            occurrence_filter = Q(completed_date__isnull=False) & scheduled_in_window
        else:
            occurrence_filter = scheduled_in_window | (
                Q(completed_date__isnull=False) & next_due_in_window
            )

        # Use only tenant/property/machine scoping here. Generic list filters such
        # as date_from/date_to target scheduled_date only, which would hide a
        # completed recurring PM whose next_due_date is inside this schedule window.
        qs = self._get_base_queryset().filter(occurrence_filter)
        if status_filter == 'open':
            qs = qs.exclude(status='cancelled')
        qs = qs.distinct().order_by('scheduled_date')

        serializer = PreventiveMaintenanceListSerializer(qs, many=True, context={'request': request})
        items_by_id = {str(item.get('pm_id')): item for item in serializer.data}

        # Bucket by local date string YYYY-MM-DD. We pre-build every day in the
        # range so the client can render an even calendar without filling gaps.
        bucket_index = {}
        days_out = []
        cursor = start_dt
        for _ in range(days):
            key = cursor.date().isoformat()
            bucket = {
                'date': key,
                'weekday': cursor.strftime('%a'),
                'items': [],
                'overdue_count': 0,
                'open_count': 0,
                'completed_count': 0,
                'cancelled_count': 0,
            }
            bucket_index[key] = bucket
            days_out.append(bucket)
            cursor += timedelta(days=1)

        now = timezone.now()

        def add_occurrence(pm, occurrence_date, occurrence_type, calendar_status):
            local_date = timezone.localtime(occurrence_date, schedule_timezone)
            key = local_date.date().isoformat()
            bucket = bucket_index.get(key)
            if bucket is None:
                return
            serialized = items_by_id.get(str(pm.pm_id))
            if serialized:
                item = dict(serialized)
                item['calendar_date'] = occurrence_date.isoformat()
                item['occurrence_type'] = occurrence_type
                item['calendar_status'] = calendar_status
                bucket['items'].append(item)

            if calendar_status == 'completed':
                bucket['completed_count'] += 1
            elif calendar_status == 'cancelled':
                bucket['cancelled_count'] += 1
            elif occurrence_date < now:
                bucket['overdue_count'] += 1
            else:
                bucket['open_count'] += 1

        for pm in qs:
            if (
                status_filter in {'open', 'all'}
                and pm.completed_date is None
                and start_dt <= pm.scheduled_date < end_dt
            ):
                add_occurrence(
                    pm,
                    pm.scheduled_date,
                    'scheduled',
                    'cancelled' if pm.status == 'cancelled' else 'open',
                )

            if (
                status_filter in {'completed', 'all'}
                and pm.completed_date is not None
                and start_dt <= pm.scheduled_date < end_dt
            ):
                add_occurrence(pm, pm.scheduled_date, 'scheduled', 'completed')

            if (
                status_filter in {'open', 'all'}
                and pm.completed_date is not None
                and pm.next_due_date is not None
                and start_dt <= pm.next_due_date < end_dt
            ):
                add_occurrence(pm, pm.next_due_date, 'next_due', 'open')


        # Add virtual PM Master Plan projections. These calendar entries are not
        # actual PreventiveMaintenance records until the materialization window.
        if status_filter in {'open', 'all'}:
            for plan in self._get_master_plan_queryset().filter(active=True):
                for occurrence in PreventiveMaintenanceService.project_master_plan(plan, start_dt, end_dt):
                    if occurrence.get('generated_pm_id'):
                        continue
                    due = occurrence['due_date']
                    local_date = timezone.localtime(due, schedule_timezone)
                    key = local_date.date().isoformat()
                    bucket = bucket_index.get(key)
                    if bucket is None:
                        continue
                    item = self._serialize_projected_plan_item(occurrence)
                    bucket['items'].append(item)
                    if due < now:
                        bucket['overdue_count'] += 1
                    else:
                        bucket['open_count'] += 1

        # Drop None entries that snuck in from missing pm_id matches.
        for bucket in days_out:
            bucket['items'] = [item for item in bucket['items'] if item]

        return Response({
            'from': start_dt.date().isoformat(),
            'to': (end_dt - timedelta(days=1)).date().isoformat(),
            'days': days_out,
            'total': sum(len(bucket['items']) for bucket in days_out),
            'status': status_filter,
            'property_id': schedule_property.property_id,
            'property_name': schedule_property.name,
            'timezone': str(schedule_timezone),
            'today': timezone.localtime(timezone.now(), schedule_timezone).date().isoformat(),
            'can_operate': request.user.is_superuser or get_operable_properties(request.user).filter(
                pk=schedule_property.pk
            ).exists(),
        })

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """
        Get overdue preventive maintenance tasks
        """
        sort_by = request.query_params.get('sort_by', 'date')
        now = timezone.now()

        queryset = self.get_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__lt=now,
        ).exclude(status='cancelled')

        if sort_by == 'overdue_days':
            queryset = queryset.annotate(
                days_overdue=ExpressionWrapper(
                    now - F('scheduled_date'), output_field=fields.DurationField()
                )
            ).order_by('-days_overdue')
        else:
            queryset = queryset.order_by('scheduled_date')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PreventiveMaintenanceListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = PreventiveMaintenanceListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pm_id=None):
        """
        Mark a preventive maintenance task as completed
        """
        scoped_instance = self.get_object()

        prepared_after_image = None
        if 'after_image' in request.FILES:
            from .job_image_processing import (
                PMImageValidationError,
                validate_and_optimize_pm_image,
            )

            try:
                payload, checksum = validate_and_optimize_pm_image(
                    request.FILES['after_image'],
                )
            except PMImageValidationError as exc:
                raise ValidationError({'after_image': str(exc)}) from exc
            prepared_after_image = {'payload': payload, 'checksum': checksum}

        completed_date = request.data.get('completed_date')
        if completed_date:
            from django.utils.dateparse import parse_datetime

            parsed_date = parse_datetime(str(completed_date))
            if parsed_date:
                completed_date = parsed_date

        checklist_updates = request.data.get('checklist_items') or request.data.get('checklist') or []
        inventory_usage = request.data.get('inventory_usage') or request.data.get('parts_used') or []

        created_file = None
        try:
            with transaction.atomic():
                instance = PreventiveMaintenance.objects.select_for_update().get(
                    pk=scoped_instance.pk,
                )
                self.check_object_permissions(request, instance)
                if instance.status == 'completed' or instance.completed_date:
                    raise ValidationError({'detail': 'This maintenance task is already completed.'})
                if instance.status == 'cancelled':
                    raise ValidationError({'detail': 'A cancelled maintenance task cannot be completed.'})
                if 'completed' not in PreventiveMaintenanceService.STATUS_TRANSITIONS.get(
                    instance.status,
                    set(),
                ):
                    raise ValidationError({
                        'detail': f'Maintenance status {instance.status!r} cannot transition to completed.'
                    })

                if prepared_after_image:
                    existing_count = (
                        instance.images.count()
                        + int(bool(instance.before_image))
                        + int(bool(instance.after_image))
                    )
                    if existing_count >= 10:
                        raise ValidationError({
                            'images': 'A preventive maintenance record can contain a maximum of 10 images.'
                        })
                    if instance.images.filter(
                        checksum=prepared_after_image['checksum'],
                    ).exists():
                        raise ValidationError({'after_image': 'Duplicate images are not allowed.'})

                for raw_item in checklist_updates:
                    item_text = (raw_item.get('item') or raw_item.get('title') or '').strip()
                    if not item_text:
                        continue
                    checklist_item = None
                    item_id = raw_item.get('id')
                    if item_id:
                        checklist_item = instance.checklists.filter(id=item_id).first()
                    if checklist_item is None:
                        checklist_item = instance.checklists.filter(item__iexact=item_text).first()
                    if checklist_item is None:
                        checklist_item = MaintenanceChecklist.objects.create(
                            maintenance=instance,
                            item=item_text[:200],
                            description=raw_item.get('description') or '',
                            order=raw_item.get('order') or instance.checklists.count() + 1,
                        )

                    is_completed = bool(raw_item.get('is_completed', raw_item.get('completed', True)))
                    checklist_item.is_completed = is_completed
                    if is_completed:
                        checklist_item.completed_by = request.user
                        checklist_item.completed_at = timezone.now()
                    checklist_item.save(update_fields=['is_completed', 'completed_by', 'completed_at'])

                usage_records = consume_inventory_items(
                    user=request.user,
                    items=inventory_usage,
                    preventive_maintenance=instance,
                    source='preventive_maintenance',
                )

                result = PreventiveMaintenanceService.update_status(
                    maintenance=instance,
                    new_status='completed',
                    user=request.user,
                    completed_date=completed_date,
                )

                if prepared_after_image:
                    evidence = PreventiveMaintenanceImage(
                        preventive_maintenance=result['current'],
                        image_type='after',
                        checksum=prepared_after_image['checksum'],
                        uploaded_by=request.user,
                    )
                    evidence.image = ContentFile(
                        prepared_after_image['payload'],
                        name=f'pm-image-{uuid.uuid4().hex}.jpg',
                    )
                    evidence._image_preoptimized = True
                    try:
                        evidence.save()
                    except Exception:
                        if evidence.image and evidence.image.name:
                            created_file = (evidence.image.storage, evidence.image.name)
                        raise
                    created_file = (evidence.image.storage, evidence.image.name)

                if instance.machines.exists():
                    instance.machines.update(last_maintenance_date=result['current'].completed_date or timezone.now())

                MaintenanceHistory.objects.create(
                    maintenance=result['current'],
                    action='completed',
                    notes=request.data.get('completion_notes') or request.data.get('notes') or '',
                    performed_by=request.user,
                )
        except Exception:
            if created_file:
                try:
                    created_file[0].delete(created_file[1])
                except Exception:
                    logger.exception('Unable to clean failed PM completion image %s', created_file[1])
            raise

        response_data = PreventiveMaintenanceDetailSerializer(
            result['current'],
            context={'request': request},
        ).data
        response_data['inventory_usage'] = InventoryUsageSerializer(
            usage_records,
            many=True,
            context={'request': request},
        ).data

        if result['next_schedule']:
            response_data['next_schedule_pm_id'] = result['next_schedule'].pm_id
            response_data['next_schedule_scheduled_date'] = result['next_schedule'].scheduled_date

        return Response(response_data)

    def _calculate_next_due_date(self, instance, reference_date):
        """
        Calculate the next scheduled date based on the maintenance frequency and completion date.
        Uses calendar-aware calculations for monthly/quarterly/annual frequencies.
        """
        frequency = instance.frequency
        logger.info(f"[PM Complete] Calculating next due date for PM {instance.pm_id}: frequency={frequency}, reference_date={reference_date}")
        
        if frequency == 'custom' and instance.custom_days:
            next_date = reference_date + timedelta(days=instance.custom_days)
            logger.info(f"[PM Complete] Custom frequency: {instance.custom_days} days -> next_date={next_date}")
            return next_date
        
        if frequency == 'daily':
            next_date = reference_date + timedelta(days=1)
        elif frequency == 'weekly':
            next_date = reference_date + timedelta(weeks=1)
        elif frequency == 'biweekly':
            next_date = reference_date + timedelta(weeks=2)
        elif frequency == 'monthly':
            # Add one calendar month
            month = reference_date.month + 1
            year = reference_date.year
            if month > 12:
                month = 1
                year += 1
            # Handle different month lengths (e.g., Jan 31 -> Feb 28/29)
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        elif frequency == 'quarterly':
            # Add three calendar months
            month = reference_date.month + 3
            year = reference_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        elif frequency == 'semi_annual':
            # Add six calendar months
            month = reference_date.month + 6
            year = reference_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        elif frequency == 'annual':
            # Add one calendar year
            next_date = reference_date.replace(year=reference_date.year + 1)
        else:
            # Default to monthly if frequency not recognized
            month = reference_date.month + 1
            year = reference_date.year
            if month > 12:
                month = 1
                year += 1
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        
        logger.info(f"[PM Complete] Calculated next scheduled date: {next_date} (from {reference_date} with frequency {frequency})")
        return next_date

    @action(detail=True, methods=['post'])
    def change_status(self, request, pm_id=None):
        """
        Update the status of a preventive maintenance task with validation.
        """
        instance = self.get_object()
        new_status = request.data.get('status')
        completed_date = request.data.get('completed_date')

        if not new_status:
            return Response(
                {'detail': 'Status is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        parsed_completed_date = None
        if completed_date:
            from django.utils.dateparse import parse_datetime

            parsed_completed_date = parse_datetime(str(completed_date))
            if not parsed_completed_date:
                return Response(
                    {'detail': 'Completed Date must be a valid datetime.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            result = PreventiveMaintenanceService.update_status(
                maintenance=instance,
                new_status=new_status,
                user=request.user,
                completed_date=parsed_completed_date,
            )
        except Exception as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )

        response_data = PreventiveMaintenanceDetailSerializer(
            result['current'],
            context={'request': request},
        ).data

        if result['next_schedule']:
            response_data['next_schedule_pm_id'] = result['next_schedule'].pm_id
            response_data['next_schedule_scheduled_date'] = result['next_schedule'].scheduled_date

        return Response(response_data)

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """
        Import preventive maintenance records from a CSV file.
        """
        if not request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can import preventive maintenance records")

        upload = request.FILES.get('file')
        if not upload:
            return Response(
                {'detail': 'CSV file is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            content = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response(
                {'detail': 'Unable to decode CSV. Please upload a UTF-8 encoded file.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = PreventiveMaintenanceService.import_from_csv_content(
            content,
            default_user=request.user,
        )

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def upload_images(self, request, pm_id=None):
        """Compatibility route using the canonical, locked evidence pipeline."""
        instance = self.get_object()
        return PreventiveMaintenanceImageUploadView().post(
            request,
            pm_id=instance.pm_id,
        )

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pm_id=None):
        """
        Reschedule a maintenance task
        """
        instance = self.get_object()
        if instance.completed_date:
            return Response(
                {'detail': 'Cannot reschedule a completed task.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if 'scheduled_date' not in request.data:
            return Response(
                {'detail': 'Scheduled date must be provided.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils.dateparse import parse_datetime

        scheduled_date = parse_datetime(str(request.data['scheduled_date']))
        if scheduled_date is None:
            return Response(
                {'detail': 'Scheduled date must be a valid ISO date and time.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.is_naive(scheduled_date):
            scheduled_date = timezone.make_aware(scheduled_date, object_timezone(instance))

        instance.scheduled_date = scheduled_date
        if 'reason' in request.data:
            instance.notes = (instance.notes or "") + f"\n[{timezone.now().strftime('%Y-%m-%d %H:%M')}] Rescheduled: {request.data['reason']}"

        instance.updated_by = request.user
        instance.save()
        serializer = PreventiveMaintenanceDetailSerializer(instance, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_priority(self, request):
        """
        Get maintenance tasks sorted by priority and status
        """
        now = timezone.now()
        queryset = self.get_queryset()

        overdue = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now)
        upcoming = queryset.filter(completed_date__isnull=True, scheduled_date__gte=now)

        priority_order = Case(
            When(priority='high', then=Value(1)),
            When(priority='medium', then=Value(2)),
            When(priority='low', then=Value(3)),
            default=Value(4),
            output_field=fields.IntegerField()
        )

        overdue = overdue.annotate(priority_order=priority_order).order_by('priority_order', 'scheduled_date')
        upcoming = upcoming.annotate(priority_order=priority_order).order_by('priority_order', 'scheduled_date')

        combined_queryset = list(overdue) + list(upcoming)

        page_size = int(request.query_params.get('page_size', 10))
        page = int(request.query_params.get('page', 1))
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_results = combined_queryset[start_idx:end_idx]

        serializer = PreventiveMaintenanceListSerializer(paginated_results, many=True, context={'request': request})

        total_items = len(combined_queryset)
        total_pages = math.ceil(total_items / page_size)

        return Response({
            'count': total_items,
            'total_pages': total_pages,
            'current_page': page,
            'results': serializer.data
        })

# Machine ViewSet (Consolidated)
class MachineViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing machines.
    """
    queryset = Machine.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    lookup_field = 'machine_id'
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'property', 'location', 'category']
    search_fields = ['name', 'description', 'machine_id', 'category']
    ordering_fields = ['name', 'created_at', 'installation_date', 'last_maintenance_date']
    ordering = ['name']

    def get_queryset(self):
        """
        Return machines scoped to canonical property access; only a platform
        superuser receives the global list.
        """
        user = self.request.user
        queryset = Machine.objects.select_related('property').prefetch_related(
            Prefetch('preventive_maintenances', queryset=PreventiveMaintenance.objects.order_by('next_due_date'))
        )

        if not user.is_superuser:
            queryset = queryset.filter(property__in=get_accessible_properties(user))

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        property_filter = self.request.query_params.get('property_id')
        if property_filter:
            queryset = queryset.filter(property__property_id=property_filter)

        category_filter = self.request.query_params.get('category')
        if category_filter:
            queryset = queryset.filter(category__iexact=category_filter)

        search_term = self.request.query_params.get('search')
        if search_term:
            queryset = queryset.filter(
                Q(name__icontains=search_term) |
                Q(description__icontains=search_term) |
                Q(machine_id__icontains=search_term) |
                Q(category__icontains=search_term)
            )

        return queryset.distinct()

    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return MachineListSerializer
        elif self.action == 'retrieve':
            return MachineDetailSerializer
        elif self.action == 'create':
            return MachineCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return MachineUpdateSerializer
        elif self.action == 'set_preventive_maintenances':
            return MachinePreventiveMaintenanceSerializer
        return MachineDetailSerializer

    def list(self, request, *args, **kwargs):
        """List all machines with lighter serializer"""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single machine with detailed information"""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Create a new machine"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        _ensure_user_can_operate_property(
            self.request.user, serializer.validated_data.get('property')
        )
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        _ensure_user_can_operate_property(self.request.user, instance.property)
        target_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, target_property)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_user_can_operate_property(self.request.user, instance.property)
        instance.delete()

    def update(self, request, *args, **kwargs):
        """Update an existing machine"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def set_maintenance(self, request, machine_id=None):
        """Set the last maintenance date to current time"""
        machine = self.get_object()
        _ensure_user_can_operate_property(request.user, machine.property)
        machine.last_maintenance_date = timezone.now()
        machine.save(update_fields=['last_maintenance_date', 'updated_at'])
        serializer = MachineDetailSerializer(machine, context={'request': request})
        return Response({
            'status': 'maintenance date updated',
            'machine': serializer.data
        })

    @action(detail=True, methods=['post'])
    def change_status(self, request, machine_id=None):
        """Change the status of a machine"""
        machine = self.get_object()
        _ensure_user_can_operate_property(request.user, machine.property)
        status_value = request.data.get('status')
        status_choices = dict(Machine.STATUS_CHOICES)

        if status_value not in status_choices:
            return Response(
                {
                    'error': f'Invalid status. Choose from {list(status_choices.keys())}',
                    'valid_statuses': status_choices
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        machine.status = status_value
        machine.save(update_fields=['status', 'updated_at'])
        serializer = MachineDetailSerializer(machine, context={'request': request})
        return Response({
            'status': f'Machine status changed to {status_value}',
            'machine': serializer.data
        })

    @action(detail=True, methods=['post'])
    def set_preventive_maintenances(self, request, machine_id=None):
        """Associate preventive maintenance schedules with the machine"""
        machine = self.get_object()
        _ensure_user_can_operate_property(request.user, machine.property)
        serializer = self.get_serializer(machine, data=request.data)
        if serializer.is_valid():
            serializer.save()
            response_serializer = MachineDetailSerializer(machine, context={'request': request})
            return Response({
                'status': 'preventive maintenances updated',
                'machine': response_serializer.data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def maintenance_history(self, request, pk=None):
        """Get history of completed maintenance for this machine"""
        machine = self.get_object()
        maintenances = machine.preventive_maintenances.filter(
            completed_date__isnull=False
        ).order_by('-completed_date')
        serializer = PreventiveMaintenanceListSerializer(maintenances, many=True, context={'request': request})
        return Response(serializer.data)

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

    def get_permissions(self):
        shared_template_writes = {
            'create', 'update', 'partial_update', 'destroy',
            'add_step', 'update_step', 'delete_step', 'reorder_steps', 'duplicate',
        }
        if self.action in shared_template_writes:
            return [IsPlatformSuperuser()]
        return super().get_permissions()

    def get_queryset(self):
        """
        Return all maintenance procedures for all users (they are shared templates).
        However, only admin users can create/update/delete them.
        """
        return MaintenanceProcedure.objects.prefetch_related('machines').all()

    def perform_create(self, serializer):
        """Only the platform break-glass user can create shared procedures."""
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can create maintenance procedures")
        serializer.save()

    def perform_update(self, serializer):
        """Only the platform break-glass user can update shared procedures."""
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can update maintenance procedures")
        serializer.save()

    def perform_destroy(self, instance):
        """Only the platform break-glass user can delete shared procedures."""
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can delete maintenance procedures")
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
class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RoomSerializer

    @staticmethod
    def _floor_from_room_name(room_name):
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

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        if str(request.query_params.get('floors_only', '')).lower() in ['1', 'true', 'yes']:
            floors = sorted(
                {floor for floor in (self._floor_from_room_name(room.name) for room in queryset) if floor},
                key=lambda floor: int(floor) if str(floor).isdigit() else str(floor)
            )
            return Response({'floors': floors})

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        """
        Return rooms that belong to properties the user has access to.
        Supports dependent Create Job dropdown filters:
        - property/property_id scoping
        - area_id validation/scoping to the area's property
        - floor filtering derived from room number format
        """
        user = self.request.user
        logger.info(f"User {user.username} requesting rooms")

        base_queryset = Room.objects.select_related('property')
        property_id = self.request.query_params.get('property') or self.request.query_params.get('property_id')
        area_id = self.request.query_params.get('area_id') or self.request.query_params.get('area')
        floor = self.request.query_params.get('floor')
        is_active = self.request.query_params.get('is_active')

        if area_id:
            area_qs = Area.objects.select_related('property').filter(
                id=area_id,
                property__in=get_accessible_properties(user),
            )
            area_obj = area_qs.first()
            if not area_obj:
                return Room.objects.none()
            if property_id and str(property_id) not in {str(area_obj.property.property_id), str(area_obj.property_id)}:
                return Room.objects.none()
            property_id = area_obj.property.property_id

        if is_active is not None:
            active_value = str(is_active).lower() in ['1', 'true', 'yes']
            base_queryset = base_queryset.filter(is_active=active_value)

        def apply_floor_filter(queryset):
            if not floor:
                return queryset
            floor_str = str(floor).strip()
            if not floor_str:
                return queryset
            return queryset.filter(
                Q(name__regex=rf'(^|\D)1{floor_str}[0-9]{{2}}(\D|$)') |
                Q(name__regex=rf'(^|\D){floor_str}[0-9]{{2,}}(\D|$)')
            )

        def apply_property_filter(queryset, prop_value):
            if not prop_value:
                return queryset
            property_q = Q(property__property_id=prop_value)
            if str(prop_value).isdigit():
                property_q |= Q(property__id=int(prop_value))
            return queryset.filter(property_q)

        user_properties = get_accessible_properties(user)
        logger.info(f"User has access to {user_properties.count()} properties")

        if property_id:
            property_lookup = Q(property_id=property_id)
            if str(property_id).isdigit():
                property_lookup |= Q(id=int(property_id))
            property_qs = user_properties.filter(property_lookup)
            if not property_qs.exists():
                logger.warning(f"User {user.username} doesn't have access to property {property_id}")
                return Room.objects.none()
            queryset = Room.objects.filter(property__in=property_qs)
        else:
            queryset = Room.objects.filter(property__in=user_properties)

        return apply_floor_filter(queryset)

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Return a CSV template that matches `bulk_import`'s schema."""
        import csv as _csv
        from io import StringIO

        buf = StringIO()
        writer = _csv.writer(buf)
        writer.writerow(['name', 'room_type', 'is_active', 'property_id'])
        writer.writerow(['101', 'Standard', 'true', ''])
        writer.writerow(['102', 'Standard', 'true', ''])
        writer.writerow(['201', 'Suite', 'true', ''])
        body = buf.getvalue()
        response = HttpResponse(body, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="pcms-rooms-template.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Create rooms from a CSV upload.

        Required: name. Optional: room_type (default 'Standard'), is_active
        (default true), property_id (defaults to ?property_id= query param).
        Existing rooms (same name) may only be reused for their existing
        canonical Property.  Room ownership is immutable and globally unique
        names must never be attached to a second Property.

        Tenant scoping: the request user must have access to every property
        being targeted. Only the documented superuser break-glass scope is
        represented by ``get_accessible_properties``."""
        import csv as _csv
        from io import StringIO

        file_obj = request.FILES.get('file') if hasattr(request, 'FILES') else None
        if file_obj is not None:
            try:
                text = file_obj.read().decode('utf-8-sig')
            except UnicodeDecodeError:
                return Response(
                    {'error': 'File must be UTF-8 encoded CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            text = (request.data or {}).get('csv', '') if isinstance(request.data, dict) else ''
        text = (text or '').strip()
        if not text:
            return Response(
                {'error': 'Send a CSV either as `file` (multipart) or `csv` (JSON string).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(text.encode('utf-8')) > 256 * 1024:
            return Response(
                {'error': 'CSV is larger than 256 KB — split it into smaller batches.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = _csv.DictReader(StringIO(text))
        if reader.fieldnames is None:
            return Response({'error': 'CSV is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        accessible_props = list(get_accessible_properties(request.user))
        if not accessible_props:
            return Response(
                {'error': 'You have no property access — cannot import rooms.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        prop_lookup = {}
        for prop in accessible_props:
            prop_lookup[str(prop.id)] = prop
            if prop.property_id:
                prop_lookup[str(prop.property_id)] = prop

        default_prop_key = (
            request.query_params.get('property_id') or
            (request.data.get('property_id') if isinstance(request.data, dict) else None)
        )
        default_prop = prop_lookup.get(str(default_prop_key)) if default_prop_key else None

        created = []
        attached = []
        errors = []

        for row_index, raw_row in enumerate(reader, start=2):
            row = {(k or '').strip().lower(): (v or '').strip() for k, v in raw_row.items() if k}
            name = row.get('name', '')
            if not name:
                errors.append({'row': row_index, 'error': 'name is required.'})
                continue
            room_type = (row.get('room_type') or 'Standard')[:50]
            is_active_raw = (row.get('is_active') or 'true').lower()
            is_active = is_active_raw not in ('0', 'false', 'no', 'inactive')

            target_prop = prop_lookup.get(row.get('property_id', '')) if row.get('property_id') else default_prop
            if target_prop is None:
                errors.append({
                    'row': row_index,
                    'error': 'property_id missing or not accessible to you.',
                })
                continue

            try:
                with transaction.atomic():
                    existing = Room.objects.select_for_update().filter(name=name[:100]).first()
                    if existing is not None:
                        if existing.property_id != target_prop.pk:
                            errors.append({
                                'row': row_index,
                                'error': (
                                    'ROOM PROPERTY CONFLICT: '
                                    f'room_id={existing.room_id}, name={existing.name}, '
                                    f'existing_property={existing.property_id}, '
                                    f'requested_property={target_prop.property_id}.'
                                ),
                            })
                            continue
                        attached.append({'row': row_index, 'room_id': existing.room_id, 'name': existing.name})
                        continue

                    room = Room.objects.create(
                        name=name[:100],
                        room_type=room_type,
                        is_active=is_active,
                        property=target_prop,
                    )
                    created.append({'row': row_index, 'room_id': room.room_id, 'name': room.name})
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({'row': row_index, 'error': str(exc)})

        return Response(
            {
                'created_count': len(created),
                'attached_count': len(attached),
                'error_count': len(errors),
                'created': created[:50],
                'attached': attached[:50],
                'errors': errors[:200],
            },
            status=status.HTTP_201_CREATED if (created or attached) and not errors
            else (status.HTTP_207_MULTI_STATUS if (created or attached) else status.HTTP_400_BAD_REQUEST),
        )


class TopicViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

    def _selected_property_queryset(self):
        property_filter = (
            self.request.query_params.get('property') or
            self.request.query_params.get('property_id')
        )
        if not property_filter or str(property_filter).lower() == 'all':
            return Property.objects.none()

        selected_properties = Property.objects.filter(
            Q(property_id=str(property_filter)) |
            Q(name=str(property_filter))
        )
        if str(property_filter).isdigit():
            selected_properties = selected_properties | Property.objects.filter(id=int(property_filter))

        return selected_properties.distinct()

    def get_queryset(self):
        """
        Return topics associated with jobs in properties the user can access.
        """
        user = self.request.user
        
        include_hidden = self.request.query_params.get('include_hidden', 'false').lower() == 'true'
        property_filter = (
            self.request.query_params.get('property') or
            self.request.query_params.get('property_id')
        )
        selected_properties = self._selected_property_queryset()
        requested_property_filter = bool(property_filter and str(property_filter).lower() != 'all')
        has_property_filter = selected_properties.exists()
        if requested_property_filter and not has_property_filter:
            return Topic.objects.none()

        def filter_topics_by_properties(queryset, properties):
            return queryset.filter(
                Q(jobs__property__in=properties) |
                Q(preventive_maintenances__job__property__in=properties)
            ).distinct()

        # Only the platform break-glass user can access all topics.
        if user.is_superuser:
            queryset = Topic.objects.all()
            if has_property_filter:
                queryset = filter_topics_by_properties(queryset, selected_properties)
            if not include_hidden:
                queryset = queryset.filter(is_visible_in_create_job=True)
            return queryset
        
        # Get properties the user has access to
        accessible_properties = get_accessible_properties(user)
        if has_property_filter:
            accessible_properties = accessible_properties.filter(id__in=selected_properties.values_list('id', flat=True))
        
        # Return topics that are used in jobs within user's accessible properties
        queryset = filter_topics_by_properties(Topic.objects.all(), accessible_properties)

        if not include_hidden:
            queryset = queryset.filter(is_visible_in_create_job=True)

        return queryset

class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Job.objects.all()
    serializer_class = JobSerializer
    lookup_field = 'job_id'
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['description', 'job_id', 'rooms__name']
    ordering_fields = ['created_at', 'updated_at', 'status', 'priority']
    ordering = ['-created_at']

    def get_queryset(self):
        """Filter jobs by user, property, and optional flags."""
        user = self.request.user
        # ✅ PERFORMANCE OPTIMIZATION: Comprehensive query optimization
        # Use select_related for foreign keys to avoid N+1 queries
        # Use prefetch_related for many-to-many and reverse foreign keys
        queryset = Job.objects.select_related(
            'user',           # Foreign key to User
            'updated_by',     # Foreign key to User
            'property',       # Canonical Job ownership
            'area',           # Foreign key to Area
            'area__property',
        ).prefetch_related(
            'rooms__property',
            'topics',            # Many-to-many relationship
            'job_images',        # Reverse foreign key to JobImage
            'preventivemaintenance_set'  # Reverse foreign key
        )

        # Canonical ownership scope; Area/Rooms remain location detail only.
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            queryset = queryset.filter(property_id__in=accessible_property_ids)

        # Filters
        property_filter = self.request.query_params.get('property_id') or self.request.query_params.get('property')
        topic_filter = self.request.query_params.get('topic_id') or self.request.query_params.get('topic')
        status_filter = self.request.query_params.get('status')
        is_pm_filter = self.request.query_params.get('is_preventivemaintenance')
        search_term = self.request.query_params.get('search')
        room_filter = self.request.query_params.get('room_id') or self.request.query_params.get('room')
        room_name_filter = self.request.query_params.get('room_name') or self.request.query_params.get('room_number')
        user_filter = self.request.query_params.get('user_id')

        if property_filter:
            # Request-facing Job scope uses only the public Property identity.
            # Database primary keys are not an active-property contract.
            queryset = queryset.filter(property__property_id=property_filter)

        if topic_filter and str(topic_filter).lower() != 'all':
            queryset = queryset.filter(topics__id=topic_filter)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if is_pm_filter is not None:
            # accept 'true'/'false' strings
            val = str(is_pm_filter).lower() in ['1', 'true', 'yes']
            queryset = queryset.filter(is_preventivemaintenance=val)

        if search_term:
            queryset = queryset.filter(
                Q(description__icontains=search_term) |
                Q(job_id__icontains=search_term)
            )

        if room_filter:
            queryset = queryset.filter(rooms__room_id=room_filter)

        if room_name_filter:
            queryset = queryset.filter(rooms__name__icontains=room_name_filter)

        area_filter = self.request.query_params.get('area') or self.request.query_params.get('area_id')
        if area_filter and str(area_filter).lower() != 'all':
            try:
                queryset = queryset.filter(area_id=int(area_filter))
            except (TypeError, ValueError):
                queryset = queryset.filter(area__name__iexact=str(area_filter))

        # Optional: filter by assigned user (supports numeric id or username)
        if user_filter and str(user_filter).lower() != 'all':
            try:
                queryset = queryset.filter(user_id=int(user_filter))
            except (TypeError, ValueError):
                queryset = queryset.filter(user__username=str(user_filter))

        return queryset.distinct()

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        """Return one authorized Property's Jobs for the interactive dashboard."""
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            return Response(
                {'detail': 'Select a property to view jobs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        property_scope = (
            Property.objects.all()
            if request.user.is_superuser
            else get_accessible_properties(request.user)
        )
        active_property = property_scope.filter(property_id=property_id).first()
        if active_property is None:
            return Response(
                {'detail': 'You do not have access to this property.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        jobs = Job.objects.filter(property=active_property).select_related(
            'user', 'property', 'area', 'area__property'
        ).prefetch_related('rooms', 'rooms__property', 'topics', 'job_images')

        search_term = str(request.query_params.get('search') or '').strip()
        priority_filter = str(request.query_params.get('priority') or '').strip()
        date_filter = str(request.query_params.get('date') or '').strip()
        status_filter = str(request.query_params.get('status') or '').strip()
        ordering = str(request.query_params.get('ordering') or '-created_at').strip()

        if priority_filter and priority_filter != 'all':
            if priority_filter not in dict(Job.PRIORITY_CHOICES):
                raise ValidationError({'priority': 'Invalid priority filter.'})
            jobs = jobs.filter(priority=priority_filter)
        if date_filter and date_filter != 'all':
            if date_filter not in {'today', 'week', 'month'}:
                raise ValidationError({'date': 'Invalid date filter.'})
            now = timezone.now()
            created_after = (
                now.replace(hour=0, minute=0, second=0, microsecond=0)
                if date_filter == 'today'
                else now - timedelta(days=7 if date_filter == 'week' else 30)
            )
            jobs = jobs.filter(created_at__gte=created_after)
        if search_term:
            jobs = jobs.filter(
                Q(job_id__icontains=search_term)
                | Q(description__icontains=search_term)
                | Q(remarks__icontains=search_term)
                | Q(rooms__name__icontains=search_term)
                | Q(area__name__icontains=search_term)
                | Q(topics__title__icontains=search_term)
                | Q(user__username__icontains=search_term)
                | Q(user__first_name__icontains=search_term)
                | Q(user__last_name__icontains=search_term)
            )

        jobs = jobs.distinct()
        status_counts = jobs.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(status='pending'), distinct=True),
            in_progress=Count('id', filter=Q(status='in_progress'), distinct=True),
            waiting_sparepart=Count(
                'id', filter=Q(status='waiting_sparepart'), distinct=True
            ),
            completed=Count('id', filter=Q(status='completed'), distinct=True),
            cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
            defect=Count('id', filter=Q(is_defective=True), distinct=True),
            preventive_maintenance=Count(
                'id', filter=Q(is_preventivemaintenance=True), distinct=True
            ),
        )

        if status_filter and status_filter != 'all':
            if status_filter == 'defect':
                jobs = jobs.filter(is_defective=True)
            elif status_filter == 'preventive_maintenance':
                jobs = jobs.filter(is_preventivemaintenance=True)
            elif status_filter in dict(Job.STATUS_CHOICES):
                jobs = jobs.filter(status=status_filter)
            else:
                raise ValidationError({'status': 'Invalid status filter.'})

        allowed_ordering = {
            'created_at', '-created_at', 'updated_at', '-updated_at',
            'priority', '-priority', 'status', '-status',
        }
        if ordering not in allowed_ordering:
            raise ValidationError({'ordering': 'Invalid ordering.'})
        jobs = jobs.order_by(ordering, '-id')

        page = self.paginate_queryset(jobs)
        serializer = JobDashboardSerializer(
            page if page is not None else jobs,
            many=True,
            context=self.get_serializer_context(),
        )
        can_operate = bool(
            request.user.is_superuser
            or get_operable_properties(request.user).filter(pk=active_property.pk).exists()
        )
        context = {
            'property_id': property_id,
            'property_name': active_property.name,
            'can_operate': can_operate,
            'can_assign': can_operate,
            'status_counts': status_counts,
        }
        if page is not None:
            response = self.get_paginated_response(serializer.data)
            response.data.update(context)
            return response
        return Response({'count': len(serializer.data), 'results': serializer.data, **context})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get job statistics without loading all jobs."""
        user = request.user
        
        # Create cache key based on user and filters
        cache_key = f"job_stats:user:{user.id}:property:{request.query_params.get('property_id', 'all')}"
        
        # Try to get from cache
        cached_stats = CacheManager.get_or_set(
            cache_key,
            lambda: self._calculate_stats(user, request.query_params),
            timeout=300  # Cache for 5 minutes
        )
        
        return Response(cached_stats)

    @action(detail=False, methods=['get'])
    def missing_rooms(self, request):
        """
        Return room numbers that exist in Room model but are not present
        in jobs matching the current user's access and optional filters.

        Query params:
        - floor: floor number prefix (e.g. 6 -> rooms like 6xx)
        - property_id/property: optional property filter
        """
        user = request.user
        floor = request.query_params.get('floor')
        property_filter = request.query_params.get('property_id') or request.query_params.get('property')

        # Base room queryset scoped by permissions
        room_qs = Room.objects.filter(is_active=True)
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            room_qs = room_qs.filter(property_id__in=accessible_property_ids)

        if property_filter:
            room_qs = room_qs.filter(
                Q(property__property_id=property_filter) |
                Q(property__id=property_filter)
            )

        # Scope by floor using room name prefix (e.g. 6 => 6xx)
        if floor:
            floor_str = str(floor).strip()
            room_qs = room_qs.filter(name__regex=rf'^{floor_str}[0-9]+$')

        room_names = sorted(set(room_qs.values_list('name', flat=True)))

        # Job rooms under same permission and optional filters
        job_qs = Job.objects.all()
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            job_qs = job_qs.filter(property_id__in=accessible_property_ids)

        if property_filter:
            job_qs = job_qs.filter(Q(property__property_id=property_filter) | Q(property_id=property_filter))

        if floor:
            floor_str = str(floor).strip()
            job_qs = job_qs.filter(rooms__name__regex=rf'^{floor_str}[0-9]+$')

        used_room_names = set(job_qs.values_list('rooms__name', flat=True))
        missing = [room for room in room_names if room and room not in used_room_names]

        return Response({
            "floor": floor,
            "property": property_filter,
            "total_rooms_in_model": len(room_names),
            "rooms_with_jobs": len([r for r in room_names if r in used_room_names]),
            "missing_rooms": missing,
        })
    
    def _calculate_stats(self, user, query_params):
        """Calculate job statistics (separated for caching)"""
        base_queryset = Job.objects.all()
        
        # Apply same filtering logic as get_queryset
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            base_queryset = base_queryset.filter(property_id__in=accessible_property_ids)
        
        # Apply filters
        property_filter = query_params.get('property_id')
        if property_filter:
            property_q = Q(property__property_id=property_filter)
            if str(property_filter).isdigit():
                property_q |= Q(property_id=int(property_filter))
            base_queryset = base_queryset.filter(property_q)
            
        # Calculate stats using aggregation
        stats = base_queryset.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(status='pending'), distinct=True),
            inProgress=Count('id', filter=Q(status='in_progress'), distinct=True),
            completed=Count('id', filter=Q(status='completed'), distinct=True),
            cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
            waitingSparepart=Count('id', filter=Q(status='waiting_sparepart'), distinct=True),
            defect=Count('id', filter=Q(is_defective=True), distinct=True),
            preventiveMaintenance=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True)
        )
        
        return stats

    @action(detail=False, methods=['get'])
    def all(self, request):
        """
        Return all jobs matching current filters without pagination.
        Useful for exports/reports where the client needs the full dataset.
        Applies the same filtering and permission rules as list/get_queryset.
        """
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        return Response({
            'count': len(data),
            'results': data
        }, status=status.HTTP_200_OK)

    def _jobs_report_queryset(self, request):
        """Return one authorized Property's Jobs with validated report filters."""
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'Select a property to export this report.'})

        property_scope = (
            Property.objects.all()
            if request.user.is_superuser
            else get_accessible_properties(request.user)
        )
        property_obj = property_scope.filter(property_id=property_id).first()
        if property_obj is None:
            raise PermissionDenied('You do not have access to this property.')

        jobs = Job.objects.filter(property=property_obj).select_related(
            'property', 'user', 'area'
        ).prefetch_related('rooms', 'topics')

        status_filter = str(request.query_params.get('status') or '').strip()
        priority_filter = str(request.query_params.get('priority') or '').strip()
        pm_filter = str(request.query_params.get('pm') or '').strip()
        topic_filter = str(request.query_params.get('topic') or '').strip()
        user_filter = str(request.query_params.get('user') or '').strip()
        month_filter = str(request.query_params.get('month') or '').strip()
        year_filter = str(request.query_params.get('year') or '').strip()
        created_from_raw = str(request.query_params.get('created_from') or '').strip()
        created_to_raw = str(request.query_params.get('created_to') or '').strip()
        search_term = str(request.query_params.get('search') or '').strip()

        if status_filter and status_filter != 'all':
            if status_filter not in dict(Job.STATUS_CHOICES):
                raise ValidationError({'status': 'Invalid status filter.'})
            jobs = jobs.filter(status=status_filter)

        if priority_filter and priority_filter != 'all':
            if priority_filter not in dict(Job.PRIORITY_CHOICES):
                raise ValidationError({'priority': 'Invalid priority filter.'})
            jobs = jobs.filter(priority=priority_filter)

        if pm_filter and pm_filter != 'all':
            if pm_filter not in {'pm', 'non_pm'}:
                raise ValidationError({'pm': 'Invalid PM filter.'})
            jobs = jobs.filter(is_preventivemaintenance=pm_filter == 'pm')

        if topic_filter and topic_filter != 'all':
            if topic_filter == 'none':
                jobs = jobs.filter(topics__isnull=True)
            elif topic_filter.isdigit():
                jobs = jobs.filter(topics__id=int(topic_filter))
            else:
                raise ValidationError({'topic': 'Invalid topic filter.'})

        if user_filter and user_filter != 'all':
            if user_filter == 'none':
                jobs = jobs.filter(user__isnull=True)
            elif user_filter.startswith('username:'):
                username = user_filter.removeprefix('username:').strip()
                if not username:
                    raise ValidationError({'user': 'Invalid user filter.'})
                jobs = jobs.filter(user__username=username)
            elif user_filter.isdigit():
                jobs = jobs.filter(user_id=int(user_filter))
            else:
                raise ValidationError({'user': 'Invalid user filter.'})

        if month_filter and month_filter != 'all':
            if not month_filter.isdigit() or not 1 <= int(month_filter) <= 12:
                raise ValidationError({'month': 'Invalid month filter.'})
            jobs = jobs.filter(created_at__month=int(month_filter))

        if year_filter and year_filter != 'all':
            if not year_filter.isdigit() or len(year_filter) != 4:
                raise ValidationError({'year': 'Invalid year filter.'})
            jobs = jobs.filter(created_at__year=int(year_filter))

        created_from = parse_date(created_from_raw) if created_from_raw else None
        created_to = parse_date(created_to_raw) if created_to_raw else None
        if created_from_raw and created_from is None:
            raise ValidationError({'created_from': 'Invalid created-from date.'})
        if created_to_raw and created_to is None:
            raise ValidationError({'created_to': 'Invalid created-to date.'})
        if created_from and created_to and created_from > created_to:
            raise ValidationError({'created_to': 'Created-to must be on or after created-from.'})
        report_timezone = property_timezone(property_obj)
        if created_from:
            created_from_at = timezone.make_aware(
                datetime.combine(created_from, time.min),
                report_timezone,
            )
            jobs = jobs.filter(created_at__gte=created_from_at)
        if created_to:
            created_to_at = timezone.make_aware(
                datetime.combine(created_to + timedelta(days=1), time.min),
                report_timezone,
            )
            jobs = jobs.filter(created_at__lt=created_to_at)

        if search_term:
            jobs = jobs.filter(
                Q(job_id__icontains=search_term)
                | Q(description__icontains=search_term)
                | Q(remarks__icontains=search_term)
                | Q(rooms__name__icontains=search_term)
                | Q(area__name__icontains=search_term)
                | Q(topics__title__icontains=search_term)
                | Q(user__username__icontains=search_term)
                | Q(user__first_name__icontains=search_term)
                | Q(user__last_name__icontains=search_term)
            )

        return property_obj, jobs.distinct().order_by('-created_at', '-id')

    @action(detail=False, methods=['get'], url_path='report-csv')
    def report_csv(self, request):
        """Stream every authorized Job matching the Jobs Report filters."""
        property_obj, jobs = self._jobs_report_queryset(request)

        class Echo:
            def write(self, value):
                return value

        writer = csv.writer(Echo(), lineterminator='\r\n')
        headers = [
            'Job ID',
            'Property',
            'Status',
            'Priority',
            'Description',
            'Topics',
            'Rooms',
            'Area',
            'Assigned To',
            'Created',
            'Updated',
            'Completed',
            'Preventive Maintenance',
            'Defective',
        ]

        def safe_text(value):
            text = str(value or '')
            if text.lstrip().startswith(('=', '+', '-', '@')):
                return "'" + text
            return text

        def format_timestamp(value):
            if not value:
                return ''
            return timezone.localtime(
                value,
                property_timezone(property_obj),
            ).strftime('%Y-%m-%d %H:%M:%S')

        def stream_rows():
            # UTF-8 BOM keeps Thai and other Unicode text readable in Excel.
            yield '\ufeff'
            yield writer.writerow(headers)
            for job in jobs.iterator(chunk_size=500):
                yield writer.writerow([
                    safe_text(job.job_id),
                    safe_text(property_obj.name),
                    safe_text(job.status),
                    safe_text(job.priority),
                    safe_text(job.description),
                    safe_text('; '.join(topic.title for topic in job.topics.all())),
                    safe_text('; '.join(room.name for room in job.rooms.all())),
                    safe_text(job.area.name if job.area else ''),
                    safe_text(display_name_from_user(job.user, fallback='Unassigned')),
                    format_timestamp(job.created_at),
                    format_timestamp(job.updated_at),
                    format_timestamp(job.completed_at),
                    'Yes' if job.is_preventivemaintenance else 'No',
                    'Yes' if job.is_defective else 'No',
                ])

        report_date = timezone.localtime(
            timezone.now(),
            property_timezone(property_obj),
        ).date()
        filename = f'jobs-report-{property_obj.property_id}-{report_date.isoformat()}.csv'
        response = StreamingHttpResponse(
            stream_rows(),
            content_type='text/csv; charset=utf-8',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def get_object(self):
        queryset = self.get_queryset()
        filter_kwargs = {self.lookup_field: self.kwargs[self.lookup_field]}
        obj = get_object_or_404(queryset, **filter_kwargs)
        self.check_object_permissions(self.request, obj)
        # Reads retain the broader accessible-Property scope. Every detail
        # mutation, including custom actions, must additionally pass through
        # the canonical operable-Property write gate.
        if self.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            _ensure_user_can_operate_property(self.request.user, obj.property)
        return obj

    @action(detail=True, methods=['patch'])
    def update_status(self, request, job_id=None):
        job = self.get_object()
        status_value = request.data.get('status')
        if status_value and status_value not in dict(Job.STATUS_CHOICES):
            return Response({"detail": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)
        if job.status == 'completed' and status_value != 'completed':
            return Response(
                {"detail": "Completed jobs cannot have their status changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.is_authenticated:
            job.updated_by = request.user

        if status_value == 'completed' and job.status != 'completed':
            job.completed_at = timezone.now()

        job.status = status_value
        job.save()
        serializer = self.get_serializer(job)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_jobs(self, request):
        """Return Jobs assigned to the user for one active readable Property."""
        user = request.user
        
        logger.info(f"my_jobs endpoint called by user {user.username} (ID: {user.id})")

        # Optional override: platform break-glass may inspect another user's jobs.
        target_user = user
        user_filter = request.query_params.get('user_id')
        if user_filter and str(user_filter).lower() != 'all':
            # Resolve by numeric id or username
            resolved_user = None
            try:
                resolved_user = User.objects.filter(id=int(user_filter)).first()
            except (TypeError, ValueError):
                resolved_user = User.objects.filter(username=str(user_filter)).first()

            if resolved_user:
                if user.is_superuser or resolved_user.id == user.id:
                    target_user = resolved_user
                    logger.info(f"Filtering jobs for target_user: {target_user.username} (ID: {target_user.id})")
                else:
                    logger.warning(f"User {user.username} attempted to view jobs for user {resolved_user.username} but lacks permission")
                    return Response({
                        'detail': 'Not permitted to view other users\' jobs'
                    }, status=status.HTTP_403_FORBIDDEN)

        property_filter = str(request.query_params.get('property_id') or '').strip()
        if not property_filter:
            return Response(
                {'detail': 'Select a property to view your jobs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        property_scope = (
            Property.objects.all()
            if user.is_superuser
            else get_accessible_properties(user)
        )
        active_property = property_scope.filter(property_id=property_filter).first()
        if active_property is None:
            return Response(
                {'detail': 'You do not have access to this property.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Job.user is the current assignee relation. Job.property is the sole
        # ownership and active-Property boundary for this projection.
        jobs = Job.objects.filter(
            user=target_user,
            property=active_property,
        ).select_related(
            'user', 'updated_by', 'property', 'area', 'area__property'
        ).prefetch_related(
            'rooms', 'rooms__property', 'topics', 'job_images', 'job_images__uploaded_by'
        )

        # Apply additional filters if provided
        status_filter = request.query_params.get('status')
        priority_filter = request.query_params.get('priority')
        date_filter = request.query_params.get('date')
        is_pm_filter = request.query_params.get('is_preventivemaintenance')
        search_term = request.query_params.get('search')
        room_filter = request.query_params.get('room_id')
        room_name_filter = request.query_params.get('room_name')

        valid_statuses = dict(Job.STATUS_CHOICES)
        valid_priorities = dict(Job.PRIORITY_CHOICES)
        if status_filter and status_filter not in valid_statuses:
            return Response(
                {'detail': 'Invalid status filter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if priority_filter and priority_filter not in valid_priorities:
            return Response(
                {'detail': 'Invalid priority filter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if date_filter and date_filter not in {'today', 'week', 'month'}:
            return Response(
                {'detail': 'Invalid date filter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(f"Applied property filter: {property_filter}")

        if is_pm_filter is not None:
            val = str(is_pm_filter).lower() in ['1', 'true', 'yes']
            jobs = jobs.filter(is_preventivemaintenance=val)
            logger.info(f"Applied is_preventivemaintenance filter: {val}")

        if priority_filter:
            jobs = jobs.filter(priority=priority_filter)

        if date_filter:
            now = timezone.now()
            if date_filter == 'today':
                created_after = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif date_filter == 'week':
                created_after = now - timedelta(days=7)
            else:
                created_after = now - timedelta(days=30)
            jobs = jobs.filter(created_at__gte=created_after)

        if room_filter:
            jobs = jobs.filter(rooms__room_id=room_filter)
            logger.info(f"Applied room_id filter: {room_filter}")

        if room_name_filter:
            jobs = jobs.filter(
                Q(rooms__name__icontains=room_name_filter)
                | Q(area__name__icontains=room_name_filter)
            )
            logger.info(f"Applied room_name filter: {room_name_filter}")

        if search_term:
            jobs = jobs.filter(
                Q(description__icontains=search_term) |
                Q(job_id__icontains=search_term) |
                Q(topics__title__icontains=search_term) |
                Q(rooms__name__icontains=search_term) |
                Q(area__name__icontains=search_term) |
                Q(user__username__icontains=search_term) |
                Q(user__first_name__icontains=search_term) |
                Q(user__last_name__icontains=search_term)
            )
            logger.info(f"Applied search filter: {search_term}")

        jobs = jobs.distinct()
        status_counts = jobs.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(status='pending'), distinct=True),
            in_progress=Count('id', filter=Q(status='in_progress'), distinct=True),
            waiting_sparepart=Count(
                'id', filter=Q(status='waiting_sparepart'), distinct=True
            ),
            completed=Count('id', filter=Q(status='completed'), distinct=True),
            cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
        )

        if status_filter:
            jobs = jobs.filter(status=status_filter)
            logger.info(f"Applied status filter: {status_filter}")

        jobs = jobs.annotate(
            _comments_count=Count('comments', distinct=True)
        ).order_by('-created_at')
        page = self.paginate_queryset(jobs)
        serializer = self.get_serializer(page if page is not None else jobs, many=True)
        user_display_name = display_name_from_user(user, fallback=user.email or 'User')
        target_display_name = display_name_from_user(target_user, fallback=target_user.email or 'User')
        can_operate = bool(
            user.is_superuser
            or get_operable_properties(user).filter(pk=active_property.pk).exists()
        )

        if page is not None:
            response = self.get_paginated_response(serializer.data)
            response.data.update({
                'property_id': property_filter,
                'can_operate': can_operate,
                'status_counts': status_counts,
                'user_id': user.id,
                'display_name': user_display_name,
                'target_user_id': target_user.id,
                'target_display_name': target_display_name,
            })
            return response

        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
            'property_id': property_filter,
            'can_operate': can_operate,
            'status_counts': status_counts,
            'user_id': user.id,
            'display_name': user_display_name,
            'target_user_id': target_user.id,
            'target_display_name': target_display_name,
        }, status=status.HTTP_200_OK)

    def _operable_property_ids(self):
        """Canonical Property PKs the current user may mutate."""
        user = self.request.user
        if not user.is_authenticated:
            return set()
        if user.is_superuser:
            return None
        return set(get_operable_properties(user).values_list('pk', flat=True))

    def _validate_operable_scope(self, serializer):
        """Validate canonical write authority and Job location integrity.

        Job.property is the authorization boundary. Room and Area are location
        details and may never widen or substitute for that boundary.
        """
        operable = self._operable_property_ids()

        resolved_property = serializer.validated_data.get('_resolved_property')
        if resolved_property is None:
            raise ValidationError({'property_id': 'A canonical property is required.'})
        if operable is not None and resolved_property.pk not in operable:
            raise PermissionDenied("Your role cannot modify data for this property.")

        room_instances = serializer.validated_data.get('_resolved_rooms')
        if room_instances is None:
            room_instances = serializer.instance.rooms.all() if serializer.instance is not None else ()
        for room in room_instances:
            if room.property_id != resolved_property.pk:
                raise ValidationError({
                    'rooms': 'All selected rooms must belong to the Job property.'
                })

        area = serializer.validated_data.get('area', getattr(serializer.instance, 'area', None))
        if area is not None and getattr(area, 'property_id', None) is not None:
            if area.property_id != resolved_property.pk:
                raise ValidationError({
                    'area_id': 'Selected area must belong to the Job property.'
                })

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            self._validate_operable_scope(serializer)
            serializer.save(user=self.request.user, updated_by=self.request.user)
        else:
            serializer.save()

        # Invalidate cache after creating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_update(self, serializer):
        if self.request.user.is_authenticated:
            self._validate_operable_scope(serializer)
            instance = serializer.instance
            data = serializer.validated_data
            if instance.status == 'completed' and 'status' in data and data['status'] != 'completed':
                raise ValidationError("Completed jobs cannot have their status changed.")
            if 'status' in data and data['status'] == 'completed' and instance.status != 'completed':
                serializer.save(updated_by=self.request.user, completed_at=timezone.now())
            else:
                serializer.save(updated_by=self.request.user)
        else:
            serializer.save()

        # Invalidate cache after updating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        # Invalidate cache after deleting job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, job_id=None):
        """List or create comments inside one active external Property scope."""
        property_filter = str(request.query_params.get('property_id') or '').strip()
        if not property_filter:
            return Response(
                {'detail': 'A property_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # get_object() resolves the external job_id through get_queryset(). The
        # property_id query filter is the active-Property boundary; writes also
        # pass through the canonical operable-Property gate in get_object().
        job = self.get_object()

        if request.method.lower() == 'get':
            qs = job.comments.select_related('author').order_by('created_at')
            serializer = JobCommentSerializer(qs, many=True, context={'request': request})
            return Response({
                'count': qs.count(),
                'results': serializer.data,
            }, status=status.HTTP_200_OK)

        # POST
        serializer = JobCommentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        comment = JobComment.objects.create(
            job=job,
            author=request.user if request.user.is_authenticated else None,
            comment=serializer.validated_data['comment'],
        )
        out = JobCommentSerializer(comment, context={'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='audit-log')
    def audit_log(self, request, job_id=None):
        """Synthetic activity log derived from existing job state and comments.

        Until a dedicated AuditLog model lands (which would require a
        migration), we surface the auditable timestamps already on the model:
        creation, completion, image uploads, comments, and remark notes (the
        UpdateStatusModal prepends `[ts · user → new_status] message` lines
        which we parse out here). The response is a chronological list of
        events the frontend can render as a timeline.
        """
        job = self.get_object()
        events = []

        creator_name = display_name_from_user(job.user, fallback='system')
        events.append({
            'kind': 'created',
            'at': job.created_at.isoformat() if job.created_at else None,
            'actor': creator_name,
            'message': 'Job created',
        })

        if job.completed_at:
            updater_name = display_name_from_user(job.updated_by, fallback='unknown')
            events.append({
                'kind': 'completed',
                'at': job.completed_at.isoformat(),
                'actor': updater_name,
                'message': 'Job completed',
            })

        # Image uploads — JobImage has uploaded_at and uploaded_by
        for image in job.job_images.all().order_by('uploaded_at'):
            uploaded_by = display_name_from_user(image.uploaded_by, fallback='unknown') if image.uploaded_by else None
            image_url = None
            if image.image:
                try:
                    image_url = request.build_absolute_uri(image.image.url)
                except Exception:
                    image_url = image.image.url
            events.append({
                'kind': 'photo_uploaded',
                'at': image.uploaded_at.isoformat() if image.uploaded_at else None,
                'actor': uploaded_by or 'unknown',
                'message': 'Photo uploaded',
                'image_url': image_url,
            })

        # Comments
        for comment in job.comments.select_related('author').order_by('created_at'):
            author = display_name_from_user(comment.author, fallback='unknown')
            events.append({
                'kind': 'comment',
                'at': comment.created_at.isoformat() if comment.created_at else None,
                'actor': author,
                'message': comment.comment,
            })

        # Parse status-change lines that UpdateStatusModal appends to remarks.
        # Format: `[YYYY-MM-DD HH:MM · username → status] message`
        if job.remarks:
            import re

            pattern = re.compile(
                r'\[(?P<ts>\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\s*[·-]\s*(?P<actor>[^→]+?)\s*→\s*(?P<status>[a-z_]+)\]\s*(?P<msg>.*)',
                re.IGNORECASE,
            )
            for line in job.remarks.splitlines():
                match = pattern.search(line)
                if not match:
                    continue
                events.append({
                    'kind': 'status_change',
                    'at': match.group('ts').replace(' ', 'T') + ':00',
                    'actor': match.group('actor').strip(),
                    'message': f"Status → {match.group('status')}",
                    'note': match.group('msg').strip() or None,
                    'new_status': match.group('status'),
                })

        # Sort: missing timestamps last
        def _sort_key(event):
            return event.get('at') or '9999-12-31T23:59:59'

        events.sort(key=_sort_key)

        return Response({
            'job_id': job.job_id,
            'count': len(events),
            'events': events,
        })

    @action(detail=True, methods=['post'], url_path='reassign')
    def reassign(self, request, job_id=None):
        """Reassign a job to an active operator for its canonical Property.

        Body: {"user_id": <id|username>, "property_id": <external id>, "note"?: str}

        Stamps the remarks with the same status-note format the audit log
        already parses, so the timeline picks up the reassignment as a
        first-class event. Pushes both the new and previous assignee."""
        job = self.get_object()
        _ensure_user_can_operate_property(request.user, job.property)

        active_property_id = str((request.data or {}).get('property_id') or '').strip()
        if not active_property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        active_property = Property.objects.filter(property_id=active_property_id).first()
        if active_property is None:
            raise ValidationError({'property_id': 'Invalid property ID.'})
        if active_property.pk != job.property_id:
            raise ValidationError({'property_id': 'Active property does not match this job.'})

        target_raw = (request.data or {}).get('user_id')
        if not target_raw:
            return Response(
                {'error': 'user_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_str = str(target_raw).strip()
        candidates = _job_assignment_candidates(job.property)
        target = None
        if target_str.isdigit():
            target = candidates.filter(pk=int(target_str)).first()
        if target is None:
            target = candidates.filter(username__iexact=target_str).first()
        if target is None:
            return Response(
                {'error': 'Target user is not eligible for this property.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        previous = job.user
        if previous and previous.pk == target.pk:
            return Response(
                {'error': 'Job is already assigned to that user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = ((request.data or {}).get('note') or '').strip()[:300]
        stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
        actor = display_name_from_user(request.user, fallback=getattr(request.user, 'email', None) or 'system')
        new_username = display_name_from_user(target, fallback=getattr(target, 'email', None) or f'user-{target.pk}')
        prev_username = display_name_from_user(previous, fallback='unassigned') if previous else 'unassigned'
        log_line = (
            f"[{stamp} · {actor} → reassigned] "
            f"{prev_username} → {new_username}"
            + (f" — {note}" if note else '')
        )

        job.user = target
        job.updated_by = request.user if getattr(request.user, 'is_authenticated', False) else target
        job.remarks = f"{job.remarks}\n{log_line}" if job.remarks else log_line
        job.save(update_fields=['user', 'updated_by', 'remarks', 'updated_at'])

        # Push to the new assignee; signal-driven push on Job.save() already
        # fires on changed status but not on assignment, so we send an
        # explicit one here. Previous assignee gets a courtesy note.
        try:
            from .push import send_push_to_user
            send_push_to_user(
                target,
                {
                    'title': 'Job reassigned to you',
                    'body': (job.description or job.job_id)[:120],
                    'tag': f'job-reassign-{job.job_id}',
                    'url': f'/dashboard/jobs/{job.job_id}',
                    'renotify': True,
                },
            )
            if previous is not None and previous.pk != target.pk:
                send_push_to_user(
                    previous,
                    {
                        'title': 'Job reassigned',
                        'body': f"#{job.job_id} is now assigned to {new_username}.",
                        'tag': f'job-reassign-prev-{job.job_id}',
                        'url': f'/dashboard/jobs/{job.job_id}',
                    },
                )
        except Exception:  # pragma: no cover - defensive
            logger.exception('Reassignment push failed for job=%s', job.job_id)

        return Response(
            {
                'job_id': job.job_id,
                'assignee': new_username,
                'previous': prev_username,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='assignment-candidates')
    def assignment_candidates(self, request, job_id=None):
        """Return the smallest same-Property set needed by reassignment UI."""
        job = self.get_object()
        _ensure_user_can_operate_property(request.user, job.property)

        active_property_id = str(request.query_params.get('property_id') or '').strip()
        if not active_property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        active_property = Property.objects.filter(property_id=active_property_id).first()
        if active_property is None:
            raise ValidationError({'property_id': 'Invalid property ID.'})
        if active_property.pk != job.property_id:
            raise ValidationError({'property_id': 'Active property does not match this job.'})

        candidates = _job_assignment_candidates(job.property)
        return Response(JobAssignmentCandidateSerializer(candidates, many=True).data)


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantSerializer

    def get_queryset(self):
        qs = get_user_tenants(self.request.user).prefetch_related('memberships', 'properties')
        return qs.annotate(
            property_count=Count('properties', distinct=True),
            active_user_count=Count(
                'memberships',
                filter=Q(memberships__is_active=True),
                distinct=True,
            ),
        )

    def perform_create(self, serializer):
        if (
            not self.request.user.is_superuser
            and not getattr(settings, 'SELF_SERVICE_TENANT_CREATION_ENABLED', False)
        ):
            raise PermissionDenied(
                "Tenant creation is restricted to platform administrators."
            )
        if not self.request.user.is_superuser:
            if get_user_tenants(self.request.user).exists():
                raise PermissionDenied("Your user already belongs to a tenant.")
        tenant = serializer.save(owner=self.request.user)
        TenantMembership.objects.get_or_create(
            tenant=tenant,
            user=self.request.user,
            defaults={'role': 'owner'},
        )
        if not hasattr(tenant, 'subscription'):
            from .tenancy import ensure_default_plan

            TenantSubscription.objects.create(
                tenant=tenant,
                plan=ensure_default_plan(),
                status='trialing',
            )

    @action(detail=True, methods=['get'])
    def usage(self, request, pk=None):
        tenant = self.get_object()
        return Response(tenant_usage_counts(tenant))

    @action(detail=False, methods=['get'], url_path='timezones')
    def timezones(self, request):
        return Response(timezone_options())


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SubscriptionPlanSerializer
    queryset = SubscriptionPlan.objects.all()

    def get_queryset(self):
        qs = SubscriptionPlan.objects.all()
        if not self.request.user.is_superuser:
            qs = qs.filter(is_active=True)
        return qs.order_by('sort_order', 'monthly_price', 'name')

    def perform_create(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can create subscription plans.")
        serializer.save()

    def perform_update(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can update subscription plans.")
        serializer.save()

    def perform_destroy(self, instance):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can delete subscription plans.")
        instance.delete()


class TenantMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantMembershipSerializer

    def get_queryset(self):
        if self.request.user.is_superuser:
            return TenantMembership.objects.select_related('tenant', 'user').prefetch_related('properties')
        return (
            TenantMembership.objects.select_related('tenant', 'user')
            .prefetch_related('properties')
            .filter(tenant__in=get_user_tenants(self.request.user))
        )

    def _get_tenant_from_request(self, serializer=None):
        tenant = None
        if serializer is not None:
            tenant = serializer.validated_data.get('tenant')
        if tenant is None:
            tenant_id = self.request.data.get('tenant') or self.request.query_params.get('tenant')
            if tenant_id:
                tenant = get_object_or_404(Tenant, pk=tenant_id)
        return tenant

    def _validate_membership_properties(self, tenant, serializer):
        properties = serializer.validated_data.get('properties') or []
        invalid = [prop.name for prop in properties if prop.tenant_id and prop.tenant_id != tenant.id]
        if invalid:
            raise ValidationError({
                'properties': f"Properties must belong to tenant {tenant.name}: {', '.join(invalid)}"
            })

    def perform_create(self, serializer):
        tenant = self._get_tenant_from_request(serializer)
        if not user_can_manage_tenant(self.request.user, tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        enforce_subscription_limit(tenant, 'max_users')
        self._validate_membership_properties(tenant, serializer)
        membership = serializer.save(invited_by=self.request.user)
        for prop in membership.properties.all():
            if prop.tenant_id is None:
                prop.tenant = membership.tenant
                prop.save(update_fields=['tenant'])

    def perform_update(self, serializer):
        instance = self.get_object()
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        self._validate_membership_properties(instance.tenant, serializer)
        membership = serializer.save()
        for prop in membership.properties.all():
            if prop.tenant_id is None:
                prop.tenant = membership.tenant
                prop.save(update_fields=['tenant'])

    def perform_destroy(self, instance):
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


class TenantSubscriptionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantSubscriptionSerializer

    def get_queryset(self):
        qs = TenantSubscription.objects.select_related('tenant', 'plan')
        if self.request.user.is_superuser:
            return qs
        return qs.filter(tenant__in=get_user_tenants(self.request.user))

    def perform_create(self, serializer):
        tenant = serializer.validated_data.get('tenant')
        if not user_can_manage_tenant(self.request.user, tenant):
            raise PermissionDenied("You do not have permission to manage this subscription.")
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this subscription.")
        serializer.save()


class UsageMetricViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = UsageMetricSerializer

    def get_queryset(self):
        qs = UsageMetric.objects.select_related('tenant')
        if self.request.user.is_superuser:
            return qs
        return qs.filter(tenant__in=get_user_tenants(self.request.user))


class AreaViewSet(viewsets.ModelViewSet):
    """CRUD for property areas/zones with tenant (property) isolation."""
    permission_classes = [IsAuthenticated]
    serializer_class = AreaSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Area.objects.select_related('property').annotate(
            jobs_count_value=Count('jobs', distinct=True)
        )

        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            qs = qs.filter(property_id__in=accessible_property_ids)

        property_filter = self.request.query_params.get('property_id') or self.request.query_params.get('property')
        if property_filter:
            qs = qs.filter(property__property_id=property_filter)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            val = str(is_active).lower() in ['1', 'true', 'yes']
            qs = qs.filter(is_active=val)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return qs.order_by('property__name', 'name')

    def perform_create(self, serializer):
        property_obj = serializer.validated_data.get('property')
        _ensure_user_can_operate_property(self.request.user, property_obj)
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        new_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, instance.property)
        _ensure_user_can_operate_property(self.request.user, new_property)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: mark inactive rather than removing the row so historical
        jobs keep their area reference."""
        instance = self.get_object()
        _ensure_user_can_operate_property(request.user, instance.property)
        hard = str(request.query_params.get('hard', '')).lower() in ['1', 'true', 'yes']
        if hard and request.user.is_superuser:
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(AreaSerializer(instance).data, status=status.HTTP_200_OK)


class UserProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer

    def get_queryset(self):
        # For the 'detailed' action, only admins can see all user profiles
        if self.action == 'detailed':
            if self.request.user.is_superuser:
                return UserProfile.objects.all()
            else:
                # Non-admin users can only see their own profile
                return UserProfile.objects.filter(user=self.request.user)
        else:
            # For other actions, return only the current user's profile
            return UserProfile.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        profile, _ = UserProfile.objects.select_related('user').get_or_create(
            user=request.user,
        )
        if request.method == 'PATCH':
            allowed_fields = {'first_name', 'last_name', 'positions'}
            rejected_fields = sorted(set(request.data.keys()) - allowed_fields)
            if rejected_fields:
                raise ValidationError({
                    field: ['This field is read-only on the current-user profile.']
                    for field in rejected_fields
                })
            update_serializer = CurrentUserProfileUpdateSerializer(
                profile,
                data=request.data,
                partial=True,
                context=self.get_serializer_context(),
            )
            update_serializer.is_valid(raise_exception=True)
            profile = update_serializer.save()

        serializer = CurrentUserProfileSerializer(
            profile,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def detailed(self, request):
        """Get all user profiles with properties for admin users"""
        # Verify admin access
        if not request.user.is_superuser:
            raise PermissionDenied("Only admin users can access all user profiles")
        
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['patch', 'put'])
    def update_email_notifications(self, request):
        """Update email notifications setting for current user"""
        try:
            profile, created = UserProfile.objects.get_or_create(user=request.user)
            email_notifications_enabled = request.data.get('email_notifications_enabled')
            
            if email_notifications_enabled is None:
                return Response(
                    {'error': 'email_notifications_enabled field is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            profile.email_notifications_enabled = bool(email_notifications_enabled)
            profile.save()
            
            serializer = self.get_serializer(profile)
            return Response({
                'message': 'Email notifications setting updated successfully',
                'email_notifications_enabled': profile.email_notifications_enabled,
                'profile': serializer.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error updating email notifications: {e}", exc_info=True)
            return Response(
                {'error': 'Failed to update email notifications setting'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def add_property(self, request, pk=None):
        raise ValidationError({
            'detail': 'Direct property grants are retired; manage access through TenantMembership.'
        })

    @action(detail=True, methods=['post'])
    def remove_property(self, request, pk=None):
        raise ValidationError({
            'detail': 'Direct property grants are retired; manage access through TenantMembership.'
        })

class PropertyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PropertySerializer
    lookup_field = 'property_id'

    def get_queryset(self):
        logger.info(f"User {self.request.user.username} requesting properties")
        
        # ✅ PERFORMANCE: Optimize query with prefetch_related
        base_queryset = Property.objects.select_related('tenant').prefetch_related('canonical_rooms')
        
        # Only superuser is the documented platform-wide break-glass scope.
        # Staff users remain scoped by TenantMembership.
        if self.request.user.is_superuser:
            logger.info(f"Platform superuser {self.request.user.username} - returning all properties")
            queryset = base_queryset
            logger.info(f"Found {queryset.count()} total properties")
            return queryset
        
        # Check if user has properties assigned
        user_properties = get_accessible_properties(self.request.user).select_related('tenant').prefetch_related('canonical_rooms')
        logger.info(f"User {self.request.user.username} has {user_properties.count()} assigned properties")
        
        # Return only properties assigned to the user
        return user_properties

    def perform_create(self, serializer):
        tenant = serializer.validated_data.get('tenant')
        if tenant is None:
            tenant = ensure_tenant_for_user(self.request.user)
        if not user_can_manage_tenant(self.request.user, tenant):
            raise PermissionDenied("You do not have permission to add properties to this tenant.")
        enforce_subscription_limit(tenant, 'max_properties')
        prop = serializer.save(tenant=tenant)
        membership, _ = TenantMembership.objects.get_or_create(
            tenant=tenant,
            user=self.request.user,
            defaults={'role': 'owner'},
        )
        membership.properties.add(prop)

    def get_object(self):
        property_id = self.kwargs.get('property_id')
        logger.info(f"Looking up property with ID: {property_id}")

        try:
            obj = Property.objects.select_related('tenant').get(property_id=property_id)
            logger.info(f"Found property: {obj.name}")

            if self.request.user.is_superuser:
                logger.info(f"Platform superuser {self.request.user.username} accessing property {property_id}")
                return obj
            
            # Check if user has access to this property through SaaS membership
            if not get_accessible_properties(self.request.user).filter(id=obj.id).exists():
                logger.warning(f"Property {property_id} exists but not associated with user {self.request.user.username}")
                raise PermissionDenied(f"You do not have permission to access property {property_id}")

            return obj
        except Property.DoesNotExist:
            logger.error(f"Property with ID {property_id} not found in database")
            raise

    @action(detail=True, methods=['get'])
    def is_preventivemaintenance(self, request, property_id=None):
        logger.info(f"is_preventivemaintenance called for property_id: {property_id}")
        try:
            property_obj = Property.objects.get(property_id=property_id)
            if property_obj.tenant_id:
                raise PermissionDenied("Tenant-backed property access is managed by TenantMembership.")
            logger.info(f"Found property: {property_obj.name}")

            if request.user.is_superuser:
                logger.info(f"Platform superuser {request.user.username} accessing property {property_id}")
                pass  # Allow access
            elif not get_accessible_properties(request.user).filter(id=property_obj.id).exists():
                logger.warning(f"User {request.user.username} does not have permission for property {property_id}")
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )

            has_pm_jobs = Job.objects.filter(
                property=property_obj,
                is_preventivemaintenance=True
            ).exists()

            logger.info(f"Property {property_id} has PM jobs: {has_pm_jobs}")
            return Response({
                'property_id': property_obj.property_id,
                'is_preventivemaintenance': has_pm_jobs
            })
        except Property.DoesNotExist:
            logger.error(f"Property {property_id} not found")
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['post'])
    def add_user(self, request, property_id=None):
        property_obj = get_object_or_404(Property, property_id=property_id)
        membership = TenantMembership.objects.filter(
            user=request.user, tenant=property_obj.tenant, is_active=True
        ).first()
        if property_obj.tenant_id is None or membership is None:
            raise ValidationError({
                'detail': 'User must have an active TenantMembership before property access can be assigned.'
            })
        if membership.role not in TENANT_WIDE_PROPERTY_ROLES:
            membership.properties.add(property_obj)
        return Response({
            'success': True,
            'property_id': property_obj.property_id,
            'property_name': property_obj.name,
        })

    @action(detail=False, methods=['post'])
    def assign_properties(self, request):
        """
        Assign multiple properties to the current user.
        Used during onboarding for new users.
        
        Expected payload: { "property_ids": [1, 2, 3] }
        """
        logger.info(f"assign_properties called by user: {request.user.username}")
        membership = TenantMembership.objects.filter(user=request.user, is_active=True).first()
        if membership is None:
            raise ValidationError({'detail': 'User must have an active TenantMembership before property access can be assigned.'})
        property_ids = request.data.get('property_ids', [])
        
        if not property_ids:
            return Response(
                {"error": "property_ids is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        assigned = []
        errors = []
        resolved_properties = []
        
        for prop_id in property_ids:
            try:
                # Try to find property by id (integer) or property_id (string)
                if isinstance(prop_id, int):
                    property_obj = Property.objects.get(id=prop_id)
                else:
                    property_obj = Property.objects.get(property_id=prop_id)
                if property_obj.tenant_id != membership.tenant_id:
                    raise ValidationError({'property_ids': 'Every property must belong to your membership tenant.'})
                resolved_properties.append(property_obj)
                
                assigned.append({
                    'id': property_obj.id,
                    'property_id': property_obj.property_id,
                    'name': property_obj.name
                })
            except Property.DoesNotExist:
                errors.append({'id': prop_id, 'error': 'Property not found'})
            except Exception as e:
                errors.append({'id': prop_id, 'error': str(e)})
        
        if errors:
            return Response({'success': False, 'assigned': [], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        if membership.role not in TENANT_WIDE_PROPERTY_ROLES:
            membership.properties.set(resolved_properties)
        logger.info(f"assign_properties result: {len(assigned)} assigned, {len(errors)} errors")
        
        # Send welcome email to new user if properties were assigned successfully
        if assigned and request.user.email:
            try:
                from .email_utils import send_welcome_email, send_new_user_notification_to_admin
                
                # Send welcome email to the new user
                email_sent = send_welcome_email(
                    user_email=request.user.email,
                    username=request.user.get_full_name() or request.user.username,
                    properties=assigned
                )
                
                if email_sent:
                    logger.info(f"Welcome email sent to new user: {request.user.email}")
                else:
                    logger.warning(f"Failed to send welcome email to: {request.user.email}")
                
                # Also notify admins about the new user
                send_new_user_notification_to_admin(
                    new_user_email=request.user.email,
                    new_username=request.user.get_full_name() or request.user.username,
                    properties=assigned
                )
                
            except Exception as email_error:
                logger.error(f"Error sending welcome email: {email_error}")
                # Don't fail the request if email fails
        
        return Response({
            'success': len(errors) == 0,
            'assigned': assigned,
            'errors': errors,
            'message': f'Assigned {len(assigned)} properties to user {request.user.username}',
            'email_sent': bool(assigned and request.user.email)
        })

    @action(detail=False, methods=['get'])
    def all(self, request):
        """
        Get ALL properties in the system.
        Used for onboarding to show new users all available properties.
        Only accessible to authenticated users.
        """
        logger.info(f"all properties requested by user: {request.user.username}")
        if request.user.is_superuser:
            properties = Property.objects.all()
        else:
            properties = get_accessible_properties(request.user)
        serializer = PropertySerializer(properties, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Return a CSV template that matches `bulk_import`'s schema."""
        import csv as _csv
        from io import StringIO

        buf = StringIO()
        writer = _csv.writer(buf)
        writer.writerow(['name', 'property_id', 'description'])
        writer.writerow(['Hotel Phuket Beach', '', 'Coastal property — 80 rooms'])
        writer.writerow(['Hotel Bangkok Central', '', 'Downtown property — 120 rooms'])
        body = buf.getvalue()
        response = HttpResponse(body, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="pcms-properties-template.csv"'
        return response

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        """Export the user's accessible properties as a CSV file.

        Mirrors the columns the import endpoint accepts, so an operator can
        round-trip: export from production, edit in a spreadsheet, then
        re-upload to staging. Includes room_count and user_count so the
        spreadsheet has enough context to plan changes without bouncing
        back into the dashboard.

        Tenant-scoped: regular users only see their accessible properties;
        staff/superuser see everything."""
        import csv as _csv
        from io import StringIO

        user = request.user
        if user.is_superuser:
            qs = Property.objects.all()
        else:
            qs = get_accessible_properties(user)
        qs = qs.prefetch_related('canonical_rooms').order_by('name')

        buf = StringIO()
        writer = _csv.writer(buf)
        writer.writerow([
            'name', 'property_id', 'description',
            'room_count', 'user_count', 'is_preventivemaintenance', 'created_at',
        ])
        for prop in qs:
            writer.writerow([
                prop.name,
                prop.property_id or '',
                (prop.description or '').replace('\n', ' ').strip(),
                prop.canonical_rooms.count(),
                get_property_summary_recipients(prop).count(),
                'true' if prop.is_preventivemaintenance else 'false',
                prop.created_at.isoformat() if prop.created_at else '',
            ])

        body = buf.getvalue()
        response = HttpResponse(body, content_type='text/csv; charset=utf-8')
        date = timezone.now().strftime('%Y-%m-%d')
        response['Content-Disposition'] = (
            f'attachment; filename="pcms-properties-export-{date}.csv"'
        )
        return response

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Create properties from a CSV upload.

        Required: name. Optional: property_id (assigned automatically if
        blank), description. Each imported property is auto-attached to the
        request user so the dashboard's tenant-scoped queries pick it up
        immediately.

        A user must be able to manage their canonical tenant before importing
        properties; staff status never expands this scope."""
        import csv as _csv
        from io import StringIO

        file_obj = request.FILES.get('file') if hasattr(request, 'FILES') else None
        if file_obj is not None:
            try:
                text = file_obj.read().decode('utf-8-sig')
            except UnicodeDecodeError:
                return Response(
                    {'error': 'File must be UTF-8 encoded CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            text = (request.data or {}).get('csv', '') if isinstance(request.data, dict) else ''
        text = (text or '').strip()
        if not text:
            return Response(
                {'error': 'Send a CSV either as `file` (multipart) or `csv` (JSON string).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(text.encode('utf-8')) > 128 * 1024:
            return Response(
                {'error': 'CSV is larger than 128 KB — properties should be a small list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = _csv.DictReader(StringIO(text))
        if reader.fieldnames is None:
            return Response({'error': 'CSV is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        created = []
        attached = []
        errors = []
        if not request.user.is_superuser and not get_user_tenants(request.user).exists():
            return Response(
                {'error': 'You must belong to a tenant before importing properties.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        tenant = ensure_tenant_for_user(request.user)
        if not user_can_manage_tenant(request.user, tenant):
            return Response(
                {'error': 'You do not have permission to import properties for this tenant.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        for row_index, raw_row in enumerate(reader, start=2):
            row = {(k or '').strip().lower(): (v or '').strip() for k, v in raw_row.items() if k}
            name = row.get('name', '')
            if not name:
                errors.append({'row': row_index, 'error': 'name is required.'})
                continue
            description = (row.get('description') or '')[:500] or None
            explicit_id = row.get('property_id', '') or None

            try:
                # If a property_id is given and matches an existing row,
                # attach the user to it instead of creating a duplicate.
                # Otherwise create fresh — Property.save() will generate
                # a property_id automatically if blank.
                existing = None
                if explicit_id:
                    existing = Property.objects.filter(property_id=explicit_id).first()
                if existing is None:
                    existing = Property.objects.filter(name__iexact=name).first()
                if existing is not None:
                    if existing.tenant_id is None:
                        ensure_tenant_for_property(existing, request.user)
                    elif not user_can_manage_tenant(request.user, existing.tenant):
                        errors.append({'row': row_index, 'error': 'You cannot attach this property.'})
                        continue
                    attached.append({
                        'row': row_index,
                        'property_id': existing.property_id,
                        'name': existing.name,
                    })
                    continue

                try:
                    enforce_subscription_limit(tenant, 'max_properties')
                except Exception as exc:
                    errors.append({'row': row_index, 'error': str(exc)})
                    continue

                prop = Property(name=name[:200], description=description)
                if explicit_id:
                    prop.property_id = explicit_id[:50]
                prop.tenant = tenant
                prop.save()
                membership, _ = TenantMembership.objects.get_or_create(
                    tenant=tenant,
                    user=request.user,
                    defaults={'role': 'owner'},
                )
                membership.properties.add(prop)
                created.append({
                    'row': row_index,
                    'property_id': prop.property_id,
                    'name': prop.name,
                })
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({'row': row_index, 'error': str(exc)})

        return Response(
            {
                'created_count': len(created),
                'attached_count': len(attached),
                'error_count': len(errors),
                'created': created[:50],
                'attached': attached[:50],
                'errors': errors[:200],
            },
            status=status.HTTP_201_CREATED if (created or attached) and not errors
            else (status.HTTP_207_MULTI_STATUS if (created or attached) else status.HTTP_400_BAD_REQUEST),
        )


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return User.objects.all()
        return User.objects.filter(pk=user.pk)

    def create(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            raise PermissionDenied("You do not have permission to create users.")
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            raise PermissionDenied("You do not have permission to delete users.")
        return super().destroy(request, *args, **kwargs)


class PreventiveMaintenanceImageUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    MAX_IMAGES_PER_PM = 10

    def _prepare_image(self, image_file):
        from .job_image_processing import PMImageValidationError, validate_and_optimize_pm_image
        try:
            payload, checksum = validate_and_optimize_pm_image(image_file)
        except PMImageValidationError as exc:
            raise ValidationError({'images': str(exc)}) from exc
        return {
            'payload': payload,
            'checksum': checksum,
        }

    def _requested_images(self, request):
        requested = []
        general_files = request.FILES.getlist('images')
        if general_files:
            image_type = str(request.data.get('image_type') or '').strip().lower()
            if image_type not in {'before', 'after'}:
                raise ValidationError({'image_type': 'Image type must be before or after.'})
            requested.extend((image_type, image_file) for image_file in general_files)

        # Backward-compatible scalar fields still use the same authoritative
        # validation, capacity, optimization, and persistence pipeline.
        for image_type, field_name in (('before', 'before_image'), ('after', 'after_image')):
            requested.extend(
                (image_type, image_file)
                for image_file in request.FILES.getlist(field_name)
            )

        if not requested:
            raise ValidationError({'images': 'Select at least one image to upload.'})
        return requested

    def _serialize_pm(self, request, pm):
        refreshed = canonical_pm_queryset(
            request.user,
            request.query_params.get('property_id'),
        ).get(pk=pm.pk)
        return PreventiveMaintenanceDetailSerializer(
            refreshed,
            context={'request': request},
        ).data

    def _lock_scoped_pm(self, request, pm_id, property_id):
        scoped_queryset = canonical_pm_queryset(request.user, property_id)
        scoped_pm = get_object_or_404(scoped_queryset, pm_id__iexact=pm_id)
        pm = PreventiveMaintenance.objects.select_for_update().get(pk=scoped_pm.pk)
        if not scoped_queryset.filter(pk=pm.pk).exists():
            raise Http404('Preventive maintenance record not found.')
        return pm

    def post(self, request, pm_id):
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        if not request.user.is_superuser and not get_operable_properties(request.user).filter(
            property_id=property_id
        ).exists():
            raise PermissionDenied('Your role cannot upload PM images for this property.')

        prepared = []
        batch_checksums = set()
        for image_type, image_file in self._requested_images(request):
            item = self._prepare_image(image_file)
            if item['checksum'] in batch_checksums:
                raise ValidationError({'images': 'Duplicate images are not allowed.'})
            batch_checksums.add(item['checksum'])
            item['image_type'] = image_type
            prepared.append(item)

        created_files = []
        try:
            with transaction.atomic():
                pm = self._lock_scoped_pm(request, pm_id, property_id)
                existing_count = (
                    pm.images.count()
                    + int(bool(pm.before_image))
                    + int(bool(pm.after_image))
                )
                if existing_count + len(prepared) > self.MAX_IMAGES_PER_PM:
                    raise ValidationError({
                        'images': 'A preventive maintenance record can contain a maximum of 10 images.'
                    })

                existing_checksums = set(pm.images.values_list('checksum', flat=True))
                if existing_checksums.intersection(batch_checksums):
                    raise ValidationError({'images': 'Duplicate images are not allowed.'})

                for item in prepared:
                    image = PreventiveMaintenanceImage(
                        preventive_maintenance=pm,
                        image_type=item['image_type'],
                        checksum=item['checksum'],
                        uploaded_by=request.user,
                    )
                    image.image = ContentFile(
                        item['payload'],
                        name=f'pm-image-{uuid.uuid4().hex}.jpg',
                    )
                    image._image_preoptimized = True
                    try:
                        image.save()
                    except Exception:
                        if image.image and image.image.name:
                            created_files.append((image.image.storage, image.image.name))
                        raise
                    created_files.append((image.image.storage, image.image.name))
        except Exception:
            for storage_backend, image_name in created_files:
                try:
                    storage_backend.delete(image_name)
                except Exception:
                    logger.exception('Unable to clean failed PM image upload %s', image_name)
            raise

        return Response(self._serialize_pm(request, pm), status=status.HTTP_201_CREATED)


class PreventiveMaintenanceImageDeleteView(PreventiveMaintenanceImageUploadView):
    def delete(self, request, pm_id, image_id):
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        if not request.user.is_superuser and not get_operable_properties(request.user).filter(
            property_id=property_id
        ).exists():
            raise PermissionDenied('Your role cannot delete PM images for this property.')

        with transaction.atomic():
            pm = self._lock_scoped_pm(request, pm_id, property_id)
            if image_id in {'legacy-before', 'legacy-after'}:
                image_type = image_id.removeprefix('legacy-')
                field_name = f'{image_type}_image'
                jpeg_field_name = f'{image_type}_image_jpeg_path'
                field_file = getattr(pm, field_name)
                if not field_file:
                    raise Http404('PM image not found.')
                storage_backend = field_file.storage
                image_name = field_file.name
                jpeg_name = getattr(pm, jpeg_field_name)
                setattr(pm, field_name, None)
                setattr(pm, jpeg_field_name, None)
                pm.save(update_fields=[field_name, jpeg_field_name, 'updated_at'])

                def delete_legacy_files():
                    try:
                        storage_backend.delete(image_name)
                        if jpeg_name and jpeg_name != image_name:
                            default_storage.delete(jpeg_name)
                    except Exception:
                        logger.exception(
                            'Unable to delete legacy PM image files for %s',
                            pm.pm_id,
                        )

                transaction.on_commit(delete_legacy_files)
            else:
                if not str(image_id).isdigit():
                    raise Http404('PM image not found.')
                image = get_object_or_404(
                    PreventiveMaintenanceImage,
                    pk=int(image_id),
                    preventive_maintenance=pm,
                )
                image.delete()

        return Response(self._serialize_pm(request, pm), status=status.HTTP_200_OK)

# Authentication Views
class LegacyApplicationAuthEnabled(BasePermission):
    """Explicit development/test gate for retired application credentials."""

    message = 'Legacy application authentication is disabled.'

    def has_permission(self, request, view):
        return bool(getattr(settings, 'LEGACY_APP_AUTH_ENABLED', False))


class LoginView(APIView):
    permission_classes = [LegacyApplicationAuthEnabled]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = User.objects.filter(username=username).first()

        if user and user.check_password(password):
            refresh = RefreshToken.for_user(user)
            session = Session.objects.create(
                user=user,
                session_token=str(uuid.uuid4()),
                access_token=str(refresh.access_token),
                refresh_token=str(refresh),
                expires_at=timezone.now() + timedelta(days=30),
            )
            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'session_token': session.session_token,
                'user_id': user.id,
            })
        return Response({'detail': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

class RegisterView(APIView):
    permission_classes = [LegacyApplicationAuthEnabled]

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            session = Session.objects.create(
                user=user,
                session_token=str(uuid.uuid4()),
                access_token=str(refresh.access_token),
                refresh_token=str(refresh),
                expires_at=timezone.now() + timedelta(days=30),
            )
            logger.info("Local user registered successfully: user_id=%s", user.id)
            return Response(
                {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                    'session_token': session.session_token,
                    'user_id': user.id,
                },
                status=status.HTTP_201_CREATED,
            )

        logger.warning(
            "Local registration validation failed: fields=%s",
            list(serializer.errors.keys()),
        )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session_token = request.data.get('session_token')
        if session_token:
            Session.objects.filter(session_token=session_token, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CustomSessionView(APIView):
    permission_classes = [LegacyApplicationAuthEnabled, IsAuthenticated]

    def get(self, request):
        session = Session.objects.filter(user=request.user).first()
        if not session:
            return Response({'detail': 'No active session found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'session_token': session.session_token,
            'access_token': session.access_token,
            'refresh_token': session.refresh_token,
            'expires_at': session.expires_at,
            'created_at': session.created_at,
        })

    def post(self, request):
        refresh = RefreshToken.for_user(request.user)
        session, created = Session.objects.update_or_create(
            user=request.user,
            defaults={
                'session_token': str(uuid.uuid4()),
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh),
                'expires_at': timezone.now() + timedelta(days=30),
            }
        )
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_token': session.session_token,
            'user_id': request.user.id,
        })

# Additional API Views
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auth_check(request):
    """Check if the user is authenticated and return basic user info"""
    display_name = display_name_from_user(request.user, fallback=request.user.email or 'User')
    return Response({
        "authenticated": True,
        "username": display_name,
        "display_name": display_name,
        "email": request.user.email,
    }, status=status.HTTP_200_OK)

@api_view(['GET'])
@permission_classes([LegacyApplicationAuthEnabled])
def auth_providers(request):
    """Return a list of available authentication providers"""
    providers = {
        "google": {
            "name": "Google",
            "endpoint": "/api/v1/auth/google/",
            "description": "Sign in with Google OAuth2",
        },
        "local": {
            "name": "Local",
            "endpoint": "/api/v1/auth/login/",
            "description": "Sign in with username and password",
        },
    }
    return Response(providers, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([LegacyApplicationAuthEnabled])
def login_view(request):
    """Handle user login and return JWT tokens"""
    username = request.data.get('username')
    password = request.data.get('password')
    user = User.objects.filter(username=username).first()

    if user and user.check_password(password):
        refresh = RefreshToken.for_user(user)
        session = Session.objects.create(
            user=user,
            session_token=str(uuid.uuid4()),
            access_token=str(refresh.access_token),
            refresh_token=str(refresh),
            expires_at=timezone.now() + timedelta(days=30),
        )
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_token': session.session_token,
            'user_id': user.id,
        })
    return Response({'detail': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@permission_classes([LegacyApplicationAuthEnabled])
def forgot_password(request):
    """Generate a password reset token and send a reset link to the user's email if available."""
    from django.conf import settings
    from django.core.mail import send_mail

    identifier = request.data.get('email') or request.data.get('username')
    if not identifier:
        return Response({'detail': 'Email or username is required'}, status=status.HTTP_400_BAD_REQUEST)

    # Do not reveal whether the user exists (avoid account enumeration)
    user = User.objects.filter(Q(email__iexact=identifier) | Q(username__iexact=identifier)).first()
    if user:
        token = uuid.uuid4().hex
        profile = user.userprofile
        profile.reset_password_token = token
        profile.reset_password_expires_at = timezone.now() + timedelta(hours=1)
        profile.reset_password_used = False
        profile.save(update_fields=['reset_password_token', 'reset_password_expires_at', 'reset_password_used'])
        logger.info("Password reset requested for user_id=%s", user.id)

        # Send email if the user has an email address configured
        if user.email:
            reset_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/auth/reset-password?token={token}"
            subject = "Reset your password"
            message = (
                f"Hello {user.username},\n\n"
                f"You requested to reset your password. Click the link below to set a new password.\n\n"
                f"{reset_link}\n\n"
                f"This link will expire in 1 hour. If you did not request this, you can ignore this email.\n\n"
                f"Thanks,\nHotelCare Pro Team"
            )
            try:
                from .email_utils import send_email as send_via_gmail
                if send_via_gmail(user.email, subject, message, settings.DEFAULT_FROM_EMAIL):
                    logger.info(f"Password reset email sent to {user.email}")
                else:
                    logger.error("Failed to send password reset email (all methods)")
            except Exception as e:
                logger.error(f"Failed to send password reset email: {e}")
                # Continue to avoid enumeration
                pass

        return Response(
            {'message': 'If an account exists, password reset instructions have been sent.'},
            status=status.HTTP_200_OK,
        )

    return Response({'message': 'If an account exists, password reset instructions have been sent.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([LegacyApplicationAuthEnabled])
def reset_password(request):
    """Reset a user's password using a valid token."""
    token = request.data.get('token')
    new_password = request.data.get('new_password')

    if not token or not new_password:
        return Response({'detail': 'token and new_password are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = UserProfile.objects.get(reset_password_token=token)
    except UserProfile.DoesNotExist:
        return Response({'detail': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)

    if profile.reset_password_used or not profile.reset_password_expires_at or profile.reset_password_expires_at < timezone.now():
        return Response({'detail': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)

    user = profile.user
    user.set_password(new_password)
    user.save(update_fields=['password'])

    profile.reset_password_used = True
    profile.reset_password_token = None
    profile.reset_password_expires_at = None
    profile.save(update_fields=['reset_password_used', 'reset_password_token', 'reset_password_expires_at'])

    return Response({'message': 'Password has been reset successfully'}, status=status.HTTP_200_OK)

@api_view(['GET', 'POST', 'OPTIONS'])
@permission_classes([AllowAny])
def log_view(request):
    """Endpoint to accept NextAuth/client logs without requiring auth"""
    if request.method == 'POST':
        # Accept log payloads and return no content
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({"message": "ok"}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([LegacyApplicationAuthEnabled])
def google_auth(request):
    logger.info("Legacy Google authentication attempt")
    try:
        id_token_credential = request.data.get('id_token')
        access_token = request.data.get('access_token')

        if not id_token_credential:
            logger.warning("No ID token provided in request")
            return Response({'error': 'No ID token provided'}, status=status.HTTP_400_BAD_REQUEST)

        idinfo = id_token.verify_oauth2_token(id_token_credential, requests.Request(), settings.GOOGLE_CLIENT_ID)
        logger.info("Legacy Google identity token verified")

        email = idinfo.get('email')
        google_id = idinfo.get('sub')

        if not email:
            logger.warning("Email not provided by Google in token")
            return Response({'error': 'Email not provided by Google'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            userprofile = UserProfile.objects.get(google_id=google_id)
            user = userprofile.user
        except UserProfile.DoesNotExist:
            try:
                user = User.objects.get(email=email)
                userprofile = user.userprofile
                userprofile.google_id = google_id
                userprofile.save()
            except User.DoesNotExist:
                username = email.split('@')[0]
                base_username = username
                counter = 1
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}{counter}"
                    counter += 1
                user = User.objects.create(
                    username=username,
                    email=email,
                    is_active=True,
                    first_name=idinfo.get('given_name', ''),
                    last_name=idinfo.get('family_name', '')
                )
                userprofile = UserProfile.objects.create(user=user, google_id=google_id)

        userprofile.update_from_google_data(idinfo)
        userprofile.access_token = access_token
        userprofile.save()

        refresh = RefreshToken.for_user(user)
        session = Session.objects.create(
            user=user,
            session_token=str(uuid.uuid4()),
            access_token=str(refresh.access_token),
            refresh_token=str(refresh),
            expires_at=timezone.now() + timedelta(days=30),
        )

        response_data = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_token': session.session_token,
            'user_id': user.id,
            'user': {
                'id': user.id,
                'username': display_name_from_user(user, fallback=user.email or 'User'),
                'display_name': display_name_from_user(user, fallback=user.email or 'User'),
                'email': user.email,
                'profile_image': userprofile.profile_image.url if userprofile.profile_image else None,
                'positions': userprofile.positions,
                'properties': list(get_accessible_properties(user).values('id', 'name', 'property_id')),
            }
        }
        logger.info("Legacy Google authentication succeeded for user_id=%s", user.id)
        return Response(response_data, status=status.HTTP_200_OK)

    except Exception:
        logger.exception("Legacy Google authentication failed")
        return Response({'error': 'Authentication failed'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
        user_properties = get_accessible_properties(request.user)
        logger.info(f"Found {user_properties.count()} properties for user")
        
        # Get preventive maintenance jobs for these properties
        pm_jobs = Job.objects.filter(
            property__in=user_properties,
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
            if not get_accessible_properties(request.user).filter(pk=property_obj.pk).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            query = query.filter(property=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = get_accessible_properties(request.user)
        query = query.filter(property__in=user_properties)
    
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
            if not get_accessible_properties(request.user).filter(pk=property_obj.pk).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            rooms_with_pm = rooms_with_pm.filter(property=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = get_accessible_properties(request.user)
        rooms_with_pm = rooms_with_pm.filter(property__in=user_properties)
    
    # Serialize and return
    serializer = RoomSerializer(rooms_with_pm, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_topics(request):
    """Get topics used in preventive maintenance jobs"""
    
    # Get user's properties
    user_properties = get_accessible_properties(request.user)
    
    # Get topics from PM jobs for user's properties
    topics = Topic.objects.filter(
        jobs__is_preventivemaintenance=True,
        jobs__property__in=user_properties
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
    if not get_accessible_properties(request.user).filter(pk=property_instance.pk).exists():
        return Response(
            {"detail": "You do not have permission to access this property"},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Check if property has any PM jobs
    has_pm_jobs = Job.objects.filter(
        property=property_instance,
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

    if not user.is_superuser:
        accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
        base_queryset = base_queryset.filter(property_id__in=accessible_property_ids)

    property_filter = request.query_params.get('property_id')
    if property_filter:
        base_queryset = base_queryset.filter(property__property_id=property_filter)

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
            'job__property'
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
            queryset = queryset.filter(job__property__property_id=property_id)
            report_property = Property.objects.filter(property_id=property_id).select_related('tenant').first()
        else:
            report_property = None
        
        # Filter by user access (only show maintenance for properties user has access to)
        if not request.user.is_superuser:
            user_properties = get_accessible_properties(request.user)
            queryset = queryset.filter(job__property__in=user_properties)
        
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

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """
    Backward-compatible profile metadata update.

    The request body is not a verified identity-provider assertion, so identity
    fields such as email are intentionally ignored. New clients use the
    current-user ``user-profiles/me`` PATCH contract instead.
    """
    try:
        user = request.user
        auth0_profile = request.data.get('auth0_profile', {})

        if not isinstance(auth0_profile, dict) or not auth0_profile:
            return Response(
                {'error': 'No Auth0 profile data provided'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        profile, _ = UserProfile.objects.select_related('user').get_or_create(user=user)
        update_data = {}
        if 'given_name' in auth0_profile:
            update_data['first_name'] = auth0_profile['given_name']
        if 'family_name' in auth0_profile:
            update_data['last_name'] = auth0_profile['family_name']

        serializer = CurrentUserProfileUpdateSerializer(
            profile,
            data=update_data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        response_data = {
            'message': 'Profile updated successfully',
            'updated_fields': sorted(update_data.keys()),
            'profile': CurrentUserProfileSerializer(
                profile,
                context={'request': request},
            ).data,
        }
        return Response(response_data, status=status.HTTP_200_OK)
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating user profile for {request.user.username if request.user else 'unknown'}: {e}", exc_info=True)
        return Response(
            {'error': 'Failed to update user profile'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Utility Consumption ViewSet
class UtilityConsumptionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing utility consumption records.
    Tracks electricity (total, on-peak, off-peak), water, and night sale data.
    """
    queryset = UtilityConsumption.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['property', 'month', 'year']
    search_fields = ['property__name']
    ordering_fields = ['year', 'month', 'created_at', 'updated_at']
    ordering = ['-year', '-month']
    
    def get_queryset(self):
        """
        Return utility consumption records filtered by user's accessible properties.
        """
        user = self.request.user
        queryset = UtilityConsumption.objects.select_related('property', 'created_by').all()
        
        # Filter by canonical property scope unless platform break-glass.
        if not user.is_superuser:
            # Get properties the user has access to
            user_properties = get_accessible_properties(user)
            queryset = queryset.filter(property__in=user_properties)
        
        # Filter by property_id if provided
        property_id = self.request.query_params.get('property_id')
        if property_id:
            queryset = queryset.filter(property__property_id=property_id)
        
        # Filter by year if provided
        year = self.request.query_params.get('year')
        if year:
            try:
                queryset = queryset.filter(year=int(year))
            except ValueError:
                pass
        
        # Filter by month if provided
        month = self.request.query_params.get('month')
        if month:
            try:
                queryset = queryset.filter(month=int(month))
            except ValueError:
                pass
        
        return queryset.distinct()
    
    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return UtilityConsumptionListSerializer
        return UtilityConsumptionSerializer
    
    def perform_create(self, serializer):
        """Add the current user as the creator when creating a record"""
        _ensure_user_can_operate_property(
            self.request.user, serializer.validated_data.get('property')
        )
        serializer.save(created_by=self.request.user)
    
    def perform_update(self, serializer):
        """Update the updated_at timestamp when updating a record"""
        instance = self.get_object()
        _ensure_user_can_operate_property(self.request.user, instance.property)
        target_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, target_property)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_user_can_operate_property(self.request.user, instance.property)
        instance.delete()


class InventoryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing inventory items for maintenance engineers.
    Tracks tools, parts, supplies, equipment, and consumables.
    """
    queryset = Inventory.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['property', 'room', 'category', 'status', 'jobs', 'preventive_maintenances']
    search_fields = ['name', 'item_id', 'description', 'location', 'supplier']
    ordering_fields = ['name', 'quantity', 'created_at', 'updated_at', 'category', 'status']
    ordering = ['-created_at']
    lookup_field = 'item_id'
    
    def get_queryset(self):
        """
        Return inventory items filtered by user's accessible properties.
        """
        user = self.request.user
        queryset = (
            Inventory.objects.select_related('property', 'room', 'created_by')
            .prefetch_related(
                'jobs__user',
                'preventive_maintenances__assigned_to',
                'preventive_maintenances__created_by'
            )
            .all()
        )
        
        # Filter by canonical property scope unless platform break-glass.
        if not user.is_superuser:
            # Get properties the user has access to
            user_properties = get_accessible_properties(user)
            queryset = queryset.filter(property__in=user_properties)
        
        # Filter by property_id if provided
        property_id = self.request.query_params.get('property_id')
        if property_id:
            queryset = queryset.filter(property__property_id=property_id)
        
        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        
        # Filter by status if provided
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by room_id if provided
        room_id = self.request.query_params.get('room_id')
        if room_id:
            queryset = queryset.filter(room__room_id=room_id)
        
        # Filter low stock items
        low_stock = self.request.query_params.get('low_stock')
        if low_stock and low_stock.lower() == 'true':
            queryset = queryset.filter(quantity__lte=F('min_quantity'))
        
        job_id = self.request.query_params.get('job_id')
        if job_id:
            queryset = queryset.filter(jobs__job_id__iexact=job_id)
        
        pm_id = self.request.query_params.get('pm_id')
        if pm_id:
            queryset = queryset.filter(preventive_maintenances__pm_id__iexact=pm_id)
        
        return queryset.distinct()
    
    def get_object(self):
        """
        Override to support case-insensitive item_id lookup.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        item_id = self.kwargs[lookup_url_kwarg]
        
        # Try case-insensitive lookup using iexact
        obj = queryset.filter(item_id__iexact=item_id).first()
        
        if obj is None:
            from django.http import Http404
            raise Http404(f"No Inventory matches the given query with item_id: {item_id}")
        
        self.check_object_permissions(self.request, obj)
        return obj
    
    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return InventoryListSerializer
        return InventorySerializer
    
    def get_serializer_context(self):
        """Add request to serializer context"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        """Add the current user as the creator when creating an inventory item"""
        _ensure_user_can_operate_property(
            self.request.user, serializer.validated_data.get('property')
        )
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        instance = self.get_object()
        _ensure_user_can_operate_property(self.request.user, instance.property)
        target_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, target_property)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_user_can_operate_property(self.request.user, instance.property)
        instance.delete()

    @action(detail=True, methods=['post'])
    def consume(self, request, item_id=None):
        """Consume this inventory item against a job, PM, or manual adjustment."""
        inventory = self.get_object()
        job = None
        pm = None
        source = request.data.get('source') or 'manual'

        job_id = request.data.get('job_id')
        pm_id = request.data.get('pm_id')
        if job_id and pm_id:
            return Response(
                {'detail': 'Send either job_id or pm_id, not both.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if job_id:
            accessible = get_accessible_properties(request.user)
            job = get_object_or_404(
                Job.objects.filter(property__in=accessible),
                job_id=job_id,
            )
            if inventory.property_id not in _job_property_ids(job):
                return Response({'detail': 'The job must belong to the inventory property.'}, status=status.HTTP_400_BAD_REQUEST)
            source = 'job'
        if pm_id:
            accessible = get_accessible_properties(request.user)
            pm = get_object_or_404(
                PreventiveMaintenance.objects.filter(
                    Q(machines__property__in=accessible) | Q(job__property__in=accessible)
                ).distinct(),
                pm_id=pm_id,
            )
            if inventory.property_id not in _pm_property_ids(pm):
                return Response({'detail': 'The PM must belong to the inventory property.'}, status=status.HTTP_400_BAD_REQUEST)
            source = 'preventive_maintenance'

        try:
            usage_records = consume_inventory_items(
                user=request.user,
                items=[{
                    'item_id': inventory.item_id,
                    'quantity': request.data.get('quantity'),
                    'unit_cost': request.data.get('unit_cost'),
                    'notes': request.data.get('notes'),
                }],
                job=job,
                preventive_maintenance=pm,
                source=source,
            )
        except ValidationError as exc:
            return Response(exc.detail if hasattr(exc, 'detail') else {'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        inventory.refresh_from_db()
        return Response({
            'inventory': InventorySerializer(inventory, context={'request': request}).data,
            'usage': InventoryUsageSerializer(usage_records, many=True, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def usage(self, request, item_id=None):
        inventory = self.get_object()
        usage = inventory.usage_records.select_related(
            'inventory', 'job', 'preventive_maintenance', 'property', 'consumed_by'
        )
        page = self.paginate_queryset(usage)
        serializer = InventoryUsageSerializer(
            page if page is not None else usage,
            many=True,
            context={'request': request},
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def restock(self, request, item_id=None):
        """
        Restock an inventory item by adding quantity.
        Expects: {'quantity': <number>}
        """
        inventory = self.get_object()
        _ensure_user_can_operate_property(request.user, inventory.property)
        quantity_to_add = request.data.get('quantity', 0)
        
        try:
            quantity_to_add = int(quantity_to_add)
            if quantity_to_add <= 0:
                return Response(
                    {'error': 'Quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            with transaction.atomic():
                inventory = Inventory.objects.select_for_update().get(pk=inventory.pk)
                inventory.quantity += quantity_to_add
                inventory.last_restocked = timezone.now()
                inventory.save()
            
            serializer = self.get_serializer(inventory)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValueError:
            return Response(
                {'error': 'Invalid quantity value'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def use(self, request, item_id=None):
        """
        Use/consume an inventory item by subtracting quantity.
        Expects: {'quantity': <number>, 'job_id': <optional>, 'pm_id': <optional>}
        Job/PM identifiers will be added to the item's relationship history.
        """
        inventory = self.get_object()
        _ensure_user_can_operate_property(request.user, inventory.property)
        quantity_to_use = request.data.get('quantity', 0)
        job_id = request.data.get('job_id')
        pm_id = request.data.get('pm_id')
        
        try:
            quantity_to_use = int(quantity_to_use)
            if quantity_to_use <= 0:
                return Response(
                    {'error': 'Quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Link to job or PM if provided
            if job_id and pm_id:
                return Response(
                    {'error': 'Send either job_id or pm_id, not both.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            job = None
            pm = None
            if job_id:
                accessible = get_accessible_properties(request.user)
                job = get_object_or_404(
                    Job.objects.filter(property__in=accessible),
                    job_id=job_id,
                )
                if inventory.property_id not in _job_property_ids(job):
                    return Response({'error': 'Job must belong to the inventory property.'}, status=status.HTTP_400_BAD_REQUEST)
            
            if pm_id:
                accessible = get_accessible_properties(request.user)
                pm = get_object_or_404(
                    PreventiveMaintenance.objects.filter(
                        Q(machines__property__in=accessible) | Q(job__property__in=accessible)
                    ).distinct(),
                    pm_id=pm_id,
                )
                if inventory.property_id not in _pm_property_ids(pm):
                    return Response({'error': 'PM must belong to the inventory property.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                consume_inventory_items(
                    user=request.user,
                    items=[{'item_id': inventory.item_id, 'quantity': quantity_to_use}],
                    job=job,
                    preventive_maintenance=pm,
                    source='job' if job else ('preventive_maintenance' if pm else 'manual'),
                )
            except ValidationError as exc:
                detail = exc.detail if hasattr(exc, 'detail') else {'error': str(exc)}
                if isinstance(detail, dict) and 'inventory_usage' in detail:
                    detail = {'error': detail['inventory_usage']}
                return Response(detail, status=status.HTTP_400_BAD_REQUEST)

            inventory.refresh_from_db()
            serializer = self.get_serializer(inventory)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValueError:
            return Response(
                {'error': 'Invalid quantity value'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """
        Get all inventory items that are low in stock.
        """
        queryset = self.get_queryset()
        low_stock_items = queryset.filter(quantity__lte=F('min_quantity'))
        
        page = self.paginate_queryset(low_stock_items)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(low_stock_items, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Return a starter CSV template that matches `bulk_import`'s schema.

        Operators download this, fill it in, and re-upload. Keeps the column
        names canonical so a partial mismatch can't silently drop fields."""
        import csv as _csv
        from io import StringIO

        buf = StringIO()
        writer = _csv.writer(buf)
        writer.writerow([
            'name', 'category', 'quantity', 'min_quantity', 'unit',
            'unit_price', 'location', 'supplier', 'description', 'property_id',
        ])
        writer.writerow([
            'LED bulb 9W', 'consumables', '50', '10', 'pcs',
            '2.50', 'Storage A', 'Acme Supplies', 'Standard E27 bulb', '',
        ])
        writer.writerow([
            'AC filter', 'parts', '12', '4', 'pcs',
            '8.00', 'Mech room', 'Acme Supplies', '', '',
        ])
        body = buf.getvalue()
        response = HttpResponse(body, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="pcms-inventory-template.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Create inventory items from a CSV upload.

        Accepts either a multipart `file` field or a JSON body with a `csv`
        string. Validates rows up-front and reports per-row errors so the
        operator can fix the spreadsheet and re-upload — partially-good
        files still commit their valid rows (rollback would be hostile to
        bulk-onboarding workflows).

        Required columns: name, quantity, min_quantity.
        Optional columns: category, unit, unit_price, location, supplier,
                          description, property_id.

        Property scoping: items go to the property_id column if present and
        the user has access; otherwise default to the request's currently
        selected property if it exists; otherwise reject the row with an
        explicit error."""
        import csv as _csv
        from io import StringIO

        file_obj = request.FILES.get('file') if hasattr(request, 'FILES') else None
        if file_obj is not None:
            try:
                text = file_obj.read().decode('utf-8-sig')
            except UnicodeDecodeError:
                return Response(
                    {'error': 'File must be UTF-8 encoded CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            text = (request.data or {}).get('csv', '') if isinstance(request.data, dict) else ''
        text = (text or '').strip()
        if not text:
            return Response(
                {'error': 'Send a CSV either as `file` (multipart) or `csv` (JSON string).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cap input size so an operator can't accidentally bulk-import a
        # 50 MB sheet that would OOM the worker. ~256 KB is more than enough
        # for thousands of typical inventory rows.
        if len(text.encode('utf-8')) > 256 * 1024:
            return Response(
                {'error': 'CSV is larger than 256 KB — split it into smaller batches.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = _csv.DictReader(StringIO(text))
        if reader.fieldnames is None:
            return Response(
                {'error': 'CSV is empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve property scope: which properties this user can write to.
        accessible_props = list(get_operable_properties(request.user))
        if not accessible_props:
            return Response(
                {'error': 'You have no property access — cannot import inventory.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        prop_lookup = {}
        for prop in accessible_props:
            if prop.property_id:
                prop_lookup[str(prop.property_id)] = prop

        # Default property from query string (frontend passes the active one).
        default_prop_key = (
            request.query_params.get('property_id') or
            request.data.get('property_id') if isinstance(request.data, dict) else None
        )
        default_prop = prop_lookup.get(str(default_prop_key)) if default_prop_key else None

        created = []
        errors = []

        for row_index, raw_row in enumerate(reader, start=2):  # row 1 is the header
            row = {(k or '').strip().lower(): (v or '').strip() for k, v in raw_row.items() if k}
            name = row.get('name', '')
            if not name:
                errors.append({'row': row_index, 'error': 'name is required.'})
                continue

            try:
                quantity = int(row.get('quantity') or 0)
                min_quantity = int(row.get('min_quantity') or 0)
            except ValueError:
                errors.append({'row': row_index, 'error': 'quantity and min_quantity must be integers.'})
                continue
            if quantity < 0 or min_quantity < 0:
                errors.append({'row': row_index, 'error': 'quantity / min_quantity cannot be negative.'})
                continue

            unit_price_raw = row.get('unit_price', '').strip()
            unit_price = None
            if unit_price_raw:
                try:
                    unit_price = float(unit_price_raw)
                    if unit_price < 0:
                        raise ValueError
                except ValueError:
                    errors.append({'row': row_index, 'error': 'unit_price must be a non-negative number.'})
                    continue

            target_prop = prop_lookup.get(row.get('property_id', '')) if row.get('property_id') else default_prop
            if target_prop is None:
                errors.append({
                    'row': row_index,
                    'error': 'property_id missing or not accessible to you.',
                })
                continue

            try:
                item = Inventory.objects.create(
                    name=name[:200],
                    description=row.get('description', '')[:500] or None,
                    category=(row.get('category') or 'other')[:50],
                    quantity=quantity,
                    min_quantity=min_quantity,
                    unit=(row.get('unit') or 'pcs')[:20],
                    unit_price=unit_price,
                    location=(row.get('location') or '')[:200] or None,
                    supplier=(row.get('supplier') or '')[:200] or None,
                    property=target_prop,
                    created_by=request.user,
                )
                created.append({'row': row_index, 'item_id': item.item_id, 'name': item.name})
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({'row': row_index, 'error': str(exc)})

        return Response(
            {
                'created_count': len(created),
                'error_count': len(errors),
                'created': created[:50],  # cap response payload
                'errors': errors[:200],
            },
            status=status.HTTP_201_CREATED if created and not errors
            else (status.HTTP_207_MULTI_STATUS if created else status.HTTP_400_BAD_REQUEST),
        )

    @action(detail=False, methods=['get'])
    def filter_options(self, request):
        """
        Get available filter options for inventory items.
        Returns categories and statuses from the model choices.
        """
        categories = [
            {'value': choice[0], 'label': choice[1]}
            for choice in Inventory.CATEGORY_CHOICES
        ]
        statuses = [
            {'value': choice[0], 'label': choice[1]}
            for choice in Inventory.STATUS_CHOICES
        ]
        
        return Response({
            'categories': categories,
            'statuses': statuses
        })


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
    if room_obj is None or room_obj.property_id != property_obj.pk:
        return Response(
            {'error': 'Room not found at this property.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    assignee = get_property_summary_recipients(property_obj).order_by('id').first()
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
        property=resolve_job_property(explicit_property=property_obj, rooms=[room_obj]),
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
