"""Users definitions."""
from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from ..models import UserProfile
from ..serializers import CurrentUserProfileSerializer, CurrentUserProfileUpdateSerializer, UserProfileSerializer, UserWriteSerializer
import logging

User = get_user_model()

logger = logging.getLogger('myappLubd.views')


class UserProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer

    def get_queryset(self):
        # For the 'detailed' action, only admins can see all user profiles
        if self.action == 'detailed':
            if self.request.user.is_superuser:
                return UserProfile.objects.all()
            else:
                # Non-admin users can only see their own profile
                return UserProfile.objects.filter(user=self.request.user)
        else:
            # For other actions, return only the current user's profile
            return UserProfile.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        profile, _ = UserProfile.objects.select_related('user').get_or_create(
            user=request.user,
        )
        if request.method == 'PATCH':
            allowed_fields = {'first_name', 'last_name', 'positions'}
            rejected_fields = sorted(set(request.data.keys()) - allowed_fields)
            if rejected_fields:
                raise ValidationError({
                    field: ['This field is read-only on the current-user profile.']
                    for field in rejected_fields
                })
            update_serializer = CurrentUserProfileUpdateSerializer(
                profile,
                data=request.data,
                partial=True,
                context=self.get_serializer_context(),
            )
            update_serializer.is_valid(raise_exception=True)
            profile = update_serializer.save()

        serializer = CurrentUserProfileSerializer(
            profile,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def detailed(self, request):
        """Get all user profiles with properties for admin users"""
        # Verify admin access
        if not request.user.is_superuser:
            raise PermissionDenied("Only admin users can access all user profiles")

        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['patch', 'put'])
    def update_email_notifications(self, request):
        """Update email notifications setting for current user"""
        try:
            profile, created = UserProfile.objects.get_or_create(user=request.user)
            email_notifications_enabled = request.data.get('email_notifications_enabled')

            if email_notifications_enabled is None:
                return Response(
                    {'error': 'email_notifications_enabled field is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            profile.email_notifications_enabled = bool(email_notifications_enabled)
            profile.save()

            serializer = self.get_serializer(profile)
            return Response({
                'message': 'Email notifications setting updated successfully',
                'email_notifications_enabled': profile.email_notifications_enabled,
                'profile': serializer.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error updating email notifications: {e}", exc_info=True)
            return Response(
                {'error': 'Failed to update email notifications setting'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def add_property(self, request, pk=None):
        raise ValidationError({
            'detail': 'Direct property grants are retired; manage access through TenantMembership.'
        })

    @action(detail=True, methods=['post'])
    def remove_property(self, request, pk=None):
        raise ValidationError({
            'detail': 'Direct property grants are retired; manage access through TenantMembership.'
        })


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserWriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return User.objects.all()
        return User.objects.filter(pk=user.pk)

    def create(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            raise PermissionDenied("You do not have permission to create users.")
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            raise PermissionDenied("You do not have permission to delete users.")
        return super().destroy(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """
    Backward-compatible profile metadata update.

    The request body is not a verified identity-provider assertion, so identity
    fields such as email are intentionally ignored. New clients use the
    current-user ``user-profiles/me`` PATCH contract instead.
    """
    try:
        user = request.user
        auth0_profile = request.data.get('auth0_profile', {})

        if not isinstance(auth0_profile, dict) or not auth0_profile:
            return Response(
                {'error': 'No Auth0 profile data provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        profile, _ = UserProfile.objects.select_related('user').get_or_create(user=user)
        update_data = {}
        if 'given_name' in auth0_profile:
            update_data['first_name'] = auth0_profile['given_name']
        if 'family_name' in auth0_profile:
            update_data['last_name'] = auth0_profile['family_name']

        serializer = CurrentUserProfileUpdateSerializer(
            profile,
            data=update_data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        response_data = {
            'message': 'Profile updated successfully',
            'updated_fields': sorted(update_data.keys()),
            'profile': CurrentUserProfileSerializer(
                profile,
                context={'request': request},
            ).data,
        }
        return Response(response_data, status=status.HTTP_200_OK)
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating user profile for {request.user.username if request.user else 'unknown'}: {e}", exc_info=True)
        return Response(
            {'error': 'Failed to update user profile'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
