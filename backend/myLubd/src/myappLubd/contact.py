"""Public contact submission validation, abuse controls, and email delivery."""

import hashlib
import logging
from html import escape

from django.conf import settings
from django.core.cache import caches
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .email_utils import normalize_email_addresses, send_email
from .throttles import ContactBurstThrottle, ContactHourlyThrottle


logger = logging.getLogger(__name__)

MAX_CONTACT_BODY_BYTES = 16 * 1024
CONTACT_DUPLICATE_TTL_SECONDS = 2 * 60
CONTACT_CATEGORIES = (
    'general',
    'product',
    'support',
    'billing',
    'partnership',
    'other',
)


class ContactSubmissionSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    company = serializers.CharField(
        max_length=160,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        default='',
    )
    category = serializers.ChoiceField(
        choices=CONTACT_CATEGORIES,
        required=False,
        default='general',
    )
    subject = serializers.CharField(min_length=3, max_length=160, trim_whitespace=True)
    message = serializers.CharField(min_length=20, max_length=5000, trim_whitespace=True)
    website = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        write_only=True,
        default='',
    )

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError({'detail': 'Expected a JSON object.'})
        unknown = sorted(set(data) - set(self.fields))
        if unknown:
            raise serializers.ValidationError({key: ['Unknown field.'] for key in unknown})
        invalid_types = {
            key: ['Expected a string.']
            for key, value in data.items()
            if not isinstance(value, str)
        }
        if invalid_types:
            raise serializers.ValidationError(invalid_types)
        return super().to_internal_value(data)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_subject(self, value):
        if '\r' in value or '\n' in value:
            raise serializers.ValidationError('Line breaks are not allowed.')
        return value


def _contact_cache():
    return caches[settings.CONTACT_RATE_LIMIT_CACHE_ALIAS]


def _duplicate_key(ip_address, payload):
    fingerprint = '\x1f'.join((
        ip_address,
        payload['email'],
        payload['subject'],
        payload['message'],
    ))
    digest = hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()
    return f'pcms:contact:duplicate:{digest}'


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').strip()
    if forwarded:
        return forwarded.split(',', 1)[0].strip()
    return (request.META.get('REMOTE_ADDR') or 'anon').strip()


def _email_bodies(payload, submitted_at):
    company = payload.get('company') or 'Not provided'
    category = payload.get('category') or 'general'
    plain_text = '\n'.join((
        'New contact submission',
        '',
        f"Name: {payload['name']}",
        f"Email: {payload['email']}",
        f'Company: {company}',
        f'Category: {category}',
        f"Subject: {payload['subject']}",
        f'Submitted: {submitted_at.isoformat()}',
        'Source: /contact/',
        '',
        'Message:',
        payload['message'],
    ))
    html_body = ''.join((
        '<h2>New contact submission</h2>',
        '<dl>',
        f"<dt><strong>Name</strong></dt><dd>{escape(payload['name'])}</dd>",
        f"<dt><strong>Email</strong></dt><dd>{escape(payload['email'])}</dd>",
        f'<dt><strong>Company</strong></dt><dd>{escape(company)}</dd>',
        f'<dt><strong>Category</strong></dt><dd>{escape(category)}</dd>',
        f"<dt><strong>Subject</strong></dt><dd>{escape(payload['subject'])}</dd>",
        f'<dt><strong>Submitted</strong></dt><dd>{escape(submitted_at.isoformat())}</dd>',
        '<dt><strong>Source</strong></dt><dd>/contact/</dd>',
        '</dl>',
        '<h3>Message</h3>',
        f"<p>{escape(payload['message']).replace(chr(10), '<br>')}</p>",
    ))
    return plain_text, html_body


def send_contact_email(payload):
    recipients = normalize_email_addresses([settings.CONTACT_RECIPIENT_EMAIL])
    senders = normalize_email_addresses([settings.CONTACT_FROM_EMAIL])
    if not recipients or not senders:
        logger.error('Contact email configuration is incomplete')
        return False

    submitted_at = timezone.now()
    plain_text, html_body = _email_bodies(payload, submitted_at)
    return send_email(
        to_email=recipients[0],
        from_email=f'StayMaint <{senders[0]}>',
        reply_to=payload['email'],
        subject=f"New Contact Message: {payload['subject']}",
        body=plain_text,
        html_body=html_body,
    )


class ContactSubmissionView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ContactBurstThrottle, ContactHourlyThrottle]

    def post(self, request):
        try:
            content_length = int(request.META.get('CONTENT_LENGTH') or 0)
        except (TypeError, ValueError):
            content_length = 0
        if content_length > MAX_CONTACT_BODY_BYTES:
            return Response(
                {'detail': 'Request body is too large.'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        serializer = ContactSubmissionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        payload = serializer.validated_data

        if payload.pop('website', ''):
            logger.info('Discarded contact honeypot submission')
            return Response({'detail': 'Message received.'}, status=status.HTTP_201_CREATED)

        ip_address = _client_ip(request)
        duplicate_key = _duplicate_key(ip_address, payload)
        if not _contact_cache().add(
            duplicate_key,
            1,
            timeout=CONTACT_DUPLICATE_TTL_SECONDS,
        ):
            logger.info('Suppressed duplicate contact submission')
            return Response({'detail': 'Message received.'}, status=status.HTTP_201_CREATED)

        if not send_contact_email(payload):
            _contact_cache().delete(duplicate_key)
            logger.error('Contact email delivery failed')
            return Response(
                {'detail': 'Unable to send your message right now.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        logger.info('Contact email accepted for delivery category=%s', payload['category'])
        return Response({'detail': 'Message sent.'}, status=status.HTTP_201_CREATED)
