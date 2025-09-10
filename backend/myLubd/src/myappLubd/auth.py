import logging
import requests
import base64
import json
from django.contrib.auth.models import User
from django.conf import settings
from rest_framework import authentication, exceptions
from rest_framework.authentication import get_authorization_header
from django.utils.translation import gettext_lazy as _
from jose import jwt, JWTError
from jose.jwt import get_unverified_headers

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
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header. No credentials provided.'))
        elif len(auth) > 2:
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header.'))

        token = auth[1].decode('utf-8')
        logger.debug(f"Received JWT token: {token[:20]}...")

        try:
            payload = self._validate_auth0_token(token)
            logger.debug(f"JWT validation successful, payload: {payload}")
        except exceptions.AuthenticationFailed:
            # Propagate DRF-friendly exceptions
            logger.warning("JWT validation failed with AuthenticationFailed")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during JWT validation: {e}")
            raise exceptions.AuthenticationFailed(_('Invalid token.'))

        user = self._get_or_create_user_from_claims(payload)
        logger.debug(f"User authenticated: {user.username}")
        return (user, None)

    def authenticate_header(self, request):
        return 'Bearer realm="%s"' % self.www_authenticate_realm

    def _validate_auth0_token(self, token):
        domain = settings.AUTH0_DOMAIN  # ensured present in authenticate()
        issuer = getattr(settings, 'AUTH0_ISSUER', None) or f"https://{domain}/"
        audience = getattr(settings, 'AUTH0_AUDIENCE', None)

        logger.debug(f"Validating token with domain: {domain}, issuer: {issuer}, audience: {audience}")

        # Get the JWKS (JSON Web Key Set) from Auth0
        jwks_url = f"https://{domain}/.well-known/jwks.json"
        logger.debug(f"Fetching JWKS from: {jwks_url}")
        
        try:
            jwks_response = requests.get(jwks_url, timeout=10)
            jwks_response.raise_for_status()
            jwks = jwks_response.json()
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            raise exceptions.AuthenticationFailed(_('Failed to retrieve signing keys.'))

        # Get the unverified header to extract the key ID (kid)
        try:
            unverified_header = get_unverified_headers(token)
            key_id = unverified_header.get('kid')
            if not key_id:
                raise exceptions.AuthenticationFailed(_('Token missing key ID.'))
        except Exception as e:
            logger.error(f"Failed to get token header: {e}")
            raise exceptions.AuthenticationFailed(_('Invalid token header.'))

        # Find the matching key in JWKS
        signing_key = None
        for key in jwks.get('keys', []):
            if key.get('kid') == key_id:
                signing_key = key
                break

        if not signing_key:
            logger.error(f"Signing key not found for kid: {key_id}")
            raise exceptions.AuthenticationFailed(_('Signing key not found.'))

        logger.debug("Successfully retrieved signing key from JWKS")

        # First, decode without verification to see the actual issuer
        try:
            # Manually decode payload without verifying signature
            # This avoids any library-level decode() calls that require a key
            unverified_payload = self._decode_unverified_payload(token)
            actual_issuer = unverified_payload.get('iss')
            logger.debug(f"Token issuer: {actual_issuer}, Expected issuer: {issuer}")
        except JWTError as e:
            logger.warning(f"Could not decode unverified payload (JWT Error): {e}")
            actual_issuer = None
        except Exception as e:
            logger.warning(f"Could not decode unverified payload (Unexpected error): {type(e).__name__}: {e}")
            actual_issuer = None

        # Prepare validation options - be more flexible with issuer validation
        validation_options = {
            'verify_signature': True,
            'verify_exp': True,
            'verify_iat': True,
            'verify_iss': False,  # We'll handle issuer validation manually
            'verify_aud': bool(audience),
        }

        try:
            # Decode and validate the JWT
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=['RS256'],
                audience=audience,
                options=validation_options
            )
            
            # Manual issuer validation with flexibility for trailing slashes
            if actual_issuer:
                # Normalize both issuers by removing trailing slashes
                normalized_actual = actual_issuer.rstrip('/')
                normalized_expected = issuer.rstrip('/')
                
                if normalized_actual != normalized_expected:
                    logger.warning(f"Issuer mismatch: {normalized_actual} != {normalized_expected}")
                    raise exceptions.AuthenticationFailed(_('Invalid token issuer.'))
                else:
                    logger.debug("Issuer validation successful")
            
            logger.debug(f"JWT decoded successfully, payload keys: {list(payload.keys())}")
            return payload
        except JWTError as e:
            logger.error(f"JWT validation error: {e}")
            raise exceptions.AuthenticationFailed(_('Invalid token.'))
        except Exception as e:
            logger.error(f"Unexpected error during JWT validation: {e}")
            raise exceptions.AuthenticationFailed(_('Token validation failed.'))

    @staticmethod
    def _decode_unverified_payload(token: str) -> dict:
        """
        Decode the JWT payload without verifying the signature.
        Safe for reading public claims like issuer (iss) and audience (aud).
        """
        parts = token.split('.')
        if len(parts) != 3:
            raise exceptions.AuthenticationFailed(_('Invalid token format.'))

        payload_segment = parts[1]
        # Pad base64 string to correct length (multiple of 4)
        padding = '=' * (-len(payload_segment) % 4)
        try:
            decoded_bytes = base64.urlsafe_b64decode(payload_segment + padding)
            decoded_str = decoded_bytes.decode('utf-8')
            return json.loads(decoded_str)
        except Exception as exc:
            raise exceptions.AuthenticationFailed(_('Invalid token payload.')) from exc

    def _get_or_create_user_from_claims(self, claims):
        # Prefer email for identity when available; fallback to sub
        email = claims.get('email')
        sub = claims.get('sub') or ''

        logger.debug(f"Processing claims for email: {email}, sub: {sub}")

        # Build a deterministic username from email or sub
        if email:
            base_username = email.split('@')[0]
        else:
            base_username = sub.replace('|', '_') or 'auth0_user'

        username = base_username[:150]  # Django's default max_length for username

        user = None

        if email:
            user = User.objects.filter(email__iexact=email).first()
            logger.debug(f"Found user by email: {user}")

        if not user:
            # Try match by a sanitized version of sub stored as username
            user = User.objects.filter(username=username).first()
            logger.debug(f"Found user by username: {user}")

        if not user:
            # Create a new local user
            first_name = claims.get('given_name', '')
            last_name = claims.get('family_name', '')
            user = User.objects.create(
                username=username,
                email=email or '',
                first_name=first_name[:30],
                last_name=last_name[:150],
                is_active=True,
            )
            logger.info(f"Created new user: {username}")

        # Extract user profile information from JWT claims and available data
        # Since we can't use Management API without client_credentials grant type,
        # we'll use the data available in the JWT token and session
        logger.debug(f"Extracting user profile from available claims for sub: {sub}")
        
        # Get profile information from JWT claims
        profile_updated = False
        
        # Extract email from claims if available
        if claims.get('email') and user.email != claims['email']:
            user.email = claims['email']
            profile_updated = True
            logger.debug(f"Updated email from JWT claims: {claims['email']}")
        
        # Extract given_name (first name) from claims
        if claims.get('given_name') and user.first_name != claims['given_name']:
            user.first_name = claims['given_name'][:30]
            profile_updated = True
            logger.debug(f"Updated first_name from JWT claims: {claims['given_name']}")
        
        # Extract family_name (last name) from claims
        if claims.get('family_name') and user.last_name != claims['family_name']:
            user.last_name = claims['family_name'][:150]
            profile_updated = True
            logger.debug(f"Updated last_name from JWT claims: {claims['family_name']}")
        
        # Extract name (full name) and split if no given_name/family_name
        if claims.get('name') and not user.first_name and not user.last_name:
            name_parts = claims['name'].split(' ', 1)
            if len(name_parts) >= 2:
                user.first_name = name_parts[0][:30]
                user.last_name = name_parts[1][:150]
                profile_updated = True
                logger.debug(f"Updated name from JWT claims: {claims['name']} -> first: {user.first_name}, last: {user.last_name}")
            elif len(name_parts) == 1:
                user.first_name = name_parts[0][:30]
                profile_updated = True
                logger.debug(f"Updated first_name from JWT claims (single name): {name_parts[0]}")
        
        # Extract nickname if no first name is available
        if claims.get('nickname') and not user.first_name:
            user.first_name = claims['nickname'][:30]
            profile_updated = True
            logger.debug(f"Updated first_name from nickname: {claims['nickname']}")
        
        # Extract picture/profile image URL if available
        if claims.get('picture') and not hasattr(user, 'profile_image'):
            # Note: Django User model doesn't have profile_image by default
            # This would need a custom user model or profile model to store
            logger.debug(f"Profile image available in claims: {claims['picture']}")
        
        # Save profile updates if any were made
        if profile_updated:
            user.save(update_fields=['email', 'first_name', 'last_name'])
            logger.info(f"Updated user {username} profile from JWT claims: email={user.email}, first_name={user.first_name}, last_name={user.last_name}")
        else:
            logger.debug(f"No profile updates needed for user {username}")
        
        # Log the final user profile state
        logger.debug(f"Final user profile for {username}: email={user.email}, first_name={user.first_name}, last_name={user.last_name}")

        return user

