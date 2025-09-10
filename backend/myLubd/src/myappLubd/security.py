"""
Enhanced security configuration and utilities
"""
import os
import secrets
import hashlib
import hmac
from typing import Dict, Any, Optional
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.http import HttpRequest
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


class SecurityConfig:
    """
    Security configuration and validation
    """
    
    # Rate limiting settings
    RATE_LIMIT_REQUESTS = 100  # requests per window
    RATE_LIMIT_WINDOW = 3600   # seconds (1 hour)
    
    # Password requirements
    MIN_PASSWORD_LENGTH = 8
    PASSWORD_REQUIREMENTS = {
        'min_length': MIN_PASSWORD_LENGTH,
        'require_uppercase': True,
        'require_lowercase': True,
        'require_numbers': True,
        'require_special_chars': True
    }
    
    # Session security
    SESSION_TIMEOUT = 1800  # 30 minutes
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_DURATION = 900  # 15 minutes
    
    @classmethod
    def validate_password(cls, password: str) -> Dict[str, Any]:
        """
        Validate password strength
        """
        errors = []
        
        if len(password) < cls.MIN_PASSWORD_LENGTH:
            errors.append(f"Password must be at least {cls.MIN_PASSWORD_LENGTH} characters long")
        
        if cls.PASSWORD_REQUIREMENTS['require_uppercase'] and not any(c.isupper() for c in password):
            errors.append("Password must contain at least one uppercase letter")
        
        if cls.PASSWORD_REQUIREMENTS['require_lowercase'] and not any(c.islower() for c in password):
            errors.append("Password must contain at least one lowercase letter")
        
        if cls.PASSWORD_REQUIREMENTS['require_numbers'] and not any(c.isdigit() for c in password):
            errors.append("Password must contain at least one number")
        
        if cls.PASSWORD_REQUIREMENTS['require_special_chars'] and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
            errors.append("Password must contain at least one special character")
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors
        }
    
    @classmethod
    def generate_secure_token(cls, length: int = 32) -> str:
        """
        Generate a cryptographically secure token
        """
        return secrets.token_urlsafe(length)
    
    @classmethod
    def hash_sensitive_data(cls, data: str) -> str:
        """
        Hash sensitive data using HMAC
        """
        secret_key = settings.SECRET_KEY.encode()
        return hmac.new(secret_key, data.encode(), hashlib.sha256).hexdigest()


class RateLimiter:
    """
    Rate limiting implementation
    """
    
    @staticmethod
    def is_rate_limited(request: HttpRequest, identifier: str = None) -> bool:
        """
        Check if request is rate limited
        """
        if not identifier:
            identifier = request.META.get('REMOTE_ADDR', 'unknown')
        
        cache_key = f"rate_limit:{identifier}"
        current_requests = cache.get(cache_key, 0)
        
        if current_requests >= SecurityConfig.RATE_LIMIT_REQUESTS:
            logger.warning(f"Rate limit exceeded for {identifier}")
            return True
        
        # Increment counter
        cache.set(cache_key, current_requests + 1, SecurityConfig.RATE_LIMIT_WINDOW)
        return False
    
    @staticmethod
    def get_remaining_requests(request: HttpRequest, identifier: str = None) -> int:
        """
        Get remaining requests for the current window
        """
        if not identifier:
            identifier = request.META.get('REMOTE_ADDR', 'unknown')
        
        cache_key = f"rate_limit:{identifier}"
        current_requests = cache.get(cache_key, 0)
        
        return max(0, SecurityConfig.RATE_LIMIT_REQUESTS - current_requests)


class LoginSecurity:
    """
    Login security and brute force protection
    """
    
    @staticmethod
    def record_login_attempt(identifier: str, success: bool) -> None:
        """
        Record a login attempt
        """
        cache_key = f"login_attempts:{identifier}"
        attempts = cache.get(cache_key, [])
        
        attempts.append({
            'timestamp': timezone.now().isoformat(),
            'success': success
        })
        
        # Keep only recent attempts
        cutoff_time = timezone.now() - timezone.timedelta(seconds=SecurityConfig.LOCKOUT_DURATION)
        attempts = [a for a in attempts if timezone.datetime.fromisoformat(a['timestamp']) > cutoff_time]
        
        cache.set(cache_key, attempts, SecurityConfig.LOCKOUT_DURATION)
    
    @staticmethod
    def is_account_locked(identifier: str) -> bool:
        """
        Check if account is locked due to too many failed attempts
        """
        cache_key = f"login_attempts:{identifier}"
        attempts = cache.get(cache_key, [])
        
        # Count failed attempts in the last lockout duration
        cutoff_time = timezone.now() - timezone.timedelta(seconds=SecurityConfig.LOCKOUT_DURATION)
        recent_failed = [
            a for a in attempts 
            if not a['success'] and timezone.datetime.fromisoformat(a['timestamp']) > cutoff_time
        ]
        
        return len(recent_failed) >= SecurityConfig.MAX_LOGIN_ATTEMPTS
    
    @staticmethod
    def get_lockout_time_remaining(identifier: str) -> int:
        """
        Get remaining lockout time in seconds
        """
        if not LoginSecurity.is_account_locked(identifier):
            return 0
        
        cache_key = f"login_attempts:{identifier}"
        attempts = cache.get(cache_key, [])
        
        if not attempts:
            return 0
        
        # Find the oldest failed attempt
        failed_attempts = [a for a in attempts if not a['success']]
        if not failed_attempts:
            return 0
        
        oldest_attempt = min(failed_attempts, key=lambda x: x['timestamp'])
        attempt_time = timezone.datetime.fromisoformat(oldest_attempt['timestamp'])
        lockout_end = attempt_time + timezone.timedelta(seconds=SecurityConfig.LOCKOUT_DURATION)
        
        remaining = (lockout_end - timezone.now()).total_seconds()
        return max(0, int(remaining))


class InputValidator:
    """
    Input validation and sanitization
    """
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """
        Validate email format
        """
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    @staticmethod
    def sanitize_string(value: str, max_length: int = 255) -> str:
        """
        Sanitize string input
        """
        if not isinstance(value, str):
            return str(value)
        
        # Remove potentially dangerous characters
        sanitized = value.strip()
        
        # Limit length
        if len(sanitized) > max_length:
            sanitized = sanitized[:max_length]
        
        return sanitized
    
    @staticmethod
    def validate_file_upload(file, allowed_extensions: list = None, max_size: int = 5 * 1024 * 1024) -> Dict[str, Any]:
        """
        Validate file upload
        """
        errors = []
        
        if not file:
            errors.append("No file provided")
            return {'is_valid': False, 'errors': errors}
        
        # Check file size
        if file.size > max_size:
            errors.append(f"File size exceeds maximum allowed size of {max_size / (1024*1024):.1f}MB")
        
        # Check file extension
        if allowed_extensions:
            file_extension = file.name.split('.')[-1].lower()
            if file_extension not in allowed_extensions:
                errors.append(f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}")
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors
        }


class CSRFProtection:
    """
    Enhanced CSRF protection
    """
    
    @staticmethod
    def generate_csrf_token(request: HttpRequest) -> str:
        """
        Generate a CSRF token
        """
        from django.middleware.csrf import get_token
        return get_token(request)
    
    @staticmethod
    def validate_csrf_token(request: HttpRequest, token: str) -> bool:
        """
        Validate CSRF token
        """
        from django.middleware.csrf import _compare_masked_tokens
        from django.middleware.csrf import _get_new_csrf_token
        
        if not token:
            return False
        
        # Get the CSRF token from the request
        csrf_token = request.META.get('CSRF_COOKIE')
        if not csrf_token:
            csrf_token = _get_new_csrf_token()
        
        return _compare_masked_tokens(token, csrf_token)


class SecurityHeaders:
    """
    Security headers configuration
    """
    
    @staticmethod
    def get_security_headers() -> Dict[str, str]:
        """
        Get security headers for responses
        """
        return {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
        }
    
    @staticmethod
    def add_security_headers(response) -> None:
        """
        Add security headers to response
        """
        headers = SecurityHeaders.get_security_headers()
        for header, value in headers.items():
            response[header] = value


class AuditLogger:
    """
    Security audit logging
    """
    
    @staticmethod
    def log_security_event(event_type: str, user: User = None, details: Dict[str, Any] = None) -> None:
        """
        Log security events
        """
        log_data = {
            'event_type': event_type,
            'timestamp': timezone.now().isoformat(),
            'user_id': user.id if user else None,
            'username': user.username if user else None,
            'details': details or {}
        }
        
        logger.warning(f"SECURITY_EVENT: {log_data}")
    
    @staticmethod
    def log_failed_login(identifier: str, reason: str) -> None:
        """
        Log failed login attempt
        """
        AuditLogger.log_security_event(
            'failed_login',
            details={
                'identifier': identifier,
                'reason': reason,
                'ip_address': 'unknown'  # Would need request context
            }
        )
    
    @staticmethod
    def log_suspicious_activity(user: User, activity: str, details: Dict[str, Any] = None) -> None:
        """
        Log suspicious activity
        """
        AuditLogger.log_security_event(
            'suspicious_activity',
            user=user,
            details={
                'activity': activity,
                'additional_info': details or {}
            }
        )


class DataEncryption:
    """
    Data encryption utilities
    """
    
    @staticmethod
    def encrypt_sensitive_data(data: str) -> str:
        """
        Encrypt sensitive data (placeholder implementation)
        """
        # In production, use proper encryption like Fernet
        import base64
        return base64.b64encode(data.encode()).decode()
    
    @staticmethod
    def decrypt_sensitive_data(encrypted_data: str) -> str:
        """
        Decrypt sensitive data (placeholder implementation)
        """
        import base64
        return base64.b64decode(encrypted_data.encode()).decode()
    
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash password using Django's built-in hashing
        """
        from django.contrib.auth.hashers import make_password
        return make_password(password)
    
    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """
        Verify password against hash
        """
        from django.contrib.auth.hashers import check_password
        return check_password(password, hashed)
