from io import StringIO

from django.db.models import F
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Inventory, Job, PreventiveMaintenance, Property
from ..serializers import InventoryListSerializer, InventorySerializer, InventoryUsageSerializer
from .common import MaintenancePagination
from .inventory_support import consume_inventory_items


class InventoryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing inventory items for maintenance engineers.
    Tracks tools, parts, supplies, equipment, and consumables.
    """
    queryset = Inventory.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['property', 'room', 'category', 'status', 'jobs', 'preventive_maintenances']
    search_fields = ['name', 'item_id', 'description', 'location', 'supplier']
    ordering_fields = ['name', 'quantity', 'created_at', 'updated_at', 'category', 'status']
    ordering = ['-created_at']
    lookup_field = 'item_id'
    
    def get_queryset(self):
        """
        Return inventory items filtered by user's accessible properties.
        """
        user = self.request.user
        queryset = (
            Inventory.objects.select_related('property', 'room', 'created_by')
            .prefetch_related(
                'jobs__user',
                'preventive_maintenances__assigned_to',
                'preventive_maintenances__created_by'
            )
            .all()
        )
        
        # Filter by property if user is not staff
        if not (user.is_staff or user.is_superuser):
            # Get properties the user has access to
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(property__in=user_properties)
        
        # Filter by property_id if provided
        property_id = self.request.query_params.get('property_id')
        if property_id:
            queryset = queryset.filter(property__property_id=property_id)
        
        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        
        # Filter by status if provided
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by room_id if provided
        room_id = self.request.query_params.get('room_id')
        if room_id:
            queryset = queryset.filter(room__room_id=room_id)
        
        # Filter low stock items
        low_stock = self.request.query_params.get('low_stock')
        if low_stock and low_stock.lower() == 'true':
            queryset = queryset.filter(quantity__lte=F('min_quantity'))
        
        job_id = self.request.query_params.get('job_id')
        if job_id:
            queryset = queryset.filter(jobs__job_id__iexact=job_id)
        
        pm_id = self.request.query_params.get('pm_id')
        if pm_id:
            queryset = queryset.filter(preventive_maintenances__pm_id__iexact=pm_id)
        
        return queryset.distinct()
    
    def get_object(self):
        """
        Override to support case-insensitive item_id lookup.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        item_id = self.kwargs[lookup_url_kwarg]
        
        # Try case-insensitive lookup using iexact
        obj = queryset.filter(item_id__iexact=item_id).first()
        
        if obj is None:
            from django.http import Http404
            raise Http404(f"No Inventory matches the given query with item_id: {item_id}")
        
        self.check_object_permissions(self.request, obj)
        return obj
    
    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return InventoryListSerializer
        return InventorySerializer
    
    def get_serializer_context(self):
        """Add request to serializer context"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        """Add the current user as the creator when creating an inventory item"""
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def consume(self, request, item_id=None):
        """Consume this inventory item against a job, PM, or manual adjustment."""
        inventory = self.get_object()
        job = None
        pm = None
        source = request.data.get('source') or 'manual'

        job_id = request.data.get('job_id')
        pm_id = request.data.get('pm_id')
        if job_id and pm_id:
            return Response(
                {'detail': 'Send either job_id or pm_id, not both.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if job_id:
            job = get_object_or_404(Job, job_id=job_id)
            source = 'job'
        if pm_id:
            pm = get_object_or_404(PreventiveMaintenance, pm_id=pm_id)
            source = 'preventive_maintenance'

        try:
            usage_records = consume_inventory_items(
                user=request.user,
                items=[{
                    'item_id': inventory.item_id,
                    'quantity': request.data.get('quantity'),
                    'unit_cost': request.data.get('unit_cost'),
                    'notes': request.data.get('notes'),
                }],
                job=job,
                preventive_maintenance=pm,
                source=source,
            )
        except ValidationError as exc:
            return Response(exc.detail if hasattr(exc, 'detail') else {'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        inventory.refresh_from_db()
        return Response({
            'inventory': InventorySerializer(inventory, context={'request': request}).data,
            'usage': InventoryUsageSerializer(usage_records, many=True, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def usage(self, request, item_id=None):
        inventory = self.get_object()
        usage = inventory.usage_records.select_related(
            'inventory', 'job', 'preventive_maintenance', 'property', 'consumed_by'
        )
        page = self.paginate_queryset(usage)
        serializer = InventoryUsageSerializer(
            page if page is not None else usage,
            many=True,
            context={'request': request},
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def restock(self, request, item_id=None):
        """
        Restock an inventory item by adding quantity.
        Expects: {'quantity': <number>}
        """
        inventory = self.get_object()
        quantity_to_add = request.data.get('quantity', 0)
        
        try:
            quantity_to_add = int(quantity_to_add)
            if quantity_to_add <= 0:
                return Response(
                    {'error': 'Quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            inventory.quantity += quantity_to_add
            inventory.last_restocked = timezone.now()
            inventory.save()
            
            serializer = self.get_serializer(inventory)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValueError:
            return Response(
                {'error': 'Invalid quantity value'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def use(self, request, item_id=None):
        """
        Use/consume an inventory item by subtracting quantity.
        Expects: {'quantity': <number>, 'job_id': <optional>, 'pm_id': <optional>}
        Job/PM identifiers will be added to the item's relationship history.
        """
        inventory = self.get_object()
        job_id = request.data.get('job_id')
        pm_id = request.data.get('pm_id')
        if job_id and pm_id:
            return Response({'detail': 'Send either job_id or pm_id, not both.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            job = get_object_or_404(Job, job_id=job_id) if job_id else None
            pm = get_object_or_404(PreventiveMaintenance, pm_id=pm_id) if pm_id else None
            consume_inventory_items(
                user=request.user,
                items=[{'item_id': inventory.item_id, 'quantity': request.data.get('quantity')}],
                job=job,
                preventive_maintenance=pm,
                source='job' if job else ('preventive_maintenance' if pm else 'manual'),
            )
            inventory.refresh_from_db()
            serializer = self.get_serializer(inventory)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except (ValueError, ValidationError) as exc:
            detail = exc.detail if hasattr(exc, 'detail') else {'detail': str(exc)}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """
        Get all inventory items that are low in stock.
        """
        queryset = self.get_queryset()
        low_stock_items = queryset.filter(quantity__lte=F('min_quantity'))
        
        page = self.paginate_queryset(low_stock_items)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(low_stock_items, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Return a starter CSV template that matches `bulk_import`'s schema.

        Operators download this, fill it in, and re-upload. Keeps the column
        names canonical so a partial mismatch can't silently drop fields."""
        import csv as _csv
        from io import StringIO

        buf = StringIO()
        writer = _csv.writer(buf)
        writer.writerow([
            'name', 'category', 'quantity', 'min_quantity', 'unit',
            'unit_price', 'location', 'supplier', 'description', 'property_id',
        ])
        writer.writerow([
            'LED bulb 9W', 'consumables', '50', '10', 'pcs',
            '2.50', 'Storage A', 'Acme Supplies', 'Standard E27 bulb', '',
        ])
        writer.writerow([
            'AC filter', 'parts', '12', '4', 'pcs',
            '8.00', 'Mech room', 'Acme Supplies', '', '',
        ])
        body = buf.getvalue()
        response = HttpResponse(body, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="pcms-inventory-template.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Create inventory items from a CSV upload.

        Accepts either a multipart `file` field or a JSON body with a `csv`
        string. Validates rows up-front and reports per-row errors so the
        operator can fix the spreadsheet and re-upload — partially-good
        files still commit their valid rows (rollback would be hostile to
        bulk-onboarding workflows).

        Required columns: name, quantity, min_quantity.
        Optional columns: category, unit, unit_price, location, supplier,
                          description, property_id.

        Property scoping: items go to the property_id column if present and
        the user has access; otherwise default to the request's currently
        selected property if it exists; otherwise reject the row with an
        explicit error."""
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

        # Cap input size so an operator can't accidentally bulk-import a
        # 50 MB sheet that would OOM the worker. ~256 KB is more than enough
        # for thousands of typical inventory rows.
        if len(text.encode('utf-8')) > 256 * 1024:
            return Response(
                {'error': 'CSV is larger than 256 KB — split it into smaller batches.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = _csv.DictReader(StringIO(text))
        if reader.fieldnames is None:
            return Response(
                {'error': 'CSV is empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve property scope: which properties this user can write to.
        accessible_props = list(Property.objects.filter(users=request.user))
        if not accessible_props and not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'You have no property access — cannot import inventory.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        prop_lookup = {}
        for prop in accessible_props:
            prop_lookup[str(prop.id)] = prop
            if prop.property_id:
                prop_lookup[str(prop.property_id)] = prop

        # Default property from query string (frontend passes the active one).
        default_prop_key = (
            request.query_params.get('property_id') or
            request.data.get('property_id') if isinstance(request.data, dict) else None
        )
        default_prop = prop_lookup.get(str(default_prop_key)) if default_prop_key else None

        created = []
        errors = []

        for row_index, raw_row in enumerate(reader, start=2):  # row 1 is the header
            row = {(k or '').strip().lower(): (v or '').strip() for k, v in raw_row.items() if k}
            name = row.get('name', '')
            if not name:
                errors.append({'row': row_index, 'error': 'name is required.'})
                continue

            try:
                quantity = int(row.get('quantity') or 0)
                min_quantity = int(row.get('min_quantity') or 0)
            except ValueError:
                errors.append({'row': row_index, 'error': 'quantity and min_quantity must be integers.'})
                continue
            if quantity < 0 or min_quantity < 0:
                errors.append({'row': row_index, 'error': 'quantity / min_quantity cannot be negative.'})
                continue

            unit_price_raw = row.get('unit_price', '').strip()
            unit_price = None
            if unit_price_raw:
                try:
                    unit_price = float(unit_price_raw)
                    if unit_price < 0:
                        raise ValueError
                except ValueError:
                    errors.append({'row': row_index, 'error': 'unit_price must be a non-negative number.'})
                    continue

            target_prop = prop_lookup.get(row.get('property_id', '')) if row.get('property_id') else default_prop
            if target_prop is None and not (request.user.is_staff or request.user.is_superuser):
                errors.append({
                    'row': row_index,
                    'error': 'property_id missing or not accessible to you.',
                })
                continue

            try:
                item = Inventory.objects.create(
                    name=name[:200],
                    description=row.get('description', '')[:500] or None,
                    category=(row.get('category') or 'other')[:50],
                    quantity=quantity,
                    min_quantity=min_quantity,
                    unit=(row.get('unit') or 'pcs')[:20],
                    unit_price=unit_price,
                    location=(row.get('location') or '')[:200] or None,
                    supplier=(row.get('supplier') or '')[:200] or None,
                    property=target_prop,
                    created_by=request.user,
                )
                created.append({'row': row_index, 'item_id': item.item_id, 'name': item.name})
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({'row': row_index, 'error': str(exc)})

        return Response(
            {
                'created_count': len(created),
                'error_count': len(errors),
                'created': created[:50],  # cap response payload
                'errors': errors[:200],
            },
            status=status.HTTP_201_CREATED if created and not errors
            else (status.HTTP_207_MULTI_STATUS if created else status.HTTP_400_BAD_REQUEST),
        )

    @action(detail=False, methods=['get'])
    def filter_options(self, request):
        """
        Get available filter options for inventory items.
        Returns categories and statuses from the model choices.
        """
        categories = [
            {'value': choice[0], 'label': choice[1]}
            for choice in Inventory.CATEGORY_CHOICES
        ]
        statuses = [
            {'value': choice[0], 'label': choice[1]}
            for choice in Inventory.STATUS_CHOICES
        ]
        
        return Response({
            'categories': categories,
            'statuses': statuses
        })

