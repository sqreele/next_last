from django.core.management.base import BaseCommand
from django.conf import settings
from myappLubd.models import JobImage, PreventiveMaintenance
from PIL import Image
from io import BytesIO
import os


class Command(BaseCommand):
    help = "Backfill JPEG versions for JobImage and PreventiveMaintenance images to ensure PDF compatibility"

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=5000, help='Maximum number of records to process for each model')
        parser.add_argument('--dry-run', action='store_true', help='Run without writing files or database changes')

    def handle(self, *args, **options):
        limit = options['limit']
        dry_run = options['dry_run']

        self.stdout.write(self.style.NOTICE(f"Starting backfill (limit={limit}, dry_run={dry_run})"))

        jobimage_updated = self._backfill_job_images(limit=limit, dry_run=dry_run)
        pm_updated = self._backfill_pm_images(limit=limit, dry_run=dry_run)

        self.stdout.write(self.style.SUCCESS(
            f"Backfill complete: JobImage updated={jobimage_updated}, PreventiveMaintenance updated={pm_updated}"
        ))

    def _ensure_media_dir(self, path: str):
        full_path = os.path.join(settings.MEDIA_ROOT, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        return full_path

    def _save_jpeg(self, pil_image: Image.Image, target_rel_path: str, quality: int = 85):
        full_path = self._ensure_media_dir(target_rel_path)
        out = BytesIO()
        # Convert to RGB if needed
        if pil_image.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', pil_image.size, (255, 255, 255))
            background.paste(pil_image, mask=pil_image.getchannel('A'))
            pil_image = background
        elif pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        pil_image.save(out, 'JPEG', quality=quality, optimize=True)
        out.seek(0)
        with open(full_path, 'wb') as f:
            f.write(out.getvalue())
        out.close()

    def _backfill_job_images(self, limit: int, dry_run: bool) -> int:
        qs = JobImage.objects.all().order_by('-uploaded_at')
        updated = 0
        for ji in qs.iterator(chunk_size=2000):
            if updated >= limit:
                break
            try:
                if not ji.image:
                    continue
                # If jpeg_path already present and file exists, skip
                if ji.jpeg_path:
                    jpeg_full = os.path.join(settings.MEDIA_ROOT, ji.jpeg_path)
                    if os.path.isfile(jpeg_full):
                        continue
                # Derive target path under the same upload dir
                base_dir = ji.image.field.upload_to if hasattr(ji.image, 'field') else 'maintenance_job_images'
                base_name = os.path.splitext(os.path.basename(ji.image.name))[0]
                target_rel = f"{base_dir}/{base_name}.jpg"
                # Open source file
                src_path = ji.image.path if hasattr(ji.image, 'path') else None
                if not src_path or not os.path.isfile(src_path):
                    continue
                with Image.open(src_path) as img:
                    if not dry_run:
                        self._save_jpeg(img, target_rel)
                        ji.jpeg_path = target_rel
                        ji.save(update_fields=['jpeg_path'])
                updated += 1
                if updated % 100 == 0:
                    self.stdout.write(self.style.NOTICE(f"JobImage processed: {updated}"))
            except Exception as e:
                self.stderr.write(self.style.WARNING(f"JobImage {ji.id}: {e}"))
        return updated

    def _backfill_pm_images(self, limit: int, dry_run: bool) -> int:
        qs = PreventiveMaintenance.objects.all().order_by('-updated_at')
        updated = 0
        for pm in qs.iterator(chunk_size=2000):
            if updated >= limit:
                break
            try:
                changed = False
                # before_image
                if pm.before_image and not pm.before_image_jpeg_path:
                    src_path = pm.before_image.path if hasattr(pm.before_image, 'path') else None
                    if src_path and os.path.isfile(src_path):
                        base_name = os.path.splitext(os.path.basename(src_path))[0]
                        target_rel = f"maintenance_pm_images/{base_name}.jpg"
                        with Image.open(src_path) as img:
                            if not dry_run:
                                self._save_jpeg(img, target_rel)
                                pm.before_image_jpeg_path = target_rel
                                changed = True
                # after_image
                if pm.after_image and not pm.after_image_jpeg_path:
                    src_path = pm.after_image.path if hasattr(pm.after_image, 'path') else None
                    if src_path and os.path.isfile(src_path):
                        base_name = os.path.splitext(os.path.basename(src_path))[0]
                        target_rel = f"maintenance_pm_images/{base_name}.jpg"
                        with Image.open(src_path) as img:
                            if not dry_run:
                                self._save_jpeg(img, target_rel)
                                pm.after_image_jpeg_path = target_rel
                                changed = True
                if changed and not dry_run:
                    pm.save(update_fields=['before_image_jpeg_path', 'after_image_jpeg_path', 'updated_at'])
                    updated += 1
                    if updated % 100 == 0:
                        self.stdout.write(self.style.NOTICE(f"PreventiveMaintenance processed: {updated}"))
            except Exception as e:
                self.stderr.write(self.style.WARNING(f"PM {getattr(pm, 'pm_id', pm.id)}: {e}"))
        return updated

