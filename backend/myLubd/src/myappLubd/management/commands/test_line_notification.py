"""Explicit, operator-invoked LINE Messaging API delivery check."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from myappLubd.models import Property
from myappLubd.notifications.line import (
    _masked_destination,
    get_line_usage,
    get_provider_quota,
    send_text_message,
)


class Command(BaseCommand):
    help = 'Send one explicit test LINE message to a configured Property destination.'

    def add_arguments(self, parser):
        parser.add_argument('--property-id', required=True, help='Public Property ID, not a LINE ID.')
        parser.add_argument(
            '--send', action='store_true',
            help='Actually send exactly one message. Without this flag the command only reports config.',
        )
        parser.add_argument('--message', default='✅ StayMaint LINE test notification')
        parser.add_argument(
            '--quota', action='store_true',
            help='Explicitly query LINE quota and consumption endpoints.',
        )

    def handle(self, *args, **options):
        property_obj = Property.objects.filter(property_id=options['property_id']).first()
        if property_obj is None:
            raise CommandError('Property not found.')
        destination = str(property_obj.line_destination_id or '').strip()
        self.stdout.write(f'Property: {property_obj.name}')
        self.stdout.write(f"LINE enabled: {'yes' if property_obj.line_notifications_enabled else 'no'}")
        self.stdout.write(f"token: {'SET' if settings.LINE_CHANNEL_ACCESS_TOKEN else 'MISSING'}")
        self.stdout.write(
            f"destination: {'SET (' + _masked_destination(destination) + ')' if destination else 'MISSING'}"
        )
        ready = bool(settings.LINE_CHANNEL_ACCESS_TOKEN and destination and property_obj.line_notifications_enabled)
        self.stdout.write(f"transport ready: {'yes' if ready else 'no'}")
        configured_limit = getattr(settings, 'LINE_MONTHLY_MESSAGE_LIMIT', None)
        property_usage = get_line_usage(property_id=property_obj.property_id)
        overall_usage = get_line_usage()
        configured_display = configured_limit if configured_limit is not None else 'UNKNOWN'
        remaining = (
            max(configured_limit - overall_usage['successful_messages'], 0)
            if configured_limit is not None else 'UNKNOWN'
        )
        self.stdout.write(f'Configured monthly quota: {configured_display}')
        self.stdout.write(
            f"Local successful count this month: {property_usage['successful_messages']}"
        )
        self.stdout.write(
            f"Local provider attempts this month: {property_usage['provider_attempts']}"
        )
        self.stdout.write(f"Local failed sends this month: {property_usage['failed']}")
        self.stdout.write(
            f"Local quota-exhausted responses this month: {property_usage['quota_exhausted']}"
        )
        self.stdout.write(
            f"Local temporary rate-limited responses this month: {property_usage['rate_limited']}"
        )
        self.stdout.write(f'Estimated remaining local quota: {remaining}')
        self.stdout.write(
            f"Overall local successful count this month: {overall_usage['successful_messages']}"
        )
        self.stdout.write(
            f"Overall local provider attempts this month: {overall_usage['provider_attempts']}"
        )
        if options['quota']:
            provider = get_provider_quota()
            if provider.ok:
                self.stdout.write(
                    f"Provider limit: {provider.limit if provider.limit is not None else 'UNLIMITED'}"
                )
                self.stdout.write(f'Provider usage: {provider.usage}')
                self.stdout.write(
                    f"Provider remaining: {provider.remaining if provider.remaining is not None else 'UNLIMITED'}"
                )
            else:
                self.stdout.write(f'Provider quota: unavailable ({provider.category})')
        if not options['send']:
            self.stdout.write('Dry run: no message sent. Re-run with --send to send one test.')
            return
        if not ready:
            raise CommandError('LINE is not configured and enabled for this Property; no message sent.')
        self.stdout.write('Sending one test message...')
        result = send_text_message(
            destination_id=destination,
            text=options['message'],
            event_type='DIAGNOSTIC',
            property_id=property_obj.property_id,
        )
        self.stdout.write(f'status: {result.status_code if result.status_code is not None else "none"}')
        self.stdout.write(f'category: {result.category}')
        if result.ok:
            self.stdout.write(self.style.SUCCESS('Result: success'))
            return
        if result.message:
            self.stdout.write(f'LINE response: {result.message}')
        raise CommandError('Result: failed. Inspect the backend LINE delivery log for details.')
