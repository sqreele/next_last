import logging
import requests
from django.contrib.auth import get_user_model
from django.conf import settings

User = get_user_model()
from rest_framework import authentication, exceptions
from rest_framework.authentication import get_authorization_header
from django.utils.translation import gettext_lazy as _
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from jose.jwt import get_unverified_headers

from .security_audit import audit_event

logger = logging.getLogger(__name__)




class Auth0JWTAuthentication(authentication.BaseAuthentication):
    """
    Auth0 JWT authentication backend for Django REST Framework.
    Validates JWT tokens from Auth0 and creates/updates local user accounts.
    Uses python-jose for robust JWT validation.
    """
    www_authenticate_realm = 'api'

    def authenticate(self, request):
        # If Auth0 is not configured, skip and allow other authenticators to try
        domain = getattr(settings, 'AUTH0_DOMAIN', None)
        if not domain:
            logger.debug("Auth0 not configured, skipping authentication")
            return None

        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != b'bearer':
            logger.debug("No Bearer token found in Authorization header")
            return None

        if len(auth) == 1:
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='malformed_header')
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header. No credentials provided.'))
        elif len(auth) > 2:
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='malformed_header')
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header.'))

        try:
            token = auth[1].decode('utf-8')
        except UnicodeDecodeError:
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='malformed_header')
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header.'))

        try:
            payload = self._validate_auth0_token(token, request=request)
            logger.debug("JWT validation successful")
        except exceptions.AuthenticationFailed:
            # Propagate DRF-friendly exceptions
            logger.warning("JWT validation failed with AuthenticationFailed")
            raise
        except Exception:
            logger.error("Unexpected error during JWT validation")
            raise exceptions.AuthenticationFailed(_('Invalid token.'))

        user = self._get_or_create_user_from_claims(payload, request=request)
        logger.debug(f"User authenticated: {user.username}")
        return (user, None)

    def authenticate_header(self, request):
        return 'Bearer realm="%s"' % self.www_authenticate_realm

    def _validate_auth0_token(self, token, request=None):
        domain = settings.AUTH0_DOMAIN  # ensured present in authenticate()
        issuer = getattr(settings, 'AUTH0_ISSUER', None) or f"https://{domain}/"
        audience = getattr(settings, 'AUTH0_AUDIENCE', None)

        if not audience:
            logger.error("Auth0 audience is not configured")
            audit_event(
                'security.auth.jwt_invalid', 'denied', request=request,
                reason_code='audience_configuration_missing',
            )
            raise exceptions.AuthenticationFailed(_('Token audience validation is unavailable.'))

        logger.debug("Validating JWT against configured Auth0 issuer and audience")

        # Get the JWKS (JSON Web Key Set) from Auth0
        jwks_url = f"https://{domain}/.well-known/jwks.json"
        logger.debug(f"Fetching JWKS from: {jwks_url}")
        
        try:
            jwks_response = requests.get(jwks_url, timeout=10)
            jwks_response.raise_for_status()
            jwks = jwks_response.json()
        except Exception:
            logger.error("Failed to fetch Auth0 signing keys")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='jwks_unavailable')
            raise exceptions.AuthenticationFailed(_('Failed to retrieve signing keys.'))

        # Get the unverified header to extract the key ID (kid)
        try:
            unverified_header = get_unverified_headers(token)
            key_id = unverified_header.get('kid')
            if not key_id:
                audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='missing_kid')
                raise exceptions.AuthenticationFailed(_('Token missing key ID.'))
        except exceptions.AuthenticationFailed:
            raise
        except Exception:
            logger.error("Failed to parse JWT header")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='invalid_header')
            raise exceptions.AuthenticationFailed(_('Invalid token header.'))

        # Find the matching key in JWKS
        signing_key = None
        for key in jwks.get('keys', []):
            if key.get('kid') == key_id:
                signing_key = key
                break

        if not signing_key:
            logger.error("JWT signing key was not found")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='signing_key_not_found')
            raise exceptions.AuthenticationFailed(_('Signing key not found.'))

        logger.debug("Successfully retrieved signing key from JWKS")

        # Read the issuer only to reject a missing claim with a precise audit
        # reason. Trust is established by the signed decode below.
        try:
            # python-jose requires a key argument when calling decode();
            # use get_unverified_headers + jwt.get_unverified_claims for unverified payload
            unverified_payload = jwt.get_unverified_claims(token)
            actual_issuer = unverified_payload.get('iss')
            logger.debug("Comparing JWT issuer against the configured issuer")
        except JWTError:
            logger.warning("Could not decode unverified JWT claims")
            actual_issuer = None
        except Exception:
            logger.warning("Unexpected failure while decoding unverified JWT claims")
            actual_issuer = None

        if not actual_issuer:
            logger.warning("JWT is missing the issuer claim")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='issuer_missing')
            raise exceptions.AuthenticationFailed(_('Invalid token issuer.'))

        if actual_issuer != issuer:
            logger.warning("JWT issuer validation failed")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='issuer_invalid')
            raise exceptions.AuthenticationFailed(_('Invalid token issuer.'))

        validation_options = {
            'verify_signature': True,
            'verify_exp': True,
            'verify_iat': True,
            'verify_iss': True,
            'verify_aud': True,
            'require_exp': True,
            'require_iat': True,
            'require_iss': True,
            'require_aud': True,
        }

        try:
            # Decode and validate the JWT
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=['RS256'],
                audience=audience,
                issuer=issuer,
                options=validation_options
            )

            logger.debug(f"JWT decoded successfully, payload keys: {list(payload.keys())}")
            return payload
        except exceptions.AuthenticationFailed:
            raise
        except ExpiredSignatureError:
            logger.warning("Expired JWT was rejected")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='expired')
            raise exceptions.AuthenticationFailed(_('Invalid token.'))
        except JWTClaimsError:
            logger.warning("JWT audience or claims validation failed")
            audit_event(
                'security.auth.jwt_invalid', 'denied', request=request,
                reason_code='audience_or_claims_invalid',
            )
            raise exceptions.AuthenticationFailed(_('Invalid token.'))
        except JWTError:
            logger.error("JWT signature validation failed")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='validation_failed')
            raise exceptions.AuthenticationFailed(_('Invalid token.'))
        except Exception:
            logger.error("Unexpected error during JWT validation")
            audit_event('security.auth.jwt_invalid', 'denied', request=request, reason_code='validation_failed')
            raise exceptions.AuthenticationFailed(_('Token validation failed.'))

    def _get_or_create_user_from_claims(self, claims, request=None):
        # Accounts and property access are provisioned by an administrator. Auth0
        # only proves ownership of an existing, verified email address; it must
        # never create an account or fall back to a potentially colliding username.
        claim_namespace = getattr(settings, 'AUTH0_CLAIM_NAMESPACE', 'https://hotelcarepro.com').rstrip('/')
        email = (
            claims.get(f'{claim_namespace}/email')
            or claims.get('email')
            or ''
        ).strip()
        email_verified = claims.get(f'{claim_namespace}/email_verified')
        if email_verified is None:
            # Temporary compatibility for tokens issued before namespaced claims
            # were added to the Auth0 Post Login Action.
            email_verified = claims.get('email_verified')
        logger.debug("Processing validated identity claims")

        if not email:
            logger.warning("Auth0 token is missing the email claim")
            audit_event('security.auth.user_mapping_failed', 'denied', request=request, reason_code='email_missing')
            raise exceptions.AuthenticationFailed(_('A verified email address is required.'))

        if email_verified is not True:
            logger.warning("Auth0 identity email is not verified")
            audit_event('security.auth.user_mapping_failed', 'denied', request=request, reason_code='email_unverified')
            raise exceptions.AuthenticationFailed(_('Email address is not verified.'))

        matching_users = User.objects.filter(email__iexact=email)
        match_count = matching_users.count()
        if match_count == 0:
            logger.warning("No pre-provisioned account found for Auth0 identity")
            audit_event('security.auth.user_mapping_failed', 'denied', request=request, reason_code='local_user_not_found')
            raise exceptions.AuthenticationFailed(
                _('No account is registered for this email address. Please contact an administrator.')
            )
        if match_count > 1:
            logger.error("Multiple local accounts match an Auth0 identity")
            audit_event('security.auth.user_mapping_failed', 'denied', request=request, reason_code='ambiguous_local_user')
            raise exceptions.AuthenticationFailed(
                _('Multiple accounts are registered for this email address. Please contact an administrator.')
            )

        user = matching_users.first()
        if not user.is_active:
            logger.warning("Inactive account attempted Auth0 login")
            audit_event(
                'security.auth.user_inactive', 'denied', request=request,
                reason_code='inactive_user', target_type='user', target_id=user.pk,
                target_user_id=user.pk,
            )
            raise exceptions.AuthenticationFailed(_('This account is inactive.'))

        logger.debug("Matched pre-provisioned user id=%s", user.pk)

        # Extract user profile information from JWT claims and available data
        # Since we can't use Management API without client_credentials grant type,
        # we'll use the data available in the JWT token and session
        logger.debug("Extracting permitted profile fields from validated claims")
        
        # Get profile information from JWT claims
        profile_updated = False
        
        # Extract email from claims if available
        if email and user.email != email:
            user.email = email
            profile_updated = True
            logger.debug("Updated email from validated identity claims")
        
        # Extract given_name (first name) from claims
        if claims.get('given_name') and user.first_name != claims['given_name']:
            user.first_name = claims['given_name'][:30]
            profile_updated = True
            logger.debug("Updated first name from validated identity claims")
        
        # Extract family_name (last name) from claims
        if claims.get('family_name') and user.last_name != claims['family_name']:
            user.last_name = claims['family_name'][:150]
            profile_updated = True
            logger.debug("Updated last name from validated identity claims")
        
        # Extract name (full name) and split if no given_name/family_name
        if claims.get('name') and not user.first_name and not user.last_name:
            name_parts = claims['name'].split(' ', 1)
            if len(name_parts) >= 2:
                user.first_name = name_parts[0][:30]
                user.last_name = name_parts[1][:150]
                profile_updated = True
                logger.debug("Updated name fields from validated identity claims")
            elif len(name_parts) == 1:
                user.first_name = name_parts[0][:30]
                profile_updated = True
                logger.debug("Updated first name from validated identity claims")
        
        # Extract nickname if no first name is available
        if claims.get('nickname') and not user.first_name:
            user.first_name = claims['nickname'][:30]
            profile_updated = True
            logger.debug("Updated first name from validated identity nickname")
        
        # Extract picture/profile image URL if available
        if claims.get('picture') and not hasattr(user, 'profile_image'):
            # Note: Django User model doesn't have profile_image by default
            # This would need a custom user model or profile model to store
            logger.debug("Profile image claim is available")
        
        # Save profile updates if any were made
        if profile_updated:
            user.save(update_fields=['email', 'first_name', 'last_name'])
            logger.info("Updated user id=%s profile from validated identity claims", user.pk)
        else:
            logger.debug("No profile updates needed for user id=%s", user.pk)
        
        # Log the final user profile state
        logger.debug("Finished validated identity profile update for user id=%s", user.pk)

        return user
