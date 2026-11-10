"""Job Images definitions."""
from rest_framework import serializers
from ..models import JobImage
from django.core.files.storage import default_storage
from django.conf import settings
from pathlib import Path


def _build_media_absolute_uri(request, media_path):
    """Build a stable media URL from paths stored by FileField or helper fields.

    Admin-created records and older conversion jobs can store a mix of values:
    FileField names, /media/ URLs, absolute backend URLs, or absolute filesystem
    paths. Normalize those values before exposing them to the frontend.
    """
    if not media_path:
        return None

    value = str(media_path).strip()
    if not value:
        return None

    if value.startswith(('http://', 'https://')):
        return value

    media_url = getattr(settings, 'MEDIA_URL', '/media/') or '/media/'
    if not media_url.startswith('/'):
        media_url = f'/{media_url}'
    if not media_url.endswith('/'):
        media_url = f'{media_url}/'

    media_root = str(getattr(settings, 'MEDIA_ROOT', '') or '')
    if media_root and value.startswith(media_root):
        value = value[len(media_root):].lstrip('/\\')

    # Collapse common bad persisted forms such as /media/media/foo.jpg.
    while value.startswith(media_url):
        value = value[len(media_url):]
    value = value.lstrip('/\\')

    url_path = f'{media_url}{value}'
    if request:
        try:
            return request.build_absolute_uri(url_path)
        except Exception:
            return url_path
    return url_path


class JobImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    jpeg_url = serializers.SerializerMethodField()

    class Meta:
        model = JobImage
        fields = ['id', 'image_url', 'jpeg_url', 'image_type', 'uploaded_by', 'uploaded_at']

    def get_image_url(self, obj):
        """Return the URL for the original uploaded image."""
        if obj.image:
            request = self.context.get('request')
            return _build_media_absolute_uri(request, getattr(obj.image, 'url', obj.image.name))
        return None

    def get_jpeg_url(self, obj):
        """Return the URL for the JPEG-converted image when available."""
        jpeg_path = getattr(obj, 'jpeg_path', None)
        if not jpeg_path:
            return None

        jp = str(jpeg_path)
        if '/' not in jp and getattr(obj, 'image', None):
            # Backward-compat: only a filename was stored; infer its directory
            # from the original image path.
            try:
                image_name = getattr(obj.image, 'name', '')
                parent = str(Path(image_name).parent)
                if parent and parent != '.':
                    jp = str(Path(parent) / jp)
            except Exception:
                pass

        # Old rows can contain template fragments such as %Y/%m or a JPEG
        # filename that was never written. Do not expose a URL that is known to
        # return 404; consumers can fall back to image_url instead.
        normalized_path = jp.lstrip('/\\')
        media_prefix = (getattr(settings, 'MEDIA_URL', '/media/') or '/media/').strip('/')
        if media_prefix and normalized_path.startswith(f'{media_prefix}/'):
            normalized_path = normalized_path[len(media_prefix) + 1:]
        try:
            if '%' in normalized_path or not default_storage.exists(normalized_path):
                return None
        except Exception:
            # Remote/custom storage may not support an existence check.
            pass

        request = self.context.get('request')
        return _build_media_absolute_uri(request, normalized_path)
