import logging

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Property, UserProfile
from ..serializers import UserProfileSerializer, UserSerializer
from .common import display_name_from_user


logger = logging.getLogger(__name__)
User = get_user_model()


class UserProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer

    def get_queryset(self):
        # For the 'detailed' action, only admins can see all user profiles
        if self.action == 'detailed':
            if self.request.user.is_superuser or self.request.user.is_staff:
                return UserProfile.objects.all().prefetch_related('properties')
            else:
                # Non-admin users can only see their own profile
                return UserProfile.objects.filter(user=self.request.user).prefetch_related('properties')
        else:
            # For other actions, return only the current user's profile
            return UserProfile.objects.filter(user=self.request.user).prefetch_related('properties')

    @action(detail=False, methods=['get'])
    def me(self, request):
        profile = get_object_or_404(UserProfile, user=request.user)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def detailed(self, request):
        """Get all user profiles with properties for admin users"""
        # Verify admin access
        if not (request.user.is_superuser or request.user.is_staff):
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
        profile = self.get_object()
        property_id = request.data.get('property_id')
        if not property_id:
            return Response({'error': 'property_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        property = get_object_or_404(Property, property_id=property_id)
        profile.properties.add(property)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def remove_property(self, request, pk=None):
        profile = self.get_object()
        property_id = request.data.get('property_id')
        if not property_id:
            return Response({'error': 'property_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        property = get_object_or_404(Property, property_id=property_id)
        profile.properties.remove(property)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return User.objects.all()
        return User.objects.filter(pk=user.pk)

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("You do not have permission to create users.")
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("You do not have permission to delete users.")
        return super().destroy(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """
    Update user profile with Auth0 profile information.
    This endpoint is called by the frontend after successful Auth0 authentication.
    """
    try:
        user = request.user
        auth0_profile = request.data.get('auth0_profile', {})
        
        logger.info(f"🔍 Profile update requested for user: {user.username}")
        logger.info(f"📝 Auth0 profile data received: {auth0_profile}")
        
        if not auth0_profile:
            logger.warning(f"❌ No Auth0 profile data provided for user: {user.username}")
            return Response(
                {'error': 'No Auth0 profile data provided'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Track what fields were updated
        updated_fields = []
        
        # Update email if available and different
        if auth0_profile.get('email') and user.email != auth0_profile['email']:
            old_email = user.email
            user.email = auth0_profile['email']
            updated_fields.append('email')
            logger.info(f"📧 Updated email for {user.username}: {old_email} -> {user.email}")
        
        # Update first name if available and different
        if auth0_profile.get('given_name') and user.first_name != auth0_profile['given_name']:
            old_first_name = user.first_name
            user.first_name = auth0_profile['given_name'][:30]
            updated_fields.append('first_name')
            logger.info(f"👤 Updated first_name for {user.username}: {old_first_name} -> {user.first_name}")
        
        # Update last name if available and different
        if auth0_profile.get('family_name') and user.last_name != auth0_profile['family_name']:
            old_last_name = user.last_name
            user.last_name = auth0_profile['family_name'][:150]
            updated_fields.append('last_name')
            logger.info(f"👤 Updated last_name for {user.username}: {old_last_name} -> {user.last_name}")
        
        # If no given_name/family_name but we have name, split it
        if (not user.first_name and not user.last_name) and auth0_profile.get('name'):
            name_parts = auth0_profile['name'].split(' ', 1)
            if len(name_parts) >= 2:
                user.first_name = name_parts[0][:30]
                user.last_name = name_parts[1][:150]
                updated_fields.extend(['first_name', 'last_name'])
                logger.info(f"👤 Split name for {user.username}: {auth0_profile['name']} -> first: {user.first_name}, last: {user.last_name}")
            elif len(name_parts) == 1:
                user.first_name = name_parts[0][:30]
                updated_fields.append('first_name')
                logger.info(f"👤 Single name for {user.username}: {auth0_profile['name']} -> first: {user.first_name}")
        
        # Use nickname if no first name is available
        if not user.first_name and auth0_profile.get('nickname'):
            user.first_name = auth0_profile['nickname'][:30]
            updated_fields.append('first_name')
            logger.info(f"👤 Used nickname for {user.username}: {auth0_profile['nickname']} -> first: {user.first_name}")
        
        # Save the user if any fields were updated
        if updated_fields:
            user.save(update_fields=updated_fields)
            logger.info(f"✅ Updated user {user.username} profile fields: {updated_fields}")
        else:
            logger.info(f"ℹ️ No profile updates needed for user {user.username}")
        
        # Return the updated user profile
        response_data = {
            'message': 'Profile updated successfully',
            'updated_fields': updated_fields,
            'user': {
                'id': user.id,
                'username': display_name_from_user(user, fallback=user.email or 'User'),
                'display_name': display_name_from_user(user, fallback=user.email or 'User'),
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'date_joined': user.date_joined,
                'last_login': user.last_login
            }
        }
        
        logger.info(f"📤 Returning profile update response for {user.username}: {response_data}")
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"❌ Error updating user profile for {request.user.username if request.user else 'unknown'}: {e}", exc_info=True)
        return Response(
            {'error': 'Failed to update user profile'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

