import os
from urllib.parse import quote

from django.core.exceptions import ImproperlyConfigured

# Debug
DEBUG = os.getenv('DEBUG', 'False') == 'True'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'DEBUG' if DEBUG else 'WARNING',
    },
    'django': {
        'handlers': ['console'],
        'level': 'DEBUG' if DEBUG else 'ERROR',
        'propagate': False,
    },
}

# Email configuration
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False') == 'True'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'no-reply@hotelcarepro.com')
SERVER_EMAIL = os.getenv('SERVER_EMAIL', DEFAULT_FROM_EMAIL)

# URL used in emails to point users back to the frontend
FRONTEND_BASE_URL = os.getenv('FRONTEND_BASE_URL', os.getenv('NEXT_PUBLIC_API_URL', 'http://localhost:3000'))

# Redis authentication is mandatory when this legacy settings module is used.
_INSECURE_REDIS_PASSWORDS = {
    'admin',
    'changeme',
    'default',
    'password',
    'redis',
    'secret',
}
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
if not REDIS_PASSWORD:
    raise ImproperlyConfigured('REDIS_PASSWORD must be configured.')
if REDIS_PASSWORD.casefold() in _INSECURE_REDIS_PASSWORDS:
    raise ImproperlyConfigured(
        'REDIS_PASSWORD must not use a predictable value.'
    )
if len(REDIS_PASSWORD) < 16:
    raise ImproperlyConfigured(
        'REDIS_PASSWORD must contain at least 16 characters.'
    )
if not all(
    (character.isascii() and character.isalnum()) or character in '._~-'
    for character in REDIS_PASSWORD
):
    raise ImproperlyConfigured(
        'REDIS_PASSWORD must contain only URL-safe characters.'
    )
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost' if DEBUG else 'redis')
REDIS_PORT = os.getenv('REDIS_PORT', '6379')
REDIS_DB = os.getenv('REDIS_DB', '1')
REDIS_URL = (
    f"redis://:{quote(REDIS_PASSWORD, safe='')}@"
    f'{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}'
)

# ✅ PERFORMANCE OPTIMIZATION: Caching Configuration
# Redis cache configuration for improved performance
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
        'KEY_PREFIX': 'pcms',
        'TIMEOUT': 300,  # 5 minutes default
    }
}

# Cache TTL settings for different data types
CACHE_TTL = {
    'jobs_list': 300,      # 5 minutes
    'properties': 600,     # 10 minutes
    'topics': 1800,        # 30 minutes
    'users': 900,          # 15 minutes
    'rooms': 1200,         # 20 minutes
}

# This legacy settings module is not used by Compose, but it must still fail
# closed if selected directly instead of reviving its former "postgres" default.
_INSECURE_DATABASE_PASSWORDS = {
    'admin',
    'changeme',
    'default',
    'mylubd_password',
    'password',
    'postgres',
    'secret',
}
_configured_database_password = (
    os.getenv('POSTGRES_PASSWORD') or os.getenv('DB_PASSWORD')
)

if not _configured_database_password:
    raise ImproperlyConfigured(
        'POSTGRES_PASSWORD (or DB_PASSWORD for this legacy settings module) must be configured.'
    )

if (
    _configured_database_password.strip().casefold()
    in _INSECURE_DATABASE_PASSWORDS
):
    raise ImproperlyConfigured(
        'The database password must not use a predictable default.'
    )

# Database connection pooling for better performance
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'mylubd'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': _configured_database_password,
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'OPTIONS': {
            'MAX_CONNS': 20,
            'MIN_CONNS': 5,
            'CONN_MAX_AGE': 600,  # 10 minutes connection pooling
        },
    }
}

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Bangkok'
USE_I18N = True
USE_TZ = True
