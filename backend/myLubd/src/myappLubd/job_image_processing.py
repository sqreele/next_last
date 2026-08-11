"""Canonical Pillow pipeline for maintenance job evidence images.

Animated inputs intentionally use their first frame.  Transparency is composited
onto white before JPEG encoding so transparent pixels never become black.
"""

from io import BytesIO

from PIL import Image, ImageOps


MAX_SIZE = (1600, 1600)
JPEG_QUALITY = 82


class JobImageProcessingError(ValueError):
    """Raised when an upload cannot be decoded and safely converted."""


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
