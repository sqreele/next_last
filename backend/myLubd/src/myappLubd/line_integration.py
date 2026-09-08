"""HTTP entry point for LINE Messaging API webhooks."""

from __future__ import annotations

import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .notifications.line_webhook import (
    parse_verified_payload,
    process_verified_events,
    verify_line_signature,
)


logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class LineWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_body = request.body
        signature = request.headers.get('X-Line-Signature')
        if not verify_line_signature(raw_body, signature):
            logger.warning('LINE webhook rejected reason=invalid_signature')
            return Response(
                {'detail': 'Invalid LINE signature.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            payload = parse_verified_payload(raw_body)
        except (UnicodeDecodeError, ValueError, TypeError):
            logger.warning('LINE webhook rejected reason=invalid_json')
            return Response(
                {'detail': 'Invalid webhook payload.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        process_verified_events(payload)
        # A verified provider delivery receives a generic acknowledgement.
        # Pairing validity and outcomes are never exposed through this public route.
        return Response({'ok': True}, status=status.HTTP_200_OK)
