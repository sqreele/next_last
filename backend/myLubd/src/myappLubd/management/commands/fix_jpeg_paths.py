"""
Management command to fix incorrect jpeg_path values containing %Y/%m placeholders.
"""
from django.core.management.base import BaseCommand
from django.db.models import Q
from myappLubd.models import JobImage, PreventiveMaintenance
from pathlib import Path
import os
from django.conf import settings


class Command(BaseCommand):
    help = 'Fix incorrect jpeg_path values that contain %Y/%m placeholders'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without actually updating the database',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        # Fix JobImage records
        self.stdout.write('Fixing JobImage records...')
        job_images_fixed = 0
        job_images_with_bad_paths = JobImage.objects.filter(
            Q(jpeg_path__contains='%Y/%m') | Q(jpeg_path__isnull=True)
        ).exclude(image='')
        
        for job_img in job_images_with_bad_paths:
            if not job_img.image:
                continue
                
            # Extract the actual directory from the image path
            image_path = Path(job_img.image.name)
            base_name = image_path.stem
            jpeg_name = f'{base_name}.jpg'
            
            # Generate the correct JPEG path using the actual image directory
            correct_jpeg_path = str(image_path.parent / jpeg_name)
            
            # Check if JPEG file exists
            jpeg_full_path = os.path.join(settings.MEDIA_ROOT, correct_jpeg_path)
            jpeg_exists = os.path.exists(jpeg_full_path)
            
            old_path = job_img.jpeg_path or '(null)'
            self.stdout.write(
                f'  Job {job_img.job.job_id} - Image: {job_img.image.name}\n'
                f'    Old JPEG path: {old_path}\n'
                f'    New JPEG path: {correct_jpeg_path}\n'
                f'    JPEG exists: {jpeg_exists}'
            )
            
            if not dry_run:
                job_img.jpeg_path = correct_jpeg_path
                job_img.save(update_fields=['jpeg_path'])
                job_images_fixed += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\nJobImage: {"Would fix" if dry_run else "Fixed"} {job_images_with_bad_paths.count()} records'
            )
        )
        
        # Fix PreventiveMaintenance records - before_image
        self.stdout.write('\nFixing PreventiveMaintenance before_image records...')
        pm_before_fixed = 0
        pm_with_bad_before = PreventiveMaintenance.objects.filter(
            Q(before_image_jpeg_path__contains='%Y/%m') | 
            Q(before_image_jpeg_path__isnull=True)
        ).exclude(before_image='')
        
        for pm in pm_with_bad_before:
            if not pm.before_image:
                continue
                
            # Extract the actual directory from the image path
            image_path = Path(pm.before_image.name)
            base_name = image_path.stem
            jpeg_name = f'{base_name}.jpg'
            
            # Generate the correct JPEG path using the actual image directory
            correct_jpeg_path = str(image_path.parent / jpeg_name)
            
            # Check if JPEG file exists
            jpeg_full_path = os.path.join(settings.MEDIA_ROOT, correct_jpeg_path)
            jpeg_exists = os.path.exists(jpeg_full_path)
            
            old_path = pm.before_image_jpeg_path or '(null)'
            self.stdout.write(
                f'  PM {pm.pm_id} - Before Image: {pm.before_image.name}\n'
                f'    Old JPEG path: {old_path}\n'
                f'    New JPEG path: {correct_jpeg_path}\n'
                f'    JPEG exists: {jpeg_exists}'
            )
            
            if not dry_run:
                pm.before_image_jpeg_path = correct_jpeg_path
                pm.save(update_fields=['before_image_jpeg_path'])
                pm_before_fixed += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\nPreventiveMaintenance before_image: {"Would fix" if dry_run else "Fixed"} {pm_with_bad_before.count()} records'
            )
        )
        
        # Fix PreventiveMaintenance records - after_image
        self.stdout.write('\nFixing PreventiveMaintenance after_image records...')
        pm_after_fixed = 0
        pm_with_bad_after = PreventiveMaintenance.objects.filter(
            Q(after_image_jpeg_path__contains='%Y/%m') | 
            Q(after_image_jpeg_path__isnull=True)
        ).exclude(after_image='')
        
        for pm in pm_with_bad_after:
            if not pm.after_image:
                continue
                
            # Extract the actual directory from the image path
            image_path = Path(pm.after_image.name)
            base_name = image_path.stem
            jpeg_name = f'{base_name}.jpg'
            
            # Generate the correct JPEG path using the actual image directory
            correct_jpeg_path = str(image_path.parent / jpeg_name)
            
            # Check if JPEG file exists
            jpeg_full_path = os.path.join(settings.MEDIA_ROOT, correct_jpeg_path)
            jpeg_exists = os.path.exists(jpeg_full_path)
            
            old_path = pm.after_image_jpeg_path or '(null)'
            self.stdout.write(
                f'  PM {pm.pm_id} - After Image: {pm.after_image.name}\n'
                f'    Old JPEG path: {old_path}\n'
                f'    New JPEG path: {correct_jpeg_path}\n'
                f'    JPEG exists: {jpeg_exists}'
            )
            
            if not dry_run:
                pm.after_image_jpeg_path = correct_jpeg_path
                pm.save(update_fields=['after_image_jpeg_path'])
                pm_after_fixed += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\nPreventiveMaintenance after_image: {"Would fix" if dry_run else "Fixed"} {pm_with_bad_after.count()} records'
            )
        )
        
        # Summary
        total = job_images_with_bad_paths.count() + pm_with_bad_before.count() + pm_with_bad_after.count()
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\nDRY RUN COMPLETE - Would fix {total} records in total'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSUCCESS - Fixed {total} records in total'
                )
            )
