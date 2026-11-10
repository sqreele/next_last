"""Jobs definitions."""
from rest_framework import serializers
from ..demo_documents import validate_documents
from ..demo_categories import MACHINE_CATEGORIES, machine_category_flags
import uuid
from ..models import Room, Topic, JobImage, PendingJobImage, Job, JobDocument, Machine, MaintenanceProcedure, Area, JobComment
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.files.storage import default_storage
from datetime import timedelta
from pathlib import Path
import json
from ..tenancy import require_work_creation_permission, get_accessible_properties, get_job_reassignable_properties, get_operable_properties
from ..job_property import resolve_external_property_reference, resolve_job_property
from .shared import get_user_display_name, get_user_public_username
from .locations import AreaSummarySerializer, RoomSummarySerializer, TopicSerializer
from .job_images import JobImageSerializer, _build_media_absolute_uri

User = get_user_model()


class JobCommentSerializer(serializers.ModelSerializer):
    author_username = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    author_id = serializers.IntegerField(source='author.id', read_only=True)

    class Meta:
        model = JobComment
        fields = [
            'id', 'job', 'comment',
            'author_id', 'author_username', 'author_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'job', 'author_id', 'author_username', 'author_name',
            'created_at', 'updated_at',
        ]

    def get_author_name(self, obj):
        return get_user_display_name(obj.author)

    def get_author_username(self, obj):
        return get_user_public_username(obj.author)

    def validate_comment(self, value):
        text = (value or '').strip()
        if not text:
            raise serializers.ValidationError("Comment cannot be empty.")
        return text


class JobDashboardImageSerializer(JobImageSerializer):
    class Meta(JobImageSerializer.Meta):
        fields = ['image_url', 'jpeg_url', 'uploaded_at']


class JobMachineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Machine
        fields = ['machine_id', 'name', 'brand', 'category', 'serial_number',
                  'location', 'description', 'asset_tag', 'last_maintenance_date']


class JobDashboardSerializer(serializers.ModelSerializer):
    machine = JobMachineSerializer(read_only=True)
    user_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    images = JobDashboardImageSerializer(source='job_images', many=True, read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    rooms = RoomSummarySerializer(many=True, read_only=True)
    property_id = serializers.CharField(source='property.property_id', read_only=True)
    area = AreaSummarySerializer(read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)
    can_operate = serializers.SerializerMethodField()
    can_assign = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'job_id', 'description', 'status', 'priority', 'remarks',
            'created_at', 'updated_at', 'completed_at', 'is_defective',
            'is_preventivemaintenance', 'property_id', 'rooms', 'topics',
            'images', 'area', 'area_name', 'user_name', 'technician_name',
            'can_operate', 'can_assign', 'machine',
        ]
        read_only_fields = fields

    def _can_operate(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if user.is_superuser:
            return True
        if not hasattr(self, '_operable_property_ids'):
            self._operable_property_ids = set(
                get_operable_properties(user).values_list('pk', flat=True)
            )
        return obj.property_id in self._operable_property_ids

    def get_user_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unassigned technician'

    def get_technician_name(self, obj):
        if obj.assigned_to_id:
            return get_user_display_name(obj.assigned_to) or 'Unassigned technician'
        if obj.property.tenant and obj.property.tenant.billing_model == 'property_quantity_v1':
            return 'Unassigned technician'
        return self.get_user_name(obj)

    def get_can_operate(self, obj):
        return self._can_operate(obj)

    def get_can_assign(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if user.is_superuser:
            return True
        if not hasattr(self, '_reassignable_property_ids'):
            self._reassignable_property_ids = set(
                get_job_reassignable_properties(user).values_list('pk', flat=True)
            )
        return obj.property_id in self._reassignable_property_ids


class JobSerializer(serializers.ModelSerializer):
    machine = JobMachineSerializer(read_only=True)
    procedure_template = serializers.PrimaryKeyRelatedField(
        queryset=MaintenanceProcedure.objects.all(), required=False, allow_null=True,
    )
    machine_id = serializers.SlugRelatedField(
        source='machine', slug_field='machine_id', queryset=Machine.objects.all(),
        write_only=True, required=False, allow_null=True,
    )
    documents = serializers.SerializerMethodField()

    def get_documents(self, obj):
        # Files are always fetched through the authorized Job endpoint.
        return [{
            'id': doc.pk, 'name': doc.name, 'size': doc.size,
            'url': f'/api/jobs/{obj.job_id}/documents/{doc.pk}?property_id={obj.property.property_id}',
        } for doc in obj.documents.all()]

    @staticmethod
    def record_machine_completion(job):
        if job.machine_id and job.status == 'completed' and job.completed_at:
            Machine.objects.filter(pk=job.machine_id).filter(
                Q(last_maintenance_date__isnull=True) | Q(last_maintenance_date__lt=job.completed_at)
            ).update(last_maintenance_date=job.completed_at)
            job._state.fields_cache.pop('machine', None)

    updated_by = serializers.SlugRelatedField(
        slug_field='username',
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    # Change from StringRelatedField to show user details
    user = serializers.SerializerMethodField()
    user_username = serializers.SerializerMethodField()
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    images = JobImageSerializer(source='job_images', many=True, read_only=True)
    topics = TopicSerializer(many=True, read_only=True)
    profile_image = serializers.SerializerMethodField()
    room_type = serializers.CharField(source='room.room_type', read_only=True)
    name = serializers.CharField(source='room.name', read_only=True)
    rooms = RoomSummarySerializer(many=True, read_only=True)
    topic_data = serializers.JSONField(write_only=True)
    room_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default='')
    room_ids = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(), many=True, write_only=True, required=False
    )
    property_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    image_urls = serializers.SerializerMethodField()
    area = AreaSummarySerializer(read_only=True)
    area_id = serializers.PrimaryKeyRelatedField(
        source='area', queryset=Area.objects.all(),
        required=False, allow_null=True,
    )
    area_name = serializers.CharField(source='area.name', read_only=True)
    comments_count = serializers.SerializerMethodField()
    can_operate = serializers.SerializerMethodField()
    can_assign = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name', 'user_email',
            'user_name', 'technician_name', 'created_by_name', 'updated_by_name',
            'updated_by', 'description', 'status', 'priority',
            'remarks', 'created_at', 'updated_at', 'completed_at', 'is_defective',
            'rooms', 'topics', 'images', 'profile_image', 'room_type', 'name',
            'topic_data', 'room_id', 'room_ids', 'property_id', 'image_urls', 'is_preventivemaintenance',
            'area', 'area_id', 'area_name', 'comments_count', 'can_operate', 'can_assign',
            'machine', 'machine_id', 'documents',
            'procedure_template',
            'assigned_to', 'created_by',
        ]
        read_only_fields = [
            'id', 'job_id', 'user', 'user_username', 'user_first_name', 'user_last_name',
            'user_email', 'user_name', 'technician_name', 'created_by_name',
            'updated_by_name', 'images', 'topics', 'area', 'area_name', 'comments_count',
            'can_operate', 'can_assign',
            'assigned_to', 'created_by',
        ]

    def _can_operate(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False) or not obj.property_id:
            return False
        if user.is_superuser:
            return True
        if not hasattr(self, '_operable_property_ids'):
            self._operable_property_ids = set(
                get_operable_properties(user).values_list('pk', flat=True)
            )
        return obj.property_id in self._operable_property_ids

    def get_can_operate(self, obj):
        return self._can_operate(obj)

    def get_can_assign(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False) or not obj.property_id:
            return False
        if user.is_superuser:
            return True
        if not hasattr(self, '_reassignable_property_ids'):
            self._reassignable_property_ids = set(
                get_job_reassignable_properties(user).values_list('pk', flat=True)
            )
        return obj.property_id in self._reassignable_property_ids

    def get_comments_count(self, obj):
        annotated_count = getattr(obj, '_comments_count', None)
        if annotated_count is not None:
            return annotated_count
        try:
            return obj.comments.count()
        except Exception:
            return 0

    def validate(self, data):
        """Validate timestamp fields to ensure logical order"""
        from django.utils import timezone

        request = self.context.get('request')

        created_at = data.get('created_at')
        updated_at = data.get('updated_at')
        completed_at = data.get('completed_at')

        # If created_at is provided, ensure it's not in the future
        if created_at and created_at > timezone.now():
            raise serializers.ValidationError("Created date cannot be in the future")

        # If completed_at is provided, ensure it's not before created_at
        if completed_at and created_at and completed_at < created_at:
            raise serializers.ValidationError("Completed date cannot be before created date")

        # If updated_at is provided, ensure it's not before created_at
        if updated_at and created_at and updated_at < created_at:
            raise serializers.ValidationError("Updated date cannot be before created date")

        room_id = data.get('room_id')
        supplied_rooms = list(data.get('room_ids') or [])
        if room_id and supplied_rooms:
            raise serializers.ValidationError({'non_field_errors': 'Use room_id or room_ids, not both.'})
        if room_id:
            try:
                supplied_rooms = [Room.objects.select_related('property').get(room_id=room_id)]
            except Room.DoesNotExist:
                raise serializers.ValidationError({'room_id': 'Invalid room ID'})

        instance = self.instance
        future_rooms = supplied_rooms if (room_id or 'room_ids' in data) else (
            list(instance.rooms.all()) if instance is not None else []
        )
        future_area = data.get('area') if 'area' in data else (instance.area if instance is not None else None)
        explicit_input = data.get('property_id')
        if instance is None and not str(explicit_input or '').strip():
            raise serializers.ValidationError({
                'property_id': 'An active property is required.'
            })
        try:
            explicit_property = (
                resolve_external_property_reference(explicit_input)
                if explicit_input else None
            )
        except ValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc

        if instance is not None:
            if instance.property_id is None:
                raise serializers.ValidationError({'property_id': 'Existing Job has no canonical property.'})
            if explicit_property is not None and explicit_property.pk != instance.property_id:
                raise serializers.ValidationError({'property_id': 'Job property is immutable after creation.'})
            explicit_property = instance.property

        try:
            resolved_property = resolve_job_property(
                explicit_property=explicit_property,
                area=future_area,
                rooms=future_rooms,
                require=True,
            )
        except ValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc

        future_machine = data.get('machine', instance.machine if instance is not None else None)
        if future_machine:
            if future_machine.property_id != resolved_property.pk:
                raise serializers.ValidationError({'machine_id': 'Select a machine from the active property.'})
            if future_rooms or future_area:
                raise serializers.ValidationError({'machine_id': 'Select a machine, room or area, not multiple location types.'})
            topic_data = data.get('topic_data')
            category = topic_data.get('title') if topic_data else (
                instance.topics.values_list('title', flat=True).first() if instance else None
            )
            try:
                data.update(machine_category_flags(category))
            except ValueError as exc:
                raise serializers.ValidationError({'topic_data': str(exc)})
        elif data.get('topic_data', {}).get('title') in MACHINE_CATEGORIES:
            raise serializers.ValidationError({'topic_data': 'Machine work categories require a machine.'})

        future_template = data.get(
            'procedure_template', instance.procedure_template if instance is not None else None,
        )
        if future_template:
            if not future_machine or not data.get('is_preventivemaintenance'):
                raise serializers.ValidationError({
                    'procedure_template': 'PM templates require a machine preventive maintenance job.',
                })
            if not future_template.machines.filter(pk=future_machine.pk).exists():
                raise serializers.ValidationError({
                    'procedure_template': 'Select a PM template linked to the selected machine.',
                })

        documents = request.FILES.getlist('documents') if request else []
        if documents:
            if instance is not None:
                raise serializers.ValidationError({'documents': 'Attach documents when creating a machine job.'})
            if not future_machine:
                raise serializers.ValidationError({'documents': 'PDF documents require a selected machine.'})
            document_error = validate_documents(documents)
            if document_error:
                raise serializers.ValidationError({'documents': document_error})

        if instance is None and not future_rooms and future_area is None and future_machine is None:
            raise serializers.ValidationError({
                'non_field_errors': 'Either room_id, area_id or machine_id is required.'
            })

        data['_resolved_property'] = resolved_property
        if room_id or 'room_ids' in data:
            data['_resolved_rooms'] = future_rooms

        if request is not None and instance is None:
            def pending_tokens(field_name):
                values = request.data.getlist(field_name) if hasattr(request.data, 'getlist') else []
                if not values:
                    raw = request.data.get(field_name)
                    values = raw if isinstance(raw, list) else ([raw] if raw else [])
                if len(values) == 1 and isinstance(values[0], str) and values[0].lstrip().startswith('['):
                    try:
                        values = json.loads(values[0])
                    except (TypeError, ValueError):
                        raise serializers.ValidationError({field_name: 'Invalid image token list.'})
                return [str(value) for value in values if value]

            before_tokens = pending_tokens('before_image_tokens')
            after_tokens = pending_tokens('after_image_tokens')
            all_tokens = before_tokens + after_tokens
            if len(all_tokens) != len(set(all_tokens)):
                raise serializers.ValidationError({'images': 'Duplicate image tokens are not allowed.'})

            if all_tokens:
                pending = list(PendingJobImage.objects.filter(
                    token__in=all_tokens,
                    uploaded_by=request.user,
                    property=resolved_property,
                    created_at__gte=timezone.now() - timedelta(hours=24),
                ))
                by_token = {str(item.token): item for item in pending}
                if len(by_token) != len(all_tokens):
                    raise serializers.ValidationError({'images': 'One or more uploaded images are unavailable.'})
                if any(by_token[token].image_type != 'before' for token in before_tokens):
                    raise serializers.ValidationError({'before_image_tokens': 'Invalid before image token.'})
                if any(by_token[token].image_type != 'after' for token in after_tokens):
                    raise serializers.ValidationError({'after_image_tokens': 'Invalid after image token.'})

            before_images = [
                *request.FILES.getlist('before_images'),
                *request.FILES.getlist('images'),
            ]
            after_images = request.FILES.getlist('after_images')
            if len(before_images) + len(before_tokens) > 20:
                raise serializers.ValidationError({
                    'before_images': 'You can upload up to 20 before images.'
                })
            if len(after_images) + len(after_tokens) > 5:
                raise serializers.ValidationError({
                    'after_images': 'You can upload up to 5 after images.'
                })
            if (after_images or after_tokens) and data.get('status', 'pending') != 'completed':
                raise serializers.ValidationError({
                    'after_images': 'After images can only be added to a completed job.'
                })
            data['_pending_before_tokens'] = before_tokens
            data['_pending_after_tokens'] = after_tokens

        return data

    def get_user(self, obj):
        """Return user information in a structured format"""
        user = getattr(obj, 'user', None)
        if user:
            return {
                'id': getattr(user, 'id', None),
                'username': get_user_public_username(user),
                'first_name': getattr(user, 'first_name', '') or '',
                'last_name': getattr(user, 'last_name', '') or '',
                'email': getattr(user, 'email', '') or '',
                'full_name': user.get_full_name().strip() or get_user_display_name(user),
                'display_name': get_user_display_name(user),
            }
        return None

    def get_user_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown user'

    def get_user_username(self, obj):
        return get_user_public_username(getattr(obj, 'user', None))

    def get_technician_name(self, obj):
        if obj.assigned_to_id:
            return get_user_display_name(obj.assigned_to) or 'Unknown technician'
        if obj.property.tenant and obj.property.tenant.billing_model == 'property_quantity_v1':
            return 'Unassigned technician'
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown technician'

    def get_created_by_name(self, obj):
        return get_user_display_name(getattr(obj, 'user', None)) or 'Unknown user'

    def get_updated_by_name(self, obj):
        return get_user_display_name(getattr(obj, 'updated_by', None)) or ''

    def get_profile_image(self, obj):
        """
        Lightweight serializer for user's profile image info to avoid deep
        nesting. Returns:
          { profile_image: <url or null>, properties: [{property_id, name}] }
        """
        user = getattr(obj, 'user', None)
        userprofile = getattr(user, 'userprofile', None)
        if not userprofile:
            return None

        request = self.context.get('request')
        image_url = None
        if userprofile.profile_image and request:
            image_url = request.build_absolute_uri(userprofile.profile_image.url)
        elif userprofile.profile_image:
            image_url = userprofile.profile_image.url

        cache = getattr(self, '_accessible_properties_cache', None)
        if cache is None:
            cache = self._accessible_properties_cache = {}
        user_pk = getattr(user, 'pk', None)
        cache_key = ('pk', user_pk) if user_pk is not None else ('object', id(user))
        if cache_key not in cache:
            cache[cache_key] = list(
                get_accessible_properties(user).values('property_id', 'name')
            )
        properties = cache[cache_key]

        return {
            'profile_image': image_url,
            'properties': properties,
        }

    def get_image_urls(self, obj):
        """Return normalized URLs for all images associated with the job."""
        request = self.context.get('request')
        urls = []
        seen = set()
        try:
            for image in obj.job_images.all():
                candidates = []
                jpeg_path = getattr(image, 'jpeg_path', None)
                if jpeg_path:
                    jpeg_name = str(jpeg_path).lstrip('/\\')
                    try:
                        if '%' not in jpeg_name and default_storage.exists(jpeg_name):
                            candidates.append(jpeg_name)
                    except Exception:
                        candidates.append(jpeg_name)
                if getattr(image, 'image', None):
                    candidates.append(getattr(image.image, 'url', image.image.name))
                for candidate in candidates:
                    url = _build_media_absolute_uri(request, candidate)
                    if url and url not in seen:
                        urls.append(url)
                        seen.add(url)
                        break
        except Exception:
            return []
        return urls

    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("User must be logged in to create a job")

        validated_data.pop('user', None)
        validated_data.pop('username', None)
        validated_data.pop('user_id', None)
        validated_data.pop('property_id', None)
        resolved_property = validated_data.pop('_resolved_property')
        require_work_creation_permission(request.user, resolved_property)
        resolved_rooms = validated_data.pop('_resolved_rooms', None)
        pending_before_tokens = validated_data.pop('_pending_before_tokens', [])
        pending_after_tokens = validated_data.pop('_pending_after_tokens', [])

        topic_data = validated_data.pop('topic_data', None)
        room_id = validated_data.pop('room_id', None)
        # ``room_ids`` is request-only input.  The resolved Room instances are
        # attached through Job.rooms after the Job row exists.
        validated_data.pop('room_ids', None)

        if not topic_data or 'title' not in topic_data:
            raise serializers.ValidationError({'topic_data': 'This field is required and must include a title.'})

        stored_documents = []
        try:
            with transaction.atomic():
                room = Room.objects.get(room_id=room_id) if room_id else None
                topic, _ = Topic.objects.get_or_create(
                    title=topic_data['title'],
                    defaults={'description': topic_data.get('description', '')}
                )
                job = Job.objects.create(
                    **validated_data,
                    user=request.user,
                    created_by=request.user,
                    assigned_to=request.user if resolved_property.tenant and resolved_property.tenant.billing_model == 'property_quantity_v1' else None,
                    property=resolved_property,
                )
                if resolved_rooms is not None:
                    job.rooms.set(resolved_rooms)
                elif room:
                    job.rooms.add(room)
                job.topics.add(topic)

                before_images = [
                    *request.FILES.getlist('before_images'),
                    *request.FILES.getlist('images'),
                ]
                for image in before_images:
                    JobImage.objects.create(
                        job=job,
                        image=image,
                        image_type='before',
                        uploaded_by=request.user
                    )
                for image in request.FILES.getlist('after_images'):
                    JobImage.objects.create(
                        job=job,
                        image=image,
                        image_type='after',
                        uploaded_by=request.user,
                    )

                pending_tokens = pending_before_tokens + pending_after_tokens
                if pending_tokens:
                    pending_images = list(
                        PendingJobImage.objects.select_for_update().filter(
                            token__in=pending_tokens,
                            uploaded_by=request.user,
                            property=resolved_property,
                            created_at__gte=timezone.now() - timedelta(hours=24),
                        )
                    )
                    pending_by_token = {str(item.token): item for item in pending_images}
                    if len(pending_by_token) != len(pending_tokens):
                        raise serializers.ValidationError({
                            'images': 'One or more uploaded images expired. Please upload them again.'
                        })
                    for token in pending_tokens:
                        pending_image = pending_by_token[token]
                        JobImage.objects.create(
                            job=job,
                            image=pending_image.image.name,
                            jpeg_path=pending_image.image.name,
                            image_type=pending_image.image_type,
                            uploaded_by=request.user,
                        )
                    PendingJobImage.objects.filter(token__in=pending_tokens).delete()

                for upload in request.FILES.getlist('documents'):
                    doc = JobDocument(job=job, name=Path(upload.name).name[:200], size=upload.size)
                    doc.file.save(f'{uuid.uuid4().hex}.pdf', upload, save=False)
                    stored_documents.append((doc.file.storage, doc.file.name))
                    doc.save()
                self.record_machine_completion(job)
                job.refresh_from_db()
                return job
        except Room.DoesNotExist:
            raise serializers.ValidationError({'room_id': 'Invalid room ID'})
        except Exception as e:
            for storage, name in stored_documents:
                storage.delete(name)
            raise serializers.ValidationError({'detail': str(e)})

    def update(self, instance, validated_data):
        validated_data.pop('property_id', None)
        resolved_property = validated_data.pop('_resolved_property')
        resolved_rooms = validated_data.pop('_resolved_rooms', None)
        validated_data.pop('room_id', None)
        validated_data.pop('room_ids', None)
        if resolved_property.pk != instance.property_id:
            raise serializers.ValidationError({'property_id': 'Job property is immutable after creation.'})
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if resolved_rooms is not None:
                instance.rooms.set(resolved_rooms)
            self.record_machine_completion(instance)
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Frontend/business identity is the canonical Property.property_id.
        # Exposing it from Job.property avoids inferring job ownership from
        # room/profile compatibility projections on read paths.
        data['property_id'] = instance.property.property_id if instance.property_id else None
        data['rooms'] = data.get('rooms') if isinstance(data.get('rooms'), list) else []
        data['topics'] = data.get('topics') if isinstance(data.get('topics'), list) else []
        data['images'] = data.get('images') if isinstance(data.get('images'), list) else []
        data['image_urls'] = data.get('image_urls') if isinstance(data.get('image_urls'), list) else []
        data['description'] = data.get('description') or ''
        data['status'] = data.get('status') or 'pending'
        data['priority'] = data.get('priority') or 'medium'
        data['comments_count'] = data.get('comments_count') or 0
        return data
