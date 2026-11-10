"""Properties definitions."""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.utils import timezone
from django.db import transaction
from ..models import Property, Job, TenantMembership, LineGroupPairing
from ..serializers import PropertySerializer
from django.shortcuts import get_object_or_404
import logging
from django.http import HttpResponse
from ..tenancy import user_can_edit_property, can_manage_membership_property_grants, SubscriptionUserLimitReached, enforce_subscription_limit, enforce_tenant_user_limit, ensure_tenant_for_user, get_accessible_properties, lock_tenants_for_membership_change, get_property_summary_recipients, get_user_tenants, TENANT_WIDE_PROPERTY_ROLES, user_can_manage_tenant
from ..plan_capabilities import require_plan_feature, require_request_feature
from ..notifications.line_webhook import generate_pairing_code, pairing_ttl

logger = logging.getLogger('myappLubd.views')


class PropertyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PropertySerializer
    lookup_field = 'property_id'

    def perform_update(self, serializer):
        prop = self.get_object()
        target = serializer.validated_data.get('tenant', prop.tenant)
        if target != prop.tenant:
            raise PermissionDenied('Property ownership cannot be changed through this endpoint.')
        if not user_can_edit_property(self.request.user, prop):
            raise PermissionDenied('Your role cannot edit this Property.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        self.get_object()
        raise ValidationError({'detail': 'Property deletion is disabled. Use the billing removal preview to archive it and preserve maintenance records.'})

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
        with transaction.atomic():
            locked_tenant = lock_tenants_for_membership_change(tenant)[tenant.pk]
            if locked_tenant.billing_model != 'property_quantity_v1' and Property.objects.filter(tenant=locked_tenant).exists():
                require_plan_feature(locked_tenant, 'multi_property')
            enforce_subscription_limit(locked_tenant, 'max_properties')
            membership = TenantMembership.objects.select_for_update().filter(
                tenant=locked_tenant,
                user=self.request.user,
            ).first()
            if membership is None:
                enforce_tenant_user_limit(locked_tenant)
            prop = serializer.save(tenant=locked_tenant, **({'subscription_status': 'draft'} if locked_tenant.billing_model == 'property_quantity_v1' else {}))
            if membership is None:
                membership = TenantMembership.objects.create(
                    tenant=locked_tenant,
                    user=self.request.user,
                    role='owner',
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

    def _require_line_integration_manager(self, property_obj):
        if self.request.user.is_superuser:
            return
        if property_obj.tenant_id is None:
            raise PermissionDenied('LINE integrations require a tenant-backed Property.')
        allowed = TenantMembership.objects.filter(
            tenant_id=property_obj.tenant_id,
            user=self.request.user,
            is_active=True,
            role__in={'owner', 'admin', 'manager'},
        ).exists()
        if not allowed:
            raise PermissionDenied('Your role cannot manage LINE for this Property.')

    @action(detail=True, methods=['post'], url_path='line/pairing')
    def create_line_pairing(self, request, property_id=None):
        property_obj = self.get_object()
        self._require_line_integration_manager(property_obj)
        now = timezone.now()

        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            if locked_property.line_destination_id:
                return Response(
                    {
                        'detail': 'This Property is already connected. Disconnect it explicitly before pairing again.',
                        'code': 'line_already_connected',
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            LineGroupPairing.objects.select_for_update().filter(
                property=locked_property,
                used_at__isnull=True,
                revoked_at__isnull=True,
            ).update(revoked_at=now)
            code = generate_pairing_code()
            pairing = LineGroupPairing(
                property=locked_property,
                created_by=request.user,
                expires_at=now + pairing_ttl(),
            )
            pairing.set_token(code)
            pairing.save()

        return Response(
            {
                'property': {
                    'property_id': locked_property.property_id,
                    'name': locked_property.name,
                },
                'pairing_code': code,
                'pairing_command': f'STAYMAINT LINK {code}',
                'expires_at': pairing.expires_at,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'], url_path='line/status')
    def line_integration_status(self, request, property_id=None):
        property_obj = self.get_object()
        self._require_line_integration_manager(property_obj)
        destination = str(property_obj.line_destination_id or '')
        pending = LineGroupPairing.objects.filter(
            property=property_obj,
            used_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).order_by('-created_at').first()
        return Response({
            'property': {
                'property_id': property_obj.property_id,
                'name': property_obj.name,
            },
            'connected': bool(destination),
            'notifications_enabled': bool(
                destination and property_obj.line_notifications_enabled
            ),
            'destination_suffix': destination[-4:] if destination else '',
            'pairing_expires_at': pending.expires_at if pending else None,
        })

    @action(detail=True, methods=['post'], url_path='line/pairing/revoke')
    def revoke_line_pairing(self, request, property_id=None):
        property_obj = self.get_object()
        self._require_line_integration_manager(property_obj)
        now = timezone.now()
        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            revoked = LineGroupPairing.objects.select_for_update().filter(
                property=locked_property,
                used_at__isnull=True,
                revoked_at__isnull=True,
            ).update(revoked_at=now)
        return Response({'revoked': revoked})

    @action(detail=True, methods=['post'], url_path='line/disconnect')
    def disconnect_line_group(self, request, property_id=None):
        property_obj = self.get_object()
        self._require_line_integration_manager(property_obj)
        now = timezone.now()
        with transaction.atomic():
            locked_property = Property.objects.select_for_update().get(pk=property_obj.pk)
            was_connected = bool(locked_property.line_destination_id)
            locked_property.line_destination_id = ''
            locked_property.line_notifications_enabled = False
            locked_property.save(
                update_fields=['line_destination_id', 'line_notifications_enabled']
            )
            LineGroupPairing.objects.select_for_update().filter(
                property=locked_property,
                used_at__isnull=True,
                revoked_at__isnull=True,
            ).update(revoked_at=now)
        return Response({'disconnected': was_connected})

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
        if not can_manage_membership_property_grants(request.user, property_obj.tenant):
            raise PermissionDenied('Only a Company membership administrator can grant Property access.')
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
        if not can_manage_membership_property_grants(request.user, membership.tenant):
            raise PermissionDenied('Self-service Property grants are disabled for restricted roles.')
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
        require_request_feature(request, 'csv_export')
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
                        errors.append({'row': row_index, 'error': 'Tenantless Property assignment requires explicit operator approval.'})
                        continue
                    elif not user_can_manage_tenant(request.user, existing.tenant):
                        errors.append({'row': row_index, 'error': 'You cannot attach this property.'})
                        continue
                    attached.append({
                        'row': row_index,
                        'property_id': existing.property_id,
                        'name': existing.name,
                    })
                    continue

                with transaction.atomic():
                    locked_tenant = lock_tenants_for_membership_change(tenant)[tenant.pk]
                    if Property.objects.filter(tenant=locked_tenant).exists():
                        require_plan_feature(locked_tenant, 'multi_property')
                    enforce_subscription_limit(locked_tenant, 'max_properties')
                    membership = TenantMembership.objects.select_for_update().filter(
                        tenant=locked_tenant,
                        user=request.user,
                    ).first()
                    if membership is None:
                        enforce_tenant_user_limit(locked_tenant)

                    prop = Property(name=name[:200], description=description)
                    if explicit_id:
                        prop.property_id = explicit_id[:50]
                    prop.tenant = locked_tenant
                    prop.save()
                    if membership is None:
                        membership = TenantMembership.objects.create(
                            tenant=locked_tenant,
                            user=request.user,
                            role='owner',
                        )
                    membership.properties.add(prop)
                created.append({
                    'row': row_index,
                    'property_id': prop.property_id,
                    'name': prop.name,
                })
            except SubscriptionUserLimitReached:
                raise
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
