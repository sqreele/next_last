import hashlib
import json

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from myappLubd.models import Job, Machine, PreventiveMaintenance, Property, Room, Tenant, TenantMembership, TenantSubscription, WorkspaceReport


class Command(BaseCommand):
    help = 'Read-only Company ownership fingerprint and billing inventory; never enrolls or reassigns data.'

    def handle(self, *args, **options):
        with transaction.atomic():
            if connection.vendor == 'postgresql':
                with connection.cursor() as cursor:
                    cursor.execute('SET TRANSACTION READ ONLY')
            ownership = list(Property.objects.order_by('pk').values_list('pk', 'property_id', 'tenant_id'))
            with connection.cursor() as cursor:
                columns = {column.name for column in connection.introspection.get_table_description(cursor, TenantSubscription._meta.db_table)}
            modern = 'billing_quantity' in columns
            fields = ['tenant__tenant_id', 'status']
            if modern:
                fields += ['tenant__billing_model', 'billing_quantity', 'desired_quantity', 'reconciliation_status']
            output = {'company_count': Tenant.objects.count(), 'property_count': len(ownership),
                'ownership_sha256': hashlib.sha256(json.dumps(ownership).encode()).hexdigest(),
                'tenantless_properties': Property.objects.filter(tenant__isnull=True).count(),
                'job_links_sha256': hashlib.sha256(json.dumps(list(Job.objects.order_by('pk').values_list('pk', 'property_id'))).encode()).hexdigest(),
                'machine_links_sha256': hashlib.sha256(json.dumps(list(Machine.objects.order_by('pk').values_list('pk', 'property_id'))).encode()).hexdigest(),
                'room_links_sha256': hashlib.sha256(json.dumps(list(Room.objects.order_by('pk').values_list('pk', 'property_id'))).encode()).hexdigest(),
                'pm_job_links_sha256': hashlib.sha256(json.dumps(list(PreventiveMaintenance.objects.order_by('pk').values_list('pk', 'job_id'))).encode()).hexdigest(),
                'report_ids_sha256': hashlib.sha256(json.dumps(list(WorkspaceReport.objects.order_by('pk').values_list('pk', 'report_id'))).encode()).hexdigest(),
                'membership_grants_sha256': hashlib.sha256(json.dumps(list(TenantMembership.properties.through.objects.order_by('tenantmembership_id', 'property_id').values_list('tenantmembership_id', 'property_id'))).encode()).hexdigest(),
                'schema_ready': modern,
                'company_subscriptions': list(TenantSubscription.objects.order_by('tenant_id').values(*fields))}
            self.stdout.write(json.dumps(output, sort_keys=True))
