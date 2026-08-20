"""Read-only readiness audit for moving legacy properties into tenants.

This command deliberately never creates tenants, memberships, or grants.  A
target mapping can be supplied only to model the *result* of an approved
migration; it is still a dry-run and is useful for detecting access loss or
tenant-wide-role over-grants before a cutover is written.
"""

import csv
from collections import Counter, defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q

from myappLubd.models import (
    Area,
    Inventory,
    Job,
    Machine,
    PreventiveMaintenance,
    Property,
    Tenant,
    TenantMembership,
    UtilityConsumption,
    WorkspaceReport,
)
from myappLubd.tenancy import TENANT_WIDE_PROPERTY_ROLES


class Command(BaseCommand):
    help = (
        'Read-only audit of tenantless Property records and their legacy '
        'access.  --target models an approved property_id=tenant_id mapping; '
        'it never writes data.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--target',
            action='append',
            default=[],
            metavar='PROPERTY_ID=TENANT_ID',
            help='Model one approved target tenant mapping (repeatable; no writes).',
        )
        parser.add_argument(
            '--plan',
            action='store_true',
            help='Print the safe atomic operations that would be required for supplied targets.',
        )
        parser.add_argument(
            '--mapping',
            help=(
                'Optional CSV approval worksheet. Required headers: user_id, approved_role, '
                'approved_chinatown, approved_siam, approved_tenant_wide_expansion, '
                'approval_status. It is simulated only.'
            ),
        )

    def handle(self, *args, **options):
        targets = self._parse_targets(options['target'])
        mapping = self._load_mapping(options['mapping']) if options['mapping'] else None
        tenantless = Property.objects.filter(tenant__isnull=True).order_by('id')
        # After a committed cutover the legacy M2Ms have intentionally been
        # retired, so use the worksheet's recorded legacy set for parity while
        # auditing the explicitly targeted, now-tenant-backed properties.
        post_cutover = bool(targets) and not tenantless.filter(property_id__in=targets).exists()
        audited_properties = (
            Property.objects.filter(property_id__in=targets).order_by('id')
            if post_cutover else tenantless
        )
        legacy_ids_by_user = self._legacy_property_ids_by_user(audited_properties)
        planned_ids_by_tenant = defaultdict(set)
        for property_id, tenant in targets.items():
            property_pk = audited_properties.filter(property_id=property_id).values_list('pk', flat=True).first()
            if property_pk is not None:
                planned_ids_by_tenant[tenant.id].add(property_pk)
        self.stdout.write(f'{"Post-cutover audited" if post_cutover else "Tenantless"} properties: {audited_properties.count()}')
        self.stdout.write('Mode: READ ONLY — no database writes will be performed.')

        for property_obj in audited_properties:
            self._report_property(
                property_obj,
                targets.get(property_obj.property_id),
                options['plan'],
                legacy_ids_by_user,
                planned_ids_by_tenant,
            )

        if mapping is not None:
            self._validate_mapping(mapping, legacy_ids_by_user, planned_ids_by_tenant, audited_properties, post_cutover)

        unknown = set(targets) - set(audited_properties.values_list('property_id', flat=True))
        if unknown:
            self.stderr.write(self.style.WARNING(
                'Ignored --target property IDs that are not currently tenantless: '
                + ', '.join(sorted(unknown))
            ))

    def _parse_targets(self, values):
        targets = {}
        for value in values:
            try:
                property_id, tenant_id = value.split('=', 1)
            except ValueError as exc:
                raise CommandError('--target must use PROPERTY_ID=TENANT_ID') from exc
            property_id, tenant_id = property_id.strip(), tenant_id.strip()
            if not property_id or not tenant_id:
                raise CommandError('--target must use non-empty PROPERTY_ID=TENANT_ID')
            if property_id in targets:
                raise CommandError(f'Duplicate --target for property {property_id}')
            try:
                targets[property_id] = Tenant.objects.get(tenant_id=tenant_id)
            except Tenant.DoesNotExist as exc:
                raise CommandError(f'Tenant {tenant_id!r} does not exist') from exc
        return targets

    @staticmethod
    def _load_mapping(filename):
        required = {
            'user_id',
            'approved_role',
            'approved_chinatown',
            'approved_siam',
            'approved_tenant_wide_expansion',
            'approval_status',
        }
        path = Path(filename)
        if not path.is_file():
            raise CommandError(f'Mapping file does not exist: {filename}')
        with path.open(newline='', encoding='utf-8-sig') as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
                raise CommandError(
                    'Mapping CSV headers must include: ' + ', '.join(sorted(required))
                )
            mapping = {}
            for row in reader:
                raw_user_id = (row.get('user_id') or '').strip()
                if not raw_user_id:
                    raise CommandError('Mapping CSV contains an empty user_id')
                try:
                    user_id = int(raw_user_id)
                except ValueError as exc:
                    raise CommandError(f'Mapping user_id must be numeric: {raw_user_id!r}') from exc
                if user_id in mapping:
                    raise CommandError(f'Mapping CSV contains duplicate user_id: {user_id}')
                property_flags = {}
                invalid_flags = []
                for property_id, column in (
                    ('PB749146D', 'approved_chinatown'),
                    ('PE17D8D2C', 'approved_siam'),
                ):
                    value = (row.get(column) or '').strip().lower()
                    if value not in {'', '0', '1', 'false', 'true', 'no', 'yes'}:
                        invalid_flags.append(column)
                    property_flags[property_id] = value in {'1', 'true', 'yes'}
                expansion_value = (row.get('approved_tenant_wide_expansion') or '').strip().lower()
                if expansion_value not in {'', '0', '1', 'false', 'true', 'no', 'yes', 'approved'}:
                    invalid_flags.append('approved_tenant_wide_expansion')
                mapping[user_id] = {
                    'role': (row.get('approved_role') or '').strip().lower(),
                    'property_ids': {property_id for property_id, selected in property_flags.items() if selected},
                    'approved_expansion': expansion_value
                    in {'1', 'true', 'yes', 'approved'},
                    'approval_status': (row.get('approval_status') or '').strip().upper(),
                    'invalid_fields': invalid_flags,
                    'legacy_property_ids': {
                        value.strip() for value in (row.get('legacy_property_set') or '').split(';') if value.strip()
                    },
                }
        return mapping

    @staticmethod
    def _legacy_property_ids_by_user(properties):
        result = defaultdict(set)
        for property_obj in properties.prefetch_related('users', 'user_profiles__user'):
            for user_id in property_obj.users.values_list('id', flat=True):
                result[user_id].add(property_obj.id)
            for user_id in property_obj.user_profiles.values_list('user_id', flat=True):
                result[user_id].add(property_obj.id)
        return result

    def _report_property(self, property_obj, target_tenant, show_plan, legacy_ids_by_user, planned_ids_by_tenant):
        direct_ids = set(property_obj.users.values_list('id', flat=True))
        profile_ids = set(property_obj.user_profiles.values_list('user_id', flat=True))
        all_ids = direct_ids | profile_ids

        jobs = Job.objects.filter(
            Q(area__property=property_obj) | Q(rooms__properties=property_obj)
        ).distinct()
        pm = PreventiveMaintenance.objects.filter(
            Q(machines__property=property_obj)
            | Q(job__area__property=property_obj)
            | Q(job__rooms__properties=property_obj)
        ).distinct()

        self.stdout.write('')
        self.stdout.write(f'Property {property_obj.property_id} (pk={property_obj.pk}): {property_obj.name}')
        self.stdout.write('  current tenant: NULL')
        self.stdout.write(
            '  resources: '
            f'rooms={property_obj.rooms.count()} areas={Area.objects.filter(property=property_obj).count()} '
            f'jobs={jobs.count()} machines={Machine.objects.filter(property=property_obj).count()} '
            f'inventory={Inventory.objects.filter(property=property_obj).count()} pm={pm.count()} '
            f'utility={UtilityConsumption.objects.filter(property=property_obj).count()} '
            f'workspace_reports={WorkspaceReport.objects.filter(property=property_obj).count()}'
        )
        self.stdout.write(
            '  legacy users: '
            f'direct_only={len(direct_ids - profile_ids)} '
            f'profile_only={len(profile_ids - direct_ids)} '
            f'both={len(direct_ids & profile_ids)} union={len(all_ids)}'
        )
        self._report_users(
            all_ids,
            property_obj,
            target_tenant,
            legacy_ids_by_user,
            planned_ids_by_tenant,
        )

        if target_tenant is None:
            self.stdout.write('  target tenant: MANUAL BUSINESS DECISION REQUIRED')
            return

        self.stdout.write(f'  target tenant: {target_tenant.tenant_id} ({target_tenant.name})')
        if show_plan:
            self.stdout.write(
                '  WOULD (inside one transaction): prepare approved active memberships and '
                'property grants; assign Property.tenant last; verify parity; preserve legacy M2Ms.'
            )

    def _report_users(self, user_ids, property_obj, target_tenant, legacy_ids_by_user, planned_ids_by_tenant):
        if not user_ids:
            self.stdout.write('  memberships: no legacy users')
            return

        memberships = TenantMembership.objects.filter(user_id__in=user_ids).select_related('tenant', 'user')
        by_user = defaultdict(list)
        for membership in memberships:
            by_user[membership.user_id].append(membership)

        counts = defaultdict(int)
        for user_id in sorted(user_ids):
            candidates = by_user.get(user_id, [])
            if target_tenant is None:
                state = 'NO MEMBERSHIP' if not candidates else 'AMBIGUOUS (target tenant unknown)'
                role = 'MANUAL ROLE ASSIGNMENT REQUIRED'
                canonical = 'AMBIGUOUS'
            else:
                membership = next((item for item in candidates if item.tenant_id == target_tenant.id), None)
                if membership is None:
                    state = 'NO MEMBERSHIP'
                    role = 'MANUAL ROLE ASSIGNMENT REQUIRED'
                    canonical = 'ACCESS LOSS'
                elif not membership.is_active:
                    state = 'EXISTING MEMBERSHIP INACTIVE'
                    role = membership.role
                    canonical = 'ACCESS LOSS'
                else:
                    state = 'EXISTING COMPATIBLE MEMBERSHIP'
                    role = membership.role
                    permitted_ids = set(membership.properties.values_list('id', flat=True))
                    target_property_ids = (
                        set(target_tenant.properties.values_list('id', flat=True))
                        | planned_ids_by_tenant[target_tenant.id]
                    )
                    if membership.role in TENANT_WIDE_PROPERTY_ROLES:
                        canonical = (
                            'OVER-GRANT'
                            if target_property_ids - legacy_ids_by_user[user_id]
                            else 'MATCH'
                        )
                    elif property_obj.id in permitted_ids:
                        canonical = 'MATCH'
                    else:
                        canonical = 'ACCESS LOSS'
            counts[(state, canonical)] += 1
            self.stdout.write(
                f'    user_id={user_id}: membership={state}; role={role}; parity={canonical}'
            )

        summary = ', '.join(
            f'{state}/{parity}={count}' for (state, parity), count in sorted(counts.items())
        )
        self.stdout.write(f'  membership summary: {summary}')

    def _validate_mapping(self, mapping, legacy_ids_by_user, planned_ids_by_tenant, tenantless, post_cutover=False):
        self.stdout.write('')
        self.stdout.write('Mapping simulation (READ ONLY):')
        property_id_by_pk = dict(tenantless.values_list('pk', 'property_id'))
        valid_roles = {choice[0] for choice in TenantMembership.ROLE_CHOICES}
        all_legacy_users = set(legacy_ids_by_user) | set(mapping)
        statuses = Counter()

        for user_id in sorted(all_legacy_users | set(mapping)):
            row = mapping.get(user_id)
            expected = legacy_ids_by_user.get(user_id, set())
            if post_cutover and row is not None:
                expected = {
                    pk for pk, property_id in property_id_by_pk.items()
                    if property_id in row['legacy_property_ids']
                }
            reason = ''
            if row is None:
                status = 'AMBIGUOUS ROLE'
                future = set()
            elif row['approval_status'] == 'APPROVED_RETIREMENT':
                future = set()
                if row['role'] not in {'', 'none'}:
                    status = 'INVALID ROLE'
                    reason = 'approved retirement must use approved_role NONE'
                elif row['property_ids'] or row['approved_expansion']:
                    status = 'INVALID ROLE'
                    reason = 'approved retirement must not grant property or tenant-wide access'
                else:
                    # This is an explicit business decision to retire legacy
                    # Property.users/UserProfile.properties access at cutover.
                    # It never creates a membership or deletes the user/history.
                    status = 'APPROVED_RETIREMENT'
            elif row['approval_status'] != 'APPROVED':
                status = 'AMBIGUOUS ROLE'
                future = set()
            elif row['role'] in {'', 'manual', 'manual_required'}:
                status = 'AMBIGUOUS ROLE'
                future = set()
            elif row['role'] not in valid_roles:
                status = 'INVALID ROLE'
                future = set()
                reason = 'approved_role is not a TenantMembership role'
            elif row['invalid_fields']:
                status = 'INVALID ROLE'
                future = set()
                reason = 'invalid approval value(s): ' + ', '.join(row['invalid_fields'])
            else:
                selected_pks = {
                    pk for pk, property_id in property_id_by_pk.items()
                    if property_id in row['property_ids']
                }
                target_tenant_ids = set()
                for pk in selected_pks:
                    for tenant_id, planned_pks in planned_ids_by_tenant.items():
                        if pk in planned_pks:
                            target_tenant_ids.add(tenant_id)
                if row['role'] in TENANT_WIDE_PROPERTY_ROLES:
                    future = set()
                    for tenant_id in target_tenant_ids:
                        future |= planned_ids_by_tenant[tenant_id]
                        future |= set(
                            Tenant.objects.get(pk=tenant_id).properties.values_list('pk', flat=True)
                        )
                    # A tenant-wide membership is never limited by its M2M grants.
                    # Require the worksheet flags to state that full effective access
                    # explicitly, so "manager + Chinatown only" cannot be approved as
                    # a misleading property-restricted plan.
                    if selected_pks != future:
                        status = 'INVALID ROLE'
                        reason = (
                            'tenant-wide role access is all properties in its target tenant; '
                            'approved property flags must show that full set'
                        )
                    else:
                        missing = expected - future
                        extra = future - expected
                        if missing:
                            status = 'ACCESS LOSS'
                        elif extra and row['approved_expansion']:
                            status = 'APPROVED_EXPANSION'
                        elif extra:
                            status = 'UNAPPROVED_OVER_GRANT'
                        else:
                            status = 'MATCH'
                else:
                    future = selected_pks
                    missing = expected - future
                    extra = future - expected
                    if missing:
                        status = 'ACCESS LOSS'
                    elif extra and row['approved_expansion']:
                        status = 'APPROVED_EXPANSION'
                    elif extra:
                        status = 'UNAPPROVED_OVER_GRANT'
                    else:
                        status = 'MATCH'
            statuses[status] += 1
            expected_ids = ';'.join(sorted(property_id_by_pk[pk] for pk in expected)) or '-'
            future_ids = ';'.join(sorted(property_id_by_pk.get(pk, str(pk)) for pk in future)) or '-'
            detail = f'; reason={reason}' if reason else ''
            self.stdout.write(
                f'  user_id={user_id}: status={status}; expected={expected_ids}; future={future_ids}{detail}'
            )

        self.stdout.write('  mapping summary: ' + ', '.join(
            f'{status}={count}' for status, count in sorted(statuses.items())
        ))
        self.stdout.write(
            '  approval status: '
            f'PENDING DECISIONS={statuses["AMBIGUOUS ROLE"]}; '
            f'APPROVED RETIREMENTS={statuses["APPROVED_RETIREMENT"]}; '
            f'INVALID ROLES={statuses["INVALID ROLE"]}; '
            f'ACCESS LOSS={statuses["ACCESS LOSS"]}; '
            f'UNAPPROVED EXPANSION={statuses["UNAPPROVED_OVER_GRANT"]}'
        )
        blockers = (
            statuses['AMBIGUOUS ROLE']
            + statuses['INVALID ROLE']
            + statuses['ACCESS LOSS']
            + statuses['UNAPPROVED_OVER_GRANT']
        )
        decision = 'READY' if blockers == 0 else 'BLOCKED'
        self.stdout.write(f'  migration readiness: {decision}')
