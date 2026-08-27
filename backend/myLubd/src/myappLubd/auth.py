import logging
import requests
from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import AuthIdentity

User = get_user_model()
from rest_framework import authentication, exceptions
from rest_framework.authentication import get_authorization_header
from django.utils.translation import gettext_lazy as _
from jose import jwt, JWTError
from jose.jwt import get_unverified_headers

logger = logging.getLogger(__name__)




class Auth0JWTAuthentication(authentication.BaseAuthentication):
    """
    Auth0 JWT authentication backend for Django REST Framework.
    Validates JWT tokens from Auth0 and resolves pre-provisioned local accounts.
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

        try:
            token = auth[1].decode('utf-8')
        except UnicodeDecodeError:
            raise exceptions.AuthenticationFailed(_('Invalid Authorization header.'))

        try:
            payload = self._validate_auth0_token(token)
            logger.debug("JWT validation successful")
        except exceptions.AuthenticationFailed:
            # Propagate DRF-friendly exceptions
            logger.warning("JWT validation failed with AuthenticationFailed")
            raise
        except Exception:
            logger.error("Unexpected error during JWT validation")
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

        if not audience:
            logger.error("Auth0 audience is not configured")
            raise exceptions.AuthenticationFailed(_('Token audience validation is unavailable.'))

        logger.debug("Validating JWT against configured Auth0 issuer and audience")

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
            raise exceptions.AuthenticationFailed(_('Invalid token issuer.'))

        if actual_issuer != issuer:
            logger.warning("JWT issuer validation failed")
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
            logger.debug("JWT decoded successfully")
            return payload
        except JWTError:
            logger.error("JWT validation failed")
            raise exceptions.AuthenticationFailed(_('Invalid token.'))
        except Exception:
            logger.error("Unexpected error during JWT validation")
            raise exceptions.AuthenticationFailed(_('Token validation failed.'))

    def _get_or_create_user_from_claims(self, claims):
        """Resolve an Auth0 principal without creating or merging Django users."""
        claim_namespace = getattr(settings, 'AUTH0_CLAIM_NAMESPACE', 'https://hotelcarepro.com').rstrip('/')
        issuer = self._nonempty_string(claims.get('iss'))
        subject = self._nonempty_string(claims.get('sub'))
        raw_email = (
            claims.get(f'{claim_namespace}/email')
            or claims.get('email')
            or ''
        )
        email = self._normalize_email(raw_email)
        email_verified = claims.get(f'{claim_namespace}/email_verified')
        if email_verified is None:
            # Temporary compatibility for tokens issued before namespaced claims
            # were added to the Auth0 Post Login Action.
            email_verified = claims.get('email_verified')

        if not issuer:
            logger.warning("Validated Auth0 token is missing its issuer")
            raise exceptions.AuthenticationFailed(_('Token issuer is required.'))
        if not subject:
            logger.warning("Auth0 token is missing its subject")
            raise exceptions.AuthenticationFailed(_('Token subject is required.'))

        identity = self._load_identity(issuer, subject)
        if identity is not None:
            return self._resolve_bound_identity(identity, email)

        return self._link_preprovisioned_user(
            issuer=issuer,
            subject=subject,
            email=email,
            email_verified=email_verified,
        )

    @staticmethod
    def _nonempty_string(value):
        return value.strip() if isinstance(value, str) else ''

    @staticmethod
    def _normalize_email(value):
        if not isinstance(value, str):
            return ''
        return User.objects.normalize_email(value.strip())

    @staticmethod
    def _load_identity(issuer, subject):
        return (
            AuthIdentity.objects.select_related('user')
            .filter(issuer=issuer, subject=subject)
            .first()
        )

    def _resolve_bound_identity(self, identity, presented_email=''):
        user = identity.user
        if not user.is_active:
            logger.warning("Inactive account attempted Auth0 login through an existing identity")
            raise exceptions.AuthenticationFailed(_('This account is inactive.'))

        if (
            presented_email
            and user.email
            and presented_email.casefold() != user.email.strip().casefold()
        ):
            logger.info("Auth0 identity presented a changed email; existing binding retained")

        now = timezone.now()
        AuthIdentity.objects.filter(pk=identity.pk).update(last_seen_at=now)
        identity.last_seen_at = now
        logger.debug("Resolved Auth0 principal through an existing identity binding")
        return user

    def _link_preprovisioned_user(self, *, issuer, subject, email, email_verified):
        if not email:
            logger.warning("Unlinked Auth0 identity is missing the email claim")
            raise exceptions.AuthenticationFailed(_('A verified email address is required.'))
        if email_verified is not True:
            logger.warning("Unlinked Auth0 identity did not present a verified email")
            raise exceptions.AuthenticationFailed(_('Email address is not verified.'))

        try:
            with transaction.atomic():
                matching_users = list(
                    User.objects.select_for_update()
                    .filter(email__iexact=email)
                    .order_by('pk')[:2]
                )
                if not matching_users:
                    logger.warning("No pre-provisioned account matched an Auth0 email")
                    raise exceptions.AuthenticationFailed(
                        _('No account is registered for this email address. Please contact an administrator.')
                    )
                if len(matching_users) > 1:
                    logger.error("Multiple local accounts matched an Auth0 email")
                    raise exceptions.AuthenticationFailed(
                        _('Multiple accounts are registered for this email address. Please contact an administrator.')
                    )

                user = matching_users[0]
                candidate_user_id = user.pk
                if not user.is_active:
                    logger.warning("Inactive account attempted initial Auth0 identity linking")
                    raise exceptions.AuthenticationFailed(_('This account is inactive.'))

                AuthIdentity.objects.create(
                    user=user,
                    issuer=issuer,
                    subject=subject,
                    email_at_link=email,
                    last_seen_at=timezone.now(),
                )
        except IntegrityError:
            # A concurrent first login may have created the same binding. The
            # unique constraint decides the winner; always reload its user.
            identity = self._load_identity(issuer, subject)
            if identity is None:
                raise
            if identity.user_id != candidate_user_id:
                logger.error("Auth0 identity race resolved to a different user; rejecting login")
                raise exceptions.AuthenticationFailed(_('Identity binding conflict.'))
            logger.info("Resolved concurrent Auth0 identity linking race")

        # Re-read the database binding even after our insert. It is the sole
        # authority after a first-link race, never the email candidate above.
        identity = self._load_identity(issuer, subject)
        if identity is None:
            logger.error("Auth0 identity binding was not available after linking")
            raise exceptions.AuthenticationFailed(_('Identity linking failed.'))
        return self._resolve_bound_identity(identity, email)
