from typing import Optional, Tuple

from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from django.conf import settings

from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework import exceptions

import jwt
from jwt import PyJWKClient
import logging

logger = logging.getLogger(__name__)
User = get_user_model()




class Auth0JWTAuthentication(BaseAuthentication):
    """
    DRF authentication class that validates Auth0-issued JWT access tokens (RS256)
    and maps them to a local Django user. If a matching user does not exist,
    it will be created on the fly using claims from the token.

    Configuration (in Django settings):
      AUTH0_DOMAIN   e.g. "your-tenant.us.auth0.com"
      AUTH0_AUDIENCE e.g. "https://your-api-identifier" (optional – if unset, audience verification is disabled)
      AUTH0_ISSUER   e.g. "https://your-tenant.us.auth0.com/" (optional – defaults to https://{AUTH0_DOMAIN}/)
    """

    www_authenticate_realm = 'api'

    def authenticate(self, request):
        # If Auth0 is not configured, skip and allow other authenticators to try
        domain = getattr(settings, 'AUTH0_DOMAIN', None)
        if not domain:
            return None

        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != b'bearer':
            return None

        if len(auth) == 1:
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header. No credentials provided.'))
        elif len(auth) > 2:
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header.'))

        token = auth[1].decode('utf-8')

        try:
            payload = self._validate_auth0_token(token)
        except exceptions.AuthenticationFailed:
            # Propagate DRF-friendly exceptions
            raise
        except Exception:
            raise exceptions.AuthenticationFailed(_('Invalid token.'))

        user = self._get_or_create_user_from_claims(payload)
        return (user, None)

    def authenticate_header(self, request):
        return 'Bearer realm="%s"' % self.www_authenticate_realm

    def _validate_auth0_token(self, token):
        domain = settings.AUTH0_DOMAIN  # ensured present in authenticate()
        issuer = getattr(settings, 'AUTH0_ISSUER', None) or f"https://{domain}/"
        audience = getattr(settings, 'AUTH0_AUDIENCE', None)

        jwks_url = f"https://{domain}/.well-known/jwks.json"
        jwk_client = PyJWKClient(jwks_url)

        # Get signing key for this specific token (uses kid header)
        signing_key = jwk_client.get_signing_key_from_jwt(token).key

        decode_kwargs = {
            'key': signing_key,
            'algorithms': ['RS256'],
            'issuer': issuer,
        }

        # Only verify audience if configured
        if audience:
            decode_kwargs['audience'] = audience
            options = {"verify_aud": True}
        else:
            options = {"verify_aud": False}

        try:
            payload = jwt.decode(token, options=options, **decode_kwargs)
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed(_('Token has expired.'))
        except jwt.InvalidIssuerError:
            raise exceptions.AuthenticationFailed(_('Invalid token issuer.'))
        except jwt.InvalidAudienceError:
            raise exceptions.AuthenticationFailed(_('Invalid token audience.'))
        except jwt.PyJWTError:
            raise exceptions.AuthenticationFailed(_('Invalid token.'))

        return payload

    def _get_or_create_user_from_claims(self, claims):
        # Prefer email for identity when available; fallback to sub
        email = claims.get('email')
        sub = claims.get('sub') or ''

        # Build a deterministic username from email or sub
        if email:
            base_username = email.split('@')[0]
        else:
            base_username = sub.replace('|', '_') or 'auth0_user'

        username = base_username[:150]  # Django's default max_length for username

        user = None

        if email:
            user = User.objects.filter(email__iexact=email).first()

        if not user:
            # Try match by a sanitized version of sub stored as username
            user = User.objects.filter(username=username).first()

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

        # Optionally update basic fields if provided
        updated = False
        if email and user.email != email:
            user.email = email
            updated = True
        if claims.get('given_name') and user.first_name != claims.get('given_name'):
            user.first_name = claims['given_name'][:30]
            updated = True
        if claims.get('family_name') and user.last_name != claims.get('family_name'):
            user.last_name = claims['family_name'][:150]
            updated = True
        if updated:
            user.save(update_fields=['email', 'first_name', 'last_name'])

        return user

