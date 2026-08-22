"""Canonical Pillow pipeline for maintenance job evidence images.

Animated inputs intentionally use their first frame.  Transparency is composited
onto white before JPEG encoding so transparent pixels never become black.
"""

from io import BytesIO
from hashlib import sha256

from PIL import Image, ImageOps


MAX_SIZE = (1600, 1600)
JPEG_QUALITY = 82
PM_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
PM_ALLOWED_FORMATS = {'JPEG', 'PNG', 'GIF', 'WEBP'}


class JobImageProcessingError(ValueError):
    """Raised when an upload cannot be decoded and safely converted."""


class PMImageValidationError(ValueError):
    """Raised when PM evidence fails byte, format, or decoding validation."""


def optimize_job_image(source, *, max_size=MAX_SIZE, quality=JPEG_QUALITY):
    """Return a seeked ``BytesIO`` containing one normalized JPEG."""
    try:
        if hasattr(source, "seek"):
            source.seek(0)
        with Image.open(source) as opened:
            opened.seek(0)  # Deliberately flatten animated GIF/WebP to frame zero.
            image = ImageOps.exif_transpose(opened)
            image.load()  # Decode now, before anything can be persisted.

        if image.width > max_size[0] or image.height > max_size[1]:
            image.thumbnail(max_size, Image.Resampling.LANCZOS)

        if image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        ):
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, "white")
            background.paste(rgba, mask=rgba.getchannel("A"))
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        output = BytesIO()
        image.save(output, "JPEG", quality=quality, optimize=True)
        output.seek(0)
        return output
    except Exception as exc:
        raise JobImageProcessingError(f"Unable to process job image: {exc}") from exc


def validate_and_optimize_pm_image(source):
    """Validate actual image bytes and return one optimized JPEG plus checksum."""
    size = getattr(source, 'size', None)
    if size == 0:
        raise PMImageValidationError('Empty image files are not allowed.')
    if size is not None and size > PM_MAX_UPLOAD_BYTES:
        raise PMImageValidationError('Each image must be 20 MB or smaller.')

    try:
        if hasattr(source, 'seek'):
            source.seek(0)
        with Image.open(source) as opened:
            detected_format = (opened.format or '').upper()
            if detected_format not in PM_ALLOWED_FORMATS:
                raise PMImageValidationError(
                    'Supported image formats are JPEG, PNG, GIF, and WebP.'
                )
            if Image.MAX_IMAGE_PIXELS and opened.width * opened.height > Image.MAX_IMAGE_PIXELS:
                raise PMImageValidationError(
                    'Image dimensions exceed the safe processing limit.'
                )
            opened.verify()
        if hasattr(source, 'seek'):
            source.seek(0)
        optimized = optimize_job_image(source)
    except PMImageValidationError:
        raise
    except Exception as exc:
        raise PMImageValidationError('One or more files are not valid images.') from exc

    payload = optimized.getvalue()
    return payload, sha256(payload).hexdigest()
