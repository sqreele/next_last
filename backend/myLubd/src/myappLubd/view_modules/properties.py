import logging
from io import StringIO

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Job, Property, TenantMembership, UserProfile
from ..serializers import PropertySerializer
from ..tenancy import (
    TENANT_ADMIN_ROLES,
    enforce_subscription_limit,
    ensure_tenant_for_property,
    ensure_tenant_for_user,
    get_accessible_properties,
    user_can_manage_tenant,
)


logger = logging.getLogger(__name__)


class PropertyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PropertySerializer
    lookup_field = 'property_id'

    def get_queryset(self):
        logger.info(f"User {self.request.user.username} requesting properties")
        
        # ✅ PERFORMANCE: Optimize query with prefetch_related
        base_queryset = Property.objects.select_related('tenant').prefetch_related('users', 'rooms')
        
        # Check if user is admin/superuser - give access to all properties
        if self.request.user.is_superuser or self.request.user.is_staff:
            logger.info(f"User {self.request.user.username} is admin/staff - returning all properties")
            queryset = base_queryset
            logger.info(f"Found {queryset.count()} total properties")
            return queryset
        
        # Check if user has properties assigned
        user_properties = get_accessible_properties(self.request.user).select_related('tenant').prefetch_related('users', 'rooms')
        logger.info(f"User {self.request.user.username} has {user_properties.count()} assigned properties")
        
        # If user has no properties assigned, check if they're admin user
        if user_properties.count() == 0 and self.request.user.username == 'admin':
            logger.info(f"Admin user {self.request.user.username} has no properties - returning all properties")
            queryset = base_queryset
            logger.info(f"Found {queryset.count()} total properties for admin")
            return queryset
        
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
        prop.users.add(self.request.user)
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        profile.properties.add(prop)
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

            # Admin users can access all properties
            if self.request.user.is_superuser or self.request.user.is_staff:
                logger.info(f"Admin user {self.request.user.username} accessing property {property_id}")
                return obj
            
            # Special case for admin username
            if self.request.user.username == 'admin':
                logger.info(f"Admin username {self.request.user.username} accessing property {property_id}")
                return obj

            # Check if user has access to this property through SaaS membership
            if not get_accessible_properties(self.request.user).filter(id=obj.id).exists():
                logger.warning(f"Property {property_id} exists but not associated with user {self.request.user.username}")
                if property_id == "PB749146D" and settings.DEBUG:
                    logger.info(f"SPECIAL CASE: Allowing access to test property {property_id} in debug mode")
                    return obj
                # For non-admin users, deny access
                raise PermissionDenied(f"You do not have permission to access property {property_id}")

            return obj
        except Property.DoesNotExist:
            logger.error(f"Property with ID {property_id} not found in database")
            raise

    def _membership_management_properties(self):
        """Properties whose membership the current actor may explicitly manage."""
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Property.objects.all()

        # Both callers execute inside transaction.atomic(). Lock the actor's
        # management grants so their authorization scope cannot be revoked
        # between validation and the membership mutation.
        manageable_tenant_ids = list(
            TenantMembership.objects.select_for_update()
            .filter(
                user=user,
                is_active=True,
                role__in=TENANT_ADMIN_ROLES,
            )
            .values_list('tenant_id', flat=True)
        )
        return Property.objects.filter(tenant_id__in=manageable_tenant_ids)

    def _resolve_manageable_property(self, identifier, manageable_properties):
        """Resolve either a database PK or public ID without leaving actor scope."""
        if isinstance(identifier, bool):
            raise ValidationError({'property_ids': 'Property identifiers must be strings or integers.'})
        if isinstance(identifier, int):
            lookup = {'pk': identifier}
        elif isinstance(identifier, str) and identifier.strip():
            lookup = {'property_id': identifier.strip()}
        else:
            raise ValidationError({'property_ids': 'Property identifiers must be strings or integers.'})

        property_obj = (
            manageable_properties
            .select_for_update()
            .filter(**lookup)
            .first()
        )
        if property_obj is None:
            # Use the same response for nonexistent and unauthorized targets so
            # callers cannot use these membership actions to enumerate Property data.
            raise NotFound('Property is unavailable.')
        return property_obj

    def _assign_current_user_to_properties(self, properties):
        """Synchronize every access relation for the current user atomically."""
        user = self.request.user
        for property_obj in properties:
            property_obj.users.add(user)

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.properties.add(*properties)

        tenant_ids = {property_obj.tenant_id for property_obj in properties if property_obj.tenant_id}
        memberships = {
            membership.tenant_id: membership
            for membership in TenantMembership.objects.select_for_update().filter(
                user=user,
                is_active=True,
                tenant_id__in=tenant_ids,
            )
        }
        for property_obj in properties:
            membership = memberships.get(property_obj.tenant_id)
            if membership is not None:
                membership.properties.add(property_obj)

    @action(detail=True, methods=['get'])
    def is_preventivemaintenance(self, request, property_id=None):
        logger.info(f"is_preventivemaintenance called for property_id: {property_id}")
        try:
            property_obj = Property.objects.get(property_id=property_id)
            logger.info(f"Found property: {property_obj.name}")

            # Admin users can access all properties
            if request.user.is_superuser or request.user.is_staff:
                logger.info(f"Admin user {request.user.username} accessing property {property_id}")
                pass  # Allow access
            elif request.user.username == 'admin':
                logger.info(f"Admin username {request.user.username} accessing property {property_id}")
                pass  # Allow access
            elif not property_obj.users.filter(id=request.user.id).exists():
                if property_id != "PB749146D" or not settings.DEBUG:
                    logger.warning(f"User {request.user.username} does not have permission for property {property_id}")
                    return Response(
                        {"detail": "You do not have permission to access this property"},
                        status=status.HTTP_403_FORBIDDEN
                    )
                logger.info(f"Special case: Allowing access to {property_id} in DEBUG mode")

            has_pm_jobs = Job.objects.filter(
                rooms__properties=property_obj,
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
        """
        Add the current actor to a Property they are explicitly authorized to manage.

        This legacy onboarding action always assigns ``request.user``. Possession
        of a Property identifier is not sufficient authorization.
        """
        logger.info(f"add_user called for property_id: {property_id} by user: {request.user.username}")
        with transaction.atomic():
            manageable_properties = self._membership_management_properties()
            property_obj = self._resolve_manageable_property(property_id, manageable_properties)
            already_assigned = property_obj.users.filter(pk=request.user.pk).exists()
            self._assign_current_user_to_properties([property_obj])

        logger.info(f"Authorized Property membership sync for user {request.user.username}")
        message = (
            'User already has access to this property'
            if already_assigned
            else 'User added to property'
        )
        return Response({
            'success': True,
            'message': message,
            'property_id': property_obj.property_id,
            'property_name': property_obj.name,
        })

    @action(detail=False, methods=['post'])
    def assign_properties(self, request):
        """
        Atomically assign the current actor to Properties they may manage.

        Expected payload: { "property_ids": [1, 2, 3] }
        """
        logger.info(f"assign_properties called by user: {request.user.username}")
        property_ids = request.data.get('property_ids', [])
        if not isinstance(property_ids, list) or not property_ids:
            raise ValidationError({'property_ids': 'A non-empty list is required.'})

        with transaction.atomic():
            manageable_properties = self._membership_management_properties()
            resolved = []
            resolved_ids = set()
            # Resolve and authorize the complete request before changing any
            # membership. Deduplicate aliases that resolve to the same Property.
            for identifier in property_ids:
                property_obj = self._resolve_manageable_property(identifier, manageable_properties)
                if property_obj.pk not in resolved_ids:
                    resolved.append(property_obj)
                    resolved_ids.add(property_obj.pk)

            self._assign_current_user_to_properties(resolved)

        assigned = [
            {
                'id': property_obj.id,
                'property_id': property_obj.property_id,
                'name': property_obj.name,
            }
            for property_obj in resolved
        ]
        logger.info(f"Authorized bulk Property membership sync for {len(assigned)} properties")
        
        # Send welcome email to new user if properties were assigned successfully
        if assigned and request.user.email:
            try:
                from ..email_utils import send_welcome_email, send_new_user_notification_to_admin
                
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
            'success': True,
            'assigned': assigned,
            'errors': [],
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
        if request.user.is_staff or request.user.is_superuser:
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
        if user.is_staff or user.is_superuser:
            qs = Property.objects.all()
        else:
            qs = Property.objects.filter(users=user)
        qs = qs.prefetch_related('users', 'rooms').order_by('name')

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
                prop.rooms.count(),
                prop.users.count(),
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

        Only staff/superusers can create properties — otherwise an operator
        could conjure tenants for themselves at will."""
        import csv as _csv
        from io import StringIO

        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'Only staff can bulk-import properties.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        tenant = ensure_tenant_for_user(request.user)

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
                    elif not request.user.is_superuser:
                        membership = TenantMembership.objects.filter(
                            tenant=existing.tenant,
                            user=request.user,
                            is_active=True,
                        ).first()
                        if membership is None or not membership.can_manage_tenant:
                            errors.append({'row': row_index, 'error': 'You cannot attach this property.'})
                            continue
                    existing.users.add(request.user)
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
                prop.users.add(request.user)
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
