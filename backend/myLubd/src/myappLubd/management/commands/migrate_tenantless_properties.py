"""Atomic, mapping-driven cutover of approved tenantless properties."""

from collections import defaultdict

from django.core.exceptions import PermissionDenied
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from myappLubd.management.commands.audit_tenantless_property_migration import Command as AuditCommand
from myappLubd.models import Property, Tenant, TenantMembership, UserProfile
from myappLubd.tenancy import (
    TENANT_WIDE_PROPERTY_ROLES,
    SubscriptionUserLimitReached,
    enforce_tenant_user_limit,
    get_accessible_properties,
)


class Command(BaseCommand):
    help = 'Atomically apply an approved tenantless-property mapping; dry-run unless --apply is supplied.'

    def add_arguments(self, parser):
        parser.add_argument('--target', action='append', default=[], metavar='PROPERTY_ID=TENANT_ID')
        parser.add_argument('--mapping', required=True, help='Approved CSV mapping.')
        parser.add_argument('--apply', action='store_true', help='Commit the validated cutover.')

    def handle(self, *args, **options):
        targets = AuditCommand()._parse_targets(options['target'])
        mapping = AuditCommand._load_mapping(options['mapping'])
        if not targets:
            raise CommandError('At least one --target is required')
        if not options['apply']:
            self._validate(targets, mapping)
            self.stdout.write('Dry run successful: mapping is safe to apply. No database writes were performed.')
            return

        # Validation deliberately happens before the transaction and is repeated
        # after locks are acquired to close the concurrent-admin-change window.
        self._validate(targets, mapping)
        with transaction.atomic():
            locked_tenants = {
                tenant.tenant_id: tenant
                for tenant in Tenant.objects.select_for_update()
                .filter(pk__in=[t.pk for t in targets.values()])
                .order_by('pk')
            }
            properties = {
                prop.property_id: prop
                for prop in Property.objects.select_for_update().filter(property_id__in=targets)
            }
            if set(properties) != set(targets):
                raise CommandError('One or more target properties disappeared before cutover')
            for property_id, tenant in targets.items():
                prop = properties[property_id]
                locked_tenant = locked_tenants.get(tenant.tenant_id)
                if locked_tenant is None or prop.tenant_id not in {None, locked_tenant.id}:
                    raise CommandError(f'Property {property_id} no longer has the approved tenant state')

            self._validate(targets, mapping, properties=properties)
            approved_users = [user_id for user_id, row in mapping.items() if row['approval_status'] == 'APPROVED']
            all_users = list(mapping)
            # Lock users/profiles/memberships that may be touched. Locking the
            # tenant above serializes absent-membership creation as well.
            list(TenantMembership.objects.select_for_update().filter(user_id__in=all_users, tenant__in=targets.values()))
            list(UserProfile.objects.select_for_update().filter(user_id__in=all_users))

            self._enforce_membership_capacity(mapping, targets)
            before = self._membership_snapshot(all_users, targets.values())
            self._apply_memberships(mapping, properties, targets)
            self._verify_memberships(mapping, properties, targets)

            for property_id, tenant in targets.items():
                prop = properties[property_id]
                prop.tenant = tenant
                prop.save(update_fields=['tenant'])

            self._retire_legacy_access(mapping, properties)
            self._verify_canonical_access(mapping, properties, targets)
            after = self._membership_snapshot(all_users, targets.values())

        self.stdout.write(self.style.SUCCESS('Atomic cutover committed.'))
        for user_id in sorted(set(before) | set(after)):
            if before.get(user_id) != after.get(user_id):
                self.stdout.write(f'user_id={user_id}: before={before.get(user_id, "NONE")}; after={after.get(user_id, "NONE")}')

    def _validate(self, targets, mapping, properties=None):
        properties = properties or {p.property_id: p for p in Property.objects.filter(property_id__in=targets)}
        if set(properties) != set(targets):
            raise CommandError('Every --target property must exist')
        valid_roles = {role for role, _label in TenantMembership.ROLE_CHOICES}
        legacy_by_user = defaultdict(set)
        for prop in properties.values():
            for user_id in prop.users.values_list('id', flat=True):
                legacy_by_user[user_id].add(prop.property_id)
            for user_id in prop.user_profiles.values_list('user_id', flat=True):
                legacy_by_user[user_id].add(prop.property_id)
        if set(legacy_by_user) != set(mapping):
            missing = sorted(set(legacy_by_user) - set(mapping))
            extra = sorted(set(mapping) - set(legacy_by_user))
            raise CommandError(f'Mapping/legacy user mismatch; missing={missing}, extra={extra}')
        for user_id, row in mapping.items():
            if row['approval_status'] == 'APPROVED_RETIREMENT':
                if row['role'] not in {'', 'none'} or row['property_ids'] or row['approved_expansion']:
                    raise CommandError(f'Invalid approved retirement for user {user_id}')
                continue
            if row['approval_status'] != 'APPROVED' or row['role'] not in valid_roles or row['invalid_fields']:
                raise CommandError(f'Unapproved or invalid mapping row for user {user_id}')
            target_property_ids = set(row['property_ids'])
            if not target_property_ids.issubset(properties):
                raise CommandError(f'Mapping includes a property outside the target set for user {user_id}')
            future = set()
            if row['role'] in TENANT_WIDE_PROPERTY_ROLES:
                selected_tenants = {targets[property_id].id for property_id in target_property_ids}
                for property_id, tenant in targets.items():
                    if tenant.id in selected_tenants:
                        future.add(property_id)
                if target_property_ids != future:
                    raise CommandError(f'Tenant-wide mapping must explicitly show all target properties for user {user_id}')
            else:
                future = target_property_ids
            if future != legacy_by_user[user_id]:
                raise CommandError(f'Parity mismatch for user {user_id}: legacy={sorted(legacy_by_user[user_id])}, future={sorted(future)}')

    @staticmethod
    def _membership_snapshot(user_ids, tenants):
        result = {}
        for membership in TenantMembership.objects.filter(user_id__in=user_ids, tenant__in=tenants).prefetch_related('properties'):
            result[membership.user_id] = f'{membership.role}:{";".join(sorted(membership.properties.values_list("property_id", flat=True)))}'
        return result

    def _apply_memberships(self, mapping, properties, targets):
        target_tenant = next(iter(targets.values()))
        for user_id, row in mapping.items():
            memberships = TenantMembership.objects.filter(user_id=user_id, tenant=target_tenant)
            if row['approval_status'] == 'APPROVED_RETIREMENT':
                if memberships.exists():
                    raise CommandError(f'Retired user {user_id} unexpectedly has a target membership')
                continue
            membership, _created = TenantMembership.objects.get_or_create(
                user_id=user_id, tenant=target_tenant,
                defaults={'role': row['role'], 'is_active': True},
            )
            membership.role = row['role']
            membership.is_active = True
            membership.save(update_fields=['role', 'is_active', 'updated_at'])
            membership.properties.set([properties[property_id] for property_id in row['property_ids']])

    @staticmethod
    def _enforce_membership_capacity(mapping, targets):
        """Fail the explicit repair command before creating/reactivating seats."""
        target_tenant = next(iter(targets.values()))
        approved_user_ids = [
            user_id
            for user_id, row in mapping.items()
            if row['approval_status'] == 'APPROVED'
        ]
        active_user_ids = set(TenantMembership.objects.filter(
            tenant=target_tenant,
            user_id__in=approved_user_ids,
            is_active=True,
        ).values_list('user_id', flat=True))
        increment = len(set(approved_user_ids) - active_user_ids)
        if increment == 0:
            return
        try:
            enforce_tenant_user_limit(target_tenant, increment=increment)
        except SubscriptionUserLimitReached as exc:
            raise CommandError(
                f'{exc.default_code}: {exc.detail["detail"]}'
            ) from exc
        except PermissionDenied as exc:
            raise CommandError(
                f'subscription_user_capacity_unavailable: {exc}'
            ) from exc

    def _verify_memberships(self, mapping, properties, targets):
        target_tenant = next(iter(targets.values()))
        for user_id, row in mapping.items():
            membership = TenantMembership.objects.filter(user_id=user_id, tenant=target_tenant).first()
            if row['approval_status'] == 'APPROVED_RETIREMENT':
                if membership is not None:
                    raise CommandError(f'Retired user {user_id} has a target membership')
                continue
            if membership is None or not membership.is_active or membership.role != row['role']:
                raise CommandError(f'Membership verification failed for user {user_id}')
            actual = set(membership.properties.values_list('property_id', flat=True))
            if actual != row['property_ids']:
                raise CommandError(f'Property grant verification failed for user {user_id}')

    @staticmethod
    def _retire_legacy_access(mapping, properties):
        user_ids = list(mapping)
        for prop in properties.values():
            prop.users.remove(*user_ids)
            for profile in UserProfile.objects.filter(user_id__in=user_ids, properties=prop):
                profile.properties.remove(prop)

    def _verify_canonical_access(self, mapping, properties, targets):
        target_tenant = next(iter(targets.values()))
        target_ids = set(properties)
        for user_id, row in mapping.items():
            if row['approval_status'] == 'APPROVED_RETIREMENT':
                # Platform staff/superusers can legitimately see all tenant
                # properties through the global-admin bypass. Verify that this
                # migration removed the legacy source rather than treating that
                # separate bypass as a failed retirement.
                for prop in properties.values():
                    if prop.users.filter(pk=user_id).exists() or prop.user_profiles.filter(user_id=user_id).exists():
                        raise CommandError(f'Legacy access retirement failed for user {user_id}')
                if TenantMembership.objects.filter(user_id=user_id, tenant=target_tenant).exists():
                    raise CommandError(f'Retired user {user_id} has a target membership')
                continue
            actual = set(get_accessible_properties(
                TenantMembership._meta.get_field('user').remote_field.model.objects.get(pk=user_id), target_tenant
            ).filter(property_id__in=target_ids).values_list('property_id', flat=True))
            expected = set(row['property_ids'])
            if row['role'] in TENANT_WIDE_PROPERTY_ROLES and row['approval_status'] == 'APPROVED':
                expected = target_ids
            if actual != expected:
                raise CommandError(f'Canonical authorization verification failed for user {user_id}: {actual} != {expected}')
