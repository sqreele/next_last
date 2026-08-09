import logging
import os

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..tenancy import get_accessible_properties
from .ai_context import (
    _extract_category_name_from_message,
    _extract_frequency_from_message,
    _extract_property_name_from_message,
    _extract_room_name_from_message,
    _extract_year_month_from_message,
    _normalize_search_text,
    _property_required_reply,
    _requires_property_before_tool,
    _should_force_recurring_tool,
    _should_force_summary_tool,
    _should_force_today_tool,
)
from .ai_tools import (
    get_maintenance_summary,
    get_recurring_maintenance_tasks,
    get_today_maintenance_jobs,
)


logger = logging.getLogger(__name__)


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

