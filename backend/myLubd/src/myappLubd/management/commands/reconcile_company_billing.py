import json
import logging

from django.core.management.base import BaseCommand

from myappLubd.billing.company_service import MODEL
from myappLubd.billing.reconciliation import reconcile_company, retry_operations
from myappLubd.models import BillingChange, Tenant

logger = logging.getLogger('billing.company')


class Command(BaseCommand):
    help = 'Report Company billing operations; --apply explicitly processes confirmed test-mode changes and reconciles invoices.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--tenant-id')

    def handle(self, *args, **options):
        companies = Tenant.objects.filter(billing_model=MODEL)
        if options['tenant_id']:
            companies = companies.filter(tenant_id=options['tenant_id'])
        if not options['apply']:
            for tenant in companies:
                self.stdout.write(json.dumps({'tenant_id': tenant.tenant_id,
                    'operations': list(BillingChange.objects.filter(tenant=tenant).values('id', 'state', 'error_code'))}, default=str))
            return
        failed = 0
        for tenant in companies:
            try:
                reconcile_company(tenant)
                self.stdout.write(f'{tenant.tenant_id}: reconciled')
            except Exception:
                failed += 1
                logger.exception('company_billing_reconciliation_failed', extra={'tenant_id': tenant.tenant_id})
                self.stderr.write(f'{tenant.tenant_id}: review required; see billing logs')
        if failed:
            from django.core.management.base import CommandError
            raise CommandError(f'{failed} companies require billing review.')
