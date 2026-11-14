"""Content versions for custom admin assets cached by browsers and the CDN."""
from functools import lru_cache
from hashlib import sha256
from pathlib import Path

from django import template
from django.contrib.staticfiles import finders
from django.templatetags.static import static

register = template.Library()


@register.simple_tag
@lru_cache(maxsize=32)
def admin_asset(path):
    url = static(path)
    source = finders.find(path)
    if not source:
        return url
    version = sha256(Path(source).read_bytes()).hexdigest()[:12]
    separator = '&' if '?' in url else '?'
    return f'{url}{separator}v={version}'
