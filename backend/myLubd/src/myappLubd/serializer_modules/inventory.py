"""Inventory definitions."""
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from ..models import Property, Inventory, InventoryUsage
from .shared import InventoryCategoryCodeField, _resolve_inventory_category, _validate_request_property_access, _validate_room_belongs_to_property, get_user_display_name, get_user_public_username


class InventoryUsageSerializer(serializers.ModelSerializer):
    inventory_item_id = serializers.CharField(source='inventory.item_id', read_only=True)
    inventory_name = serializers.CharField(source='inventory.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    job_id = serializers.CharField(source='job.job_id', read_only=True)
    pm_id = serializers.CharField(source='preventive_maintenance.pm_id', read_only=True)
    consumed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = InventoryUsage
        fields = [
            'id', 'inventory', 'inventory_item_id', 'inventory_name', 'job', 'job_id',
            'preventive_maintenance', 'pm_id', 'property', 'property_id', 'property_name',
            'quantity', 'unit_cost', 'total_cost', 'source', 'notes',
            'consumed_by', 'consumed_by_name', 'consumed_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'inventory_item_id', 'inventory_name', 'property_id', 'property_name',
            'job_id', 'pm_id', 'total_cost', 'consumed_by_name', 'created_at',
        ]

    def get_consumed_by_name(self, obj):
        return get_user_display_name(obj.consumed_by)


class InventorySerializer(serializers.ModelSerializer):
    """Serializer for Inventory items"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property = serializers.PrimaryKeyRelatedField(read_only=True)
    property_id = serializers.SlugRelatedField(
        source='property', slug_field='property_id', queryset=Property.objects.all()
    )
    room_name = serializers.CharField(source='room.name', read_only=True)
    room_id = serializers.CharField(source='room.room_id', read_only=True)
    created_by_username = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category = InventoryCategoryCodeField(required=False)
    category_display = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    image_url = serializers.SerializerMethodField()
    job_ids = serializers.SerializerMethodField()
    pm_ids = serializers.SerializerMethodField()
    jobs_detail = serializers.SerializerMethodField()
    preventive_maintenances_detail = serializers.SerializerMethodField()
    usage_records = InventoryUsageSerializer(many=True, read_only=True)
    can_manage_inventory_stock = serializers.SerializerMethodField()
    can_consume_inventory = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = [
            'id',
            'item_id',
            'name',
            'description',
            'category',
            'category_display',
            'quantity',
            'min_quantity',
            'max_quantity',
            'unit',
            'unit_price',
            'location',
            'supplier',
            'supplier_contact',
            'status',
            'status_display',
            'property',
            'property_id',
            'property_name',
            'room',
            'room_id',
            'room_name',
            'image',
            'image_url',
            'job_ids',
            'pm_ids',
            'jobs_detail',
            'preventive_maintenances_detail',
            'usage_records',
            'last_restocked',
            'expiry_date',
            'notes',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_username',
            'created_by_name',
            'can_manage_inventory_stock',
            'can_consume_inventory',
        ]
        read_only_fields = ['id', 'item_id', 'created_at', 'updated_at']

    def get_created_by_username(self, obj):
        return get_user_public_username(obj.created_by)

    def get_image_url(self, obj):
        """Get the image URL"""
        if obj.image and hasattr(obj.image, 'url'):
            return obj.image.url
        return None

    def get_job_ids(self, obj):
        """Return all related job IDs"""
        return list(obj.jobs.values_list('job_id', flat=True))

    def get_pm_ids(self, obj):
        """Return all related preventive maintenance IDs"""
        return list(obj.preventive_maintenances.values_list('pm_id', flat=True))

    def get_jobs_detail(self, obj):
        """Return detailed information about related jobs"""
        jobs = obj.jobs.all()
        return [
            {
                'id': job.id,
                'job_id': job.job_id,
                'description': job.description,
                'status': job.status,
                'user_id': job.user_id,
                'technician_name': get_user_display_name(job.user),
                'updated_at': job.updated_at,
            }
            for job in jobs
        ]

    def get_preventive_maintenances_detail(self, obj):
        """Return detailed information about related preventive maintenance tasks"""
        pms = obj.preventive_maintenances.all()
        return [
            {
                'id': pm.id,
                'pm_id': pm.pm_id,
                'title': pm.pmtitle,
                'status': pm.status,
                'assigned_to_id': pm.assigned_to_id,
                'assigned_to_name': get_user_display_name(pm.assigned_to),
                'created_by_id': pm.created_by_id,
                'created_by_name': get_user_display_name(pm.created_by),
                'updated_at': pm.updated_at,
            }
            for pm in pms
        ]

    def validate(self, data):
        """Validate inventory data"""
        property_obj = data.get('property') or getattr(self.instance, 'property', None)
        if property_obj is None:
            raise serializers.ValidationError({'property': 'Property must be provided.'})
        room = data.get('room') if 'room' in data else getattr(self.instance, 'room', None)
        _validate_request_property_access(self, property_obj)
        _validate_room_belongs_to_property(room, property_obj)
        request = self.context.get('request')
        if self.instance is None or 'quantity' in data:
            from ..tenancy import user_can_manage_inventory_stock
            if request is not None and not user_can_manage_inventory_stock(request.user, property_obj):
                raise PermissionDenied('Your role cannot manage inventory stock for this property.')
        submitted_category = data.get('category')
        if submitted_category is not None:
            data['category'] = _resolve_inventory_category(submitted_category, property_obj)
        elif self.instance is None:
            data['category'] = _resolve_inventory_category('other', property_obj)
        elif self.instance.category_id and self.instance.category.tenant_id != property_obj.tenant_id:
            raise serializers.ValidationError({
                'category': 'Choose a category owned by the new property tenant.'
            })
        quantity = data.get('quantity', self.instance.quantity if self.instance else 0)
        min_quantity = data.get('min_quantity', self.instance.min_quantity if self.instance else 0)

        if quantity < 0:
            raise serializers.ValidationError({'quantity': 'Quantity cannot be negative'})

        if min_quantity < 0:
            raise serializers.ValidationError({'min_quantity': 'Minimum quantity cannot be negative'})

        max_quantity = data.get('max_quantity', self.instance.max_quantity if self.instance else None)
        if max_quantity is not None and max_quantity < min_quantity:
            raise serializers.ValidationError({
                'max_quantity': 'Maximum quantity must be greater than or equal to minimum quantity'
            })

        return data

    def get_created_by_name(self, obj):
        return get_user_display_name(obj.created_by)

    def get_can_manage_inventory_stock(self, obj):
        request = self.context.get('request')
        if request is None:
            return False
        from ..tenancy import user_can_manage_inventory_stock
        return user_can_manage_inventory_stock(request.user, obj.property)

    def get_can_consume_inventory(self, obj):
        request = self.context.get('request')
        if request is None:
            return False
        from ..tenancy import user_can_consume_inventory
        return user_can_consume_inventory(request.user, obj.property)


class InventoryListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing inventory items"""
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category = InventoryCategoryCodeField(read_only=True)
    category_display = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    job_id = serializers.SerializerMethodField()
    job_description = serializers.SerializerMethodField()
    pm_id = serializers.SerializerMethodField()
    pm_title = serializers.SerializerMethodField()
    job_ids = serializers.SerializerMethodField()
    pm_ids = serializers.SerializerMethodField()
    jobs_detail = serializers.SerializerMethodField()
    preventive_maintenances_detail = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    last_job_by_user = serializers.SerializerMethodField()
    last_pm_by_user = serializers.SerializerMethodField()
    can_manage_inventory_stock = serializers.SerializerMethodField()
    can_consume_inventory = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = [
            'id',
            'item_id',
            'name',
            'category',
            'category_display',
            'quantity',
            'min_quantity',
            'unit',
            'status',
            'status_display',
            'property_id',
            'property_name',
            'room_name',
            'location',
            'job_id',
            'job_description',
            'pm_id',
            'pm_title',
            'job_ids',
            'pm_ids',
            'jobs_detail',
            'preventive_maintenances_detail',
            'image_url',
            'last_job_by_user',
            'last_pm_by_user',
            'can_manage_inventory_stock',
            'can_consume_inventory',
            'created_at',
            'updated_at'
        ]

    def get_image_url(self, obj):
        """Get the image URL"""
        if obj.image and hasattr(obj.image, 'url'):
            return obj.image.url
        return None

    def _get_jobs(self, obj):
        if not hasattr(obj, '_inventory_list_jobs'):
            obj._inventory_list_jobs = list(obj.jobs.all())
        return obj._inventory_list_jobs

    def _get_pms(self, obj):
        if not hasattr(obj, '_inventory_list_pms'):
            obj._inventory_list_pms = list(obj.preventive_maintenances.all())
        return obj._inventory_list_pms

    def _get_primary_job(self, obj):
        return self._get_jobs(obj)[0] if self._get_jobs(obj) else None

    def _get_primary_pm(self, obj):
        return self._get_pms(obj)[0] if self._get_pms(obj) else None

    def get_job_id(self, obj):
        job = self._get_primary_job(obj)
        return job.job_id if job else None

    def get_job_description(self, obj):
        job = self._get_primary_job(obj)
        return job.description if job else None

    def get_pm_id(self, obj):
        pm = self._get_primary_pm(obj)
        return pm.pm_id if pm else None

    def get_pm_title(self, obj):
        pm = self._get_primary_pm(obj)
        return pm.pmtitle if pm else None

    def get_job_ids(self, obj):
        return [job.job_id for job in self._get_jobs(obj)]

    def get_pm_ids(self, obj):
        return [pm.pm_id for pm in self._get_pms(obj)]

    def get_jobs_detail(self, obj):
        jobs = self._get_jobs(obj)[:5]
        return [
            {
                'job_id': job.job_id,
                'description': job.description,
                'status': job.status,
            }
            for job in jobs
        ]

    def get_preventive_maintenances_detail(self, obj):
        pms = self._get_pms(obj)[:5]
        return [
            {
                'pm_id': pm.pm_id,
                'title': pm.pmtitle,
                'status': pm.status,
            }
            for pm in pms
        ]

    def get_last_job_by_user(self, obj):
        """Get the last job that used this inventory item by the current user"""
        request = self.context.get('request')
        if not request or not request.user:
            return None

        user = request.user
        user_job = max(
            (job for job in self._get_jobs(obj) if job.user_id == user.id),
            key=lambda job: job.updated_at,
            default=None,
        )
        if user_job:
            return {
                'job_id': user_job.job_id,
                'description': user_job.description[:50] + '...' if len(user_job.description) > 50 else user_job.description,
                'full_description': user_job.description
            }

        return None

    def get_last_pm_by_user(self, obj):
        """Get the last PM that used this inventory item by the current user"""
        request = self.context.get('request')
        if not request or not request.user:
            return None

        user = request.user
        pm = max(
            (
                pm for pm in self._get_pms(obj)
                if pm.assigned_to_id == user.id or pm.created_by_id == user.id
            ),
            key=lambda item: item.updated_at,
            default=None,
        )
        if pm:
            return {
                'pm_id': pm.pm_id,
                'title': pm.pmtitle[:50] + '...' if len(pm.pmtitle) > 50 else pm.pmtitle,
                'full_title': pm.pmtitle
            }

        return None

    def get_can_manage_inventory_stock(self, obj):
        request = self.context.get('request')
        if request is None:
            return False
        from ..tenancy import user_can_manage_inventory_stock
        return user_can_manage_inventory_stock(request.user, obj.property)

    def get_can_consume_inventory(self, obj):
        request = self.context.get('request')
        if request is None:
            return False
        from ..tenancy import user_can_consume_inventory
        return user_can_consume_inventory(request.user, obj.property)
