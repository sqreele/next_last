"""Users definitions."""
from rest_framework import serializers
from ..models import UserProfile, Session
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from ..tenancy import TENANT_WIDE_PROPERTY_ROLES, get_accessible_properties, get_user_tenant_memberships, user_can_access_billing
from ..platform_authorization import get_platform_capabilities, get_platform_roles, is_platform_user
from .shared import get_user_display_name, get_user_public_username
from .locations import PropertySerializer

User = get_user_model()


class UserReadSerializer(serializers.HyperlinkedModelSerializer):
    username = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['url', 'username', 'email', 'display_name', 'is_staff']

    def get_display_name(self, obj):
        return get_user_display_name(obj)

    def get_username(self, obj):
        return get_user_public_username(obj)


class UserSummarySerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'display_name', 'is_staff']
        read_only_fields = fields

    def get_full_name(self, obj):
        full_name = obj.get_full_name().strip()
        return full_name or get_user_display_name(obj)

    def get_display_name(self, obj):
        return get_user_display_name(obj)

    def get_username(self, obj):
        return get_user_public_username(obj)


class JobAssignmentCandidateSerializer(UserSummarySerializer):
    """Minimal identity projection for a property-scoped assignment choice."""

    class Meta(UserSummarySerializer.Meta):
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'display_name']
        read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
    properties = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    display_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)
    # Property fields from User model
    user_property_name = serializers.CharField(source='user.property_name', read_only=True)
    user_property_id = serializers.CharField(source='user.property_id', read_only=True)
    # Property fields from UserProfile model
    profile_property_name = serializers.CharField(source='property_name', read_only=True)
    profile_property_id = serializers.CharField(source='property_id', read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'display_name',
            'profile_image',
            'positions',
            'properties',
            'user_property_name',
            'user_property_id',
            'profile_property_name',
            'profile_property_id',
            'created_at',
            'email_notifications_enabled',
        ]
        read_only_fields = ['id', 'username', 'email', 'first_name', 'last_name', 'display_name', 'created_at']

    def get_display_name(self, obj):
        return get_user_display_name(obj.user)

    def get_username(self, obj):
        return get_user_public_username(obj.user)

    def get_properties(self, obj):
        """Return the read-only compatibility projection of canonical access."""
        return PropertySerializer(
            get_accessible_properties(obj.user),
            many=True,
            read_only=True,
            context=self.context,
        ).data


class CurrentUserProfileSerializer(serializers.ModelSerializer):
    """Minimal current-user profile DTO.

    Account identity and TenantMembership authorization are projections only.
    The companion update serializer owns the deliberately small write contract.
    """

    username = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    display_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='user.date_joined', read_only=True)
    properties = serializers.SerializerMethodField()
    memberships = serializers.SerializerMethodField()
    platform_roles = serializers.SerializerMethodField()
    platform_capabilities = serializers.SerializerMethodField()
    is_platform_user = serializers.SerializerMethodField()
    # Compatibility alias only. This is Django break-glass status, not a
    # PlatformMembership role.
    is_platform_superuser = serializers.BooleanField(source='user.is_superuser', read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'username',
            'email',
            'first_name',
            'last_name',
            'display_name',
            'profile_image',
            'positions',
            'created_at',
            'email_notifications_enabled',
            'properties',
            'memberships',
            'platform_roles',
            'platform_capabilities',
            'is_platform_user',
            'is_platform_superuser',
        ]
        read_only_fields = fields

    def get_username(self, obj):
        return get_user_public_username(obj.user)

    def get_display_name(self, obj):
        return get_user_display_name(obj.user)

    @staticmethod
    def _property_summary(properties):
        return [
            {
                'property_id': property_obj.property_id,
                'name': property_obj.name,
            }
            for property_obj in properties
        ]

    def get_properties(self, obj):
        return self._property_summary(get_accessible_properties(obj.user).order_by('name'))

    def get_memberships(self, obj):
        memberships = get_user_tenant_memberships(obj.user).prefetch_related(
            'tenant__properties',
        ).order_by('tenant__name')
        result = []
        for membership in memberships:
            if membership.role in TENANT_WIDE_PROPERTY_ROLES:
                properties = sorted(membership.tenant.properties.all(), key=lambda item: item.name)
                access_scope = 'tenant_wide'
            else:
                properties = sorted(
                    (
                        property_obj
                        for property_obj in membership.properties.all()
                        if property_obj.tenant_id == membership.tenant_id
                    ),
                    key=lambda item: item.name,
                )
                access_scope = 'granted'
            result.append({
                'tenant_id': membership.tenant.tenant_id,
                'tenant_name': membership.tenant.name,
                'role': membership.role,
                'can_manage_billing': user_can_access_billing(obj.user, membership.tenant),
                'access_scope': access_scope,
                'properties': self._property_summary(properties),
            })
        return result

    def get_platform_roles(self, obj):
        return sorted(get_platform_roles(obj.user))

    def get_platform_capabilities(self, obj):
        return sorted(get_platform_capabilities(obj.user))

    def get_is_platform_user(self, obj):
        return is_platform_user(obj.user)


class CurrentUserProfileUpdateSerializer(serializers.Serializer):
    """Write allowlist for user-controlled, non-authorization metadata."""

    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    positions = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def update(self, instance, validated_data):
        with transaction.atomic():
            user = instance.user
            user_fields = []
            for field in ('first_name', 'last_name'):
                if field in validated_data and getattr(user, field) != validated_data[field]:
                    setattr(user, field, validated_data[field])
                    user_fields.append(field)
            if user_fields:
                user.save(update_fields=user_fields)

            if 'positions' in validated_data and instance.positions != validated_data['positions']:
                instance.positions = validated_data['positions']
                # UserProfile.save() performs image conversion whenever an avatar is
                # present. A metadata-only update must not rewrite or orphan it.
                UserProfile.objects.filter(pk=instance.pk).update(positions=instance.positions)
        return instance

    def create(self, validated_data):
        raise NotImplementedError('Current-user profiles are created with their User record.')


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password]
    )
    email = serializers.EmailField(required=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('username', 'password', 'email', 'display_name')
        read_only_fields = ('display_name',)

    def validate(self, attrs):
        username = attrs.get('username')
        if username and User.objects.filter(username=username).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError({"username": "A user with that username already exists."})

        email = attrs.get('email')
        if email and User.objects.filter(email=email).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError({"email": "A user with that email already exists."})

        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        UserProfile.objects.get_or_create(user=user)
        return user

    def get_display_name(self, obj):
        return get_user_display_name(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['username'] = get_user_public_username(instance)
        data['display_name'] = get_user_display_name(instance)
        return data

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


UserSerializer = UserWriteSerializer


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if not username or not password:
            raise serializers.ValidationError("Both username and password are required.")

        return attrs


class SessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = [
            'session_token',
            'access_token',
            'refresh_token',
            'expires_at',
            'created_at',
        ]
        read_only_fields = ['created_at']
