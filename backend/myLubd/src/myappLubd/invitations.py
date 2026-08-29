"""Production-safe tenant invitation lifecycle and API endpoints."""

from datetime import timedelta
import secrets
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.html import escape
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth import Auth0JWTAuthentication
from .email_utils import send_email
from .invitation_audit import audit_invitation_event
from .models import AuthIdentity, Property, Tenant, TenantInvitation, TenantMembership
from .tenancy import (
    TENANT_WIDE_PROPERTY_ROLES,
    can_manage_membership_property_grants,
    enforce_subscription_limit,
)
from .throttles import (
    InvitationAcceptThrottle,
    InvitationAdminThrottle,
    InvitationPreviewThrottle,
)


PROPERTY_REQUIRED_ROLES = {'supervisor', 'technician', 'viewer'}
PROPERTY_OPTIONAL_ROLES = {'billing'}
User = get_user_model()


class InvitationAuth0JWTAuthentication(Auth0JWTAuthentication):
    """Expose already-verified claims only to the invitation accept endpoint.

    The production authentication implementation remains unchanged. This
    narrow adapter captures the exact signed claims while delegating token
    validation and AuthIdentity resolution to the established backend.
    """

    def authenticate(self, request):
        self._invitation_verified_claims = None
        result = super().authenticate(request)
        if result is None:
            return None
        return result[0], self._invitation_verified_claims

    def _get_or_create_user_from_claims(self, claims):
        self._invitation_verified_claims = claims
        return super()._get_or_create_user_from_claims(claims)


class InvitationConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Invitation conflicts with the existing membership.'
    default_code = 'invitation_conflict'


class InvitationGone(APIException):
    status_code = status.HTTP_410_GONE
    default_detail = 'Invitation is no longer available.'
    default_code = 'invitation_gone'


def invitation_ttl():
    days = int(getattr(settings, 'TENANT_INVITATION_EXPIRY_DAYS', 7))
    return timedelta(days=max(1, days))


def validate_role_properties(role, properties, tenant):
    property_list = list(properties)
    if any(prop.tenant_id != tenant.pk for prop in property_list):
        raise serializers.ValidationError({
            'properties': 'Every invited property must belong to the selected tenant.',
        })
    if role in TENANT_WIDE_PROPERTY_ROLES and property_list:
        raise serializers.ValidationError({
            'properties': 'Tenant-wide roles must not receive explicit property grants.',
        })
    if role in PROPERTY_REQUIRED_ROLES and not property_list:
        raise serializers.ValidationError({
            'properties': 'This role requires at least one property grant.',
        })
    if role not in TENANT_WIDE_PROPERTY_ROLES | PROPERTY_REQUIRED_ROLES | PROPERTY_OPTIONAL_ROLES:
        raise serializers.ValidationError({'role': 'Unsupported membership role.'})
    return property_list


def create_invitation(*, tenant, email, role, properties, invited_by):
    normalized_email = TenantInvitation.normalize_email(email)
    property_list = validate_role_properties(role, properties, tenant)
    now = timezone.now()

    try:
        with transaction.atomic():
            Tenant.objects.select_for_update().get(pk=tenant.pk)
            # Phase A MVP limitation: one unresolved normalized email globally.
            # Make this tenant-scoped before public multi-organization launch.
            unresolved = TenantInvitation.objects.select_for_update().filter(
                email=normalized_email,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
            ).first()
            if unresolved is not None:
                if unresolved.expires_at > now:
                    raise serializers.ValidationError({
                        'email': 'An active invitation already exists for this email.',
                    })
                unresolved.revoked_at = now
                unresolved.save(update_fields=['revoked_at', 'updated_at'])

            matching_users = list(
                User.objects.select_for_update()
                .filter(email__iexact=normalized_email)
                .order_by('pk')[:2]
            )
            if len(matching_users) > 1:
                raise serializers.ValidationError({
                    'email': 'Multiple accounts already use this email; contact a platform administrator.',
                })
            if matching_users and not matching_users[0].is_active:
                raise serializers.ValidationError({
                    'email': 'The existing account for this email is inactive.',
                })
            if not matching_users:
                User.objects.create_user(
                    username=f'invite_{TenantInvitation.hash_token(secrets.token_urlsafe(16))[:24]}',
                    email=normalized_email,
                    password=None,
                )

            invitation = TenantInvitation(
                tenant=tenant,
                email=normalized_email,
                role=role,
                invited_by=invited_by,
                expires_at=now + invitation_ttl(),
            )
            token = invitation.issue_token()
            invitation.save()
            invitation.properties.set(property_list)
    except IntegrityError as exc:
        raise serializers.ValidationError({
            'email': 'An active invitation already exists for this email.',
        }) from exc
    return invitation, token


def rotate_invitation_token(invitation):
    with transaction.atomic():
        Tenant.objects.select_for_update().get(pk=invitation.tenant_id)
        locked = TenantInvitation.objects.select_for_update().get(pk=invitation.pk)
        if locked.accepted_at is not None:
            raise InvitationConflict('Accepted invitations cannot be resent.')
        if locked.revoked_at is not None:
            raise InvitationGone('Revoked invitations cannot be resent.')
        token = locked.issue_token()
        locked.expires_at = timezone.now() + invitation_ttl()
        locked.save(update_fields=['token_hash', 'expires_at', 'updated_at'])
    return locked, token


def revoke_invitation(invitation):
    with transaction.atomic():
        Tenant.objects.select_for_update().get(pk=invitation.tenant_id)
        locked = TenantInvitation.objects.select_for_update().get(pk=invitation.pk)
        if locked.accepted_at is not None:
            raise InvitationConflict('Accepted invitations cannot be revoked.')
        if locked.revoked_at is None:
            locked.revoked_at = timezone.now()
            locked.save(update_fields=['revoked_at', 'updated_at'])
    return locked


def invitation_from_token(token, *, for_update=False, tenant_id=None):
    raw_token = str(token or '').strip()
    if not raw_token or len(raw_token) > 256:
        raise NotFound('Invitation unavailable.')
    token_hash = TenantInvitation.hash_token(raw_token)
    queryset = TenantInvitation.objects.select_related('tenant', 'accepted_by')
    if for_update:
        queryset = queryset.select_for_update(of=('self',))
    if tenant_id is not None:
        queryset = queryset.filter(tenant_id=tenant_id)
    invitation = queryset.filter(token_hash=token_hash).first()
    if invitation is None or not invitation.matches_token(raw_token):
        raise NotFound('Invitation unavailable.')
    return invitation


def _claim_value(claims, name):
    namespace = getattr(settings, 'AUTH0_CLAIM_NAMESPACE', 'https://staymaint.com').rstrip('/')
    return claims.get(f'{namespace}/{name}', claims.get(name))


def _validate_accepting_identity(user, claims, invitation):
    if not isinstance(claims, dict):
        raise PermissionDenied('Auth0 identity authentication is required.')
    issuer = claims.get('iss')
    subject = claims.get('sub')
    email = TenantInvitation.normalize_email(_claim_value(claims, 'email'))
    if _claim_value(claims, 'email_verified') is not True:
        raise PermissionDenied('A verified email address is required.')
    if not issuer or not subject or not AuthIdentity.objects.select_for_update().filter(
        user=user,
        issuer=issuer,
        subject=subject,
    ).exists():
        raise PermissionDenied('Auth0 identity authentication is required.')
    if email != invitation.email or TenantInvitation.normalize_email(user.email) != invitation.email:
        raise PermissionDenied('Sign in with the email address that received this invitation.')


def _membership_matches_invitation(membership, invitation, property_ids):
    if not membership.is_active or membership.role != invitation.role:
        return False
    current_ids = set(membership.properties.values_list('pk', flat=True))
    if invitation.role in TENANT_WIDE_PROPERTY_ROLES:
        return not current_ids
    return current_ids == property_ids


def accept_invitation(*, token, user, identity_claims):
    # This preliminary lookup identifies which Tenant must be locked first. It
    # is non-authoritative; token and lifecycle state are revalidated afterward.
    candidate = invitation_from_token(token)

    with transaction.atomic():
        try:
            tenant = Tenant.objects.select_for_update().get(pk=candidate.tenant_id)
        except Tenant.DoesNotExist as exc:
            raise NotFound('Invitation unavailable.') from exc
        invitation = invitation_from_token(token, for_update=True, tenant_id=tenant.pk)
        canonical_user = User.objects.select_for_update().filter(pk=user.pk).first()
        if canonical_user is None or not canonical_user.is_active:
            raise PermissionDenied('This account is inactive.')
        _validate_accepting_identity(canonical_user, identity_claims, invitation)

        invitation_properties = list(invitation.properties.select_for_update())
        try:
            validate_role_properties(invitation.role, invitation_properties, tenant)
        except serializers.ValidationError as exc:
            raise InvitationConflict('Invitation role or property scope is invalid.') from exc
        property_ids = {prop.pk for prop in invitation_properties}

        if invitation.accepted_at is not None:
            if invitation.accepted_by_id != canonical_user.pk:
                raise InvitationConflict('Invitation has already been accepted.')
            membership = TenantMembership.objects.select_for_update().filter(
                tenant=tenant,
                user=canonical_user,
            ).first()
            if membership is None or not _membership_matches_invitation(
                membership, invitation, property_ids,
            ):
                raise InvitationConflict(
                    'The accepted invitation no longer matches the authoritative membership.',
                )
            return invitation, membership, False

        if invitation.revoked_at is not None:
            raise InvitationGone('Invitation has been revoked.')
        if invitation.expires_at <= timezone.now():
            raise InvitationGone('Invitation has expired.')

        membership = TenantMembership.objects.select_for_update().filter(
            tenant=tenant,
            user=canonical_user,
        ).first()
        created = False
        if membership is not None:
            if not _membership_matches_invitation(membership, invitation, property_ids):
                raise InvitationConflict(
                    'Your existing membership role or property grants conflict with this invitation.',
                )
        else:
            enforce_subscription_limit(tenant, 'max_users')
            membership = TenantMembership.objects.create(
                tenant=tenant,
                user=canonical_user,
                role=invitation.role,
                invited_by=invitation.invited_by,
            )
            if property_ids:
                membership.properties.set(property_ids)
            created = True

        invitation.accepted_by = canonical_user
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=['accepted_by', 'accepted_at', 'updated_at'])
        return invitation, membership, created


def send_invitation(invitation, token):
    base_url = str(getattr(settings, 'FRONTEND_BASE_URL', 'https://staymaint.com') or '').rstrip('/')
    invite_url = f'{base_url}/invitations/accept#{urlencode({"token": token})}'
    tenant_name = invitation.tenant.name.replace('\r', ' ').replace('\n', ' ')
    inviter_name = (
        invitation.invited_by.get_full_name().strip()
        or invitation.invited_by.get_username()
        if invitation.invited_by is not None
        else 'A tenant administrator'
    )
    expiry = timezone.localtime(invitation.expires_at).strftime('%Y-%m-%d %H:%M %Z')
    body = (
        f'{inviter_name} invited you to join {tenant_name} in StayMaint '
        f'as {invitation.get_role_display()}.\n\n'
        f'Accept this invitation before {expiry}:\n{invite_url}\n\n'
        'If you were not expecting this invitation, you can ignore this email.'
    )
    html_body = (
        f'<p>{escape(inviter_name)} invited you to join <strong>{escape(tenant_name)}</strong> '
        f'in StayMaint as {escape(invitation.get_role_display())}.</p>'
        f'<p><a href="{escape(invite_url)}">Accept invitation</a></p>'
        f'<p>This invitation expires at {escape(expiry)}.</p>'
    )
    return send_email(
        invitation.email,
        f'Invitation to join {tenant_name} on StayMaint',
        body,
        html_body=html_body,
    )


class InvitationPropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = ['id', 'property_id', 'name']


class TenantInvitationSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    invited_by_name = serializers.SerializerMethodField()
    properties = InvitationPropertySerializer(many=True, read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = TenantInvitation
        fields = [
            'id', 'tenant', 'tenant_name', 'email', 'role', 'properties',
            'invited_by_name', 'status', 'expires_at', 'accepted_at',
            'revoked_at', 'created_at', 'updated_at',
        ]

    def get_invited_by_name(self, invitation):
        if invitation.invited_by is None:
            return None
        return invitation.invited_by.get_full_name().strip() or invitation.invited_by.get_username()


class TenantInvitationCreateSerializer(serializers.Serializer):
    tenant = serializers.PrimaryKeyRelatedField(queryset=Tenant.objects.all())
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=TenantMembership.ROLE_CHOICES)
    properties = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.select_related('tenant'),
        many=True,
        required=False,
    )

    def validate_email(self, value):
        return TenantInvitation.normalize_email(value)

    def validate(self, attrs):
        attrs['properties'] = validate_role_properties(
            attrs['role'], attrs.get('properties', []), attrs['tenant'],
        )
        return attrs


class TenantInvitationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.action in {'create', 'resend', 'revoke'}:
            return [InvitationAdminThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == 'create':
            return TenantInvitationCreateSerializer
        return TenantInvitationSerializer

    def get_queryset(self):
        queryset = TenantInvitation.objects.select_related(
            'tenant', 'invited_by', 'accepted_by',
        ).prefetch_related('properties')
        if not self.request.user.is_superuser:
            queryset = queryset.filter(
                tenant__memberships__user=self.request.user,
                tenant__memberships__is_active=True,
                tenant__memberships__role__in={'owner', 'admin'},
            )
        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            queryset = queryset.filter(tenant_id=tenant_id)
        return queryset.distinct()

    def create(self, request, *args, **kwargs):
        manageable_tenants = Tenant.objects.all()
        if not request.user.is_superuser:
            manageable_tenants = manageable_tenants.filter(
                memberships__user=request.user,
                memberships__is_active=True,
                memberships__role__in={'owner', 'admin'},
            )
        try:
            tenant = manageable_tenants.filter(pk=request.data.get('tenant')).first()
        except (TypeError, ValueError):
            tenant = None
        if tenant is None:
            audit_invitation_event(
                'invitation.create_denied', 'denied', request=request,
                reason_code='tenant_unavailable',
            )
            raise PermissionDenied('You do not have permission to invite users to this tenant.')

        serializer = self.get_serializer(data=request.data)
        serializer.fields['tenant'].queryset = manageable_tenants
        serializer.fields['properties'].child_relation.queryset = Property.objects.filter(tenant=tenant)
        serializer.is_valid(raise_exception=True)
        if not can_manage_membership_property_grants(request.user, tenant):
            audit_invitation_event(
                'invitation.create_denied', 'denied', request=request,
                tenant=tenant, reason_code='insufficient_role',
            )
            raise PermissionDenied('You do not have permission to invite users to this tenant.')
        invitation, token = create_invitation(invited_by=request.user, **serializer.validated_data)
        email_sent = send_invitation(invitation, token)
        audit_invitation_event(
            'invitation.created', 'allowed', request=request,
            tenant=tenant, invitation=invitation, role=invitation.role,
        )
        payload = TenantInvitationSerializer(invitation).data
        payload['email_sent'] = email_sent
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        invitation, token = rotate_invitation_token(self.get_object())
        email_sent = send_invitation(invitation, token)
        audit_invitation_event(
            'invitation.resent', 'allowed', request=request,
            tenant=invitation.tenant, invitation=invitation,
        )
        payload = TenantInvitationSerializer(invitation).data
        payload['email_sent'] = email_sent
        return Response(payload)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        invitation = revoke_invitation(self.get_object())
        audit_invitation_event(
            'invitation.revoked', 'allowed', request=request,
            tenant=invitation.tenant, invitation=invitation,
        )
        return Response(TenantInvitationSerializer(invitation).data)


class TenantInvitationPreviewView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [InvitationPreviewThrottle]

    def post(self, request):
        invitation = invitation_from_token(request.data.get('token'))
        return Response({
            'tenant_name': invitation.tenant.name,
            'role': invitation.role,
            'properties': InvitationPropertySerializer(invitation.properties.all(), many=True).data,
            'expires_at': invitation.expires_at,
            'status': invitation.status,
        })


class TenantInvitationAcceptView(APIView):
    authentication_classes = [InvitationAuth0JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [InvitationAcceptThrottle]

    def post(self, request):
        try:
            invitation, membership, created = accept_invitation(
                token=request.data.get('token'),
                user=request.user,
                identity_claims=request.auth,
            )
        except (InvitationConflict, InvitationGone, NotFound, PermissionDenied) as exc:
            audit_invitation_event(
                'invitation.accept_denied', 'denied', request=request,
                reason_code=getattr(exc, 'default_code', 'accept_denied'),
            )
            raise
        audit_invitation_event(
            'invitation.accepted', 'allowed', request=request,
            tenant=invitation.tenant, invitation=invitation, role=membership.role,
        )
        return Response({
            'detail': 'Invitation accepted.',
            'created': created,
            'tenant_id': invitation.tenant.tenant_id,
            'membership_id': membership.pk,
            'role': membership.role,
        })
