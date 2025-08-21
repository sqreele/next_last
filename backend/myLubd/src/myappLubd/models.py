from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.core.validators import FileExtensionValidator, MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from PIL import Image
from io import BytesIO
import os
import requests
from django.core.files.base import ContentFile
from pathlib import Path
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
import logging

# Set up logger
logger = logging.getLogger(__name__)

# Use get_user_model() for proper user model reference
from django.contrib.auth import get_user_model
User = get_user_model()

class PreventiveMaintenance(models.Model):
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('semi_annual', 'Semi-Annual'),
        ('annual', 'Annual'),
        ('custom', 'Custom'),
    ]

    # Maximum image dimensions
    MAX_SIZE = (800, 800)
    job = models.ForeignKey('Job', on_delete=models.SET_NULL, null=True, blank=True)
    pmtitle = models.TextField(default='No title')
    pm_id = models.CharField(
        max_length=16,
        unique=True,
        blank=True,
        editable=False
    )
    
    # Add many-to-many relationship with Topic
    topics = models.ManyToManyField(
        'Topic',
        related_name='preventive_maintenances',
        blank=True,
        help_text="Topics associated with this preventive maintenance"
    )
    
    scheduled_date = models.DateTimeField()
    completed_date = models.DateTimeField(null=True, blank=True)
    frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default='monthly'
    )
    custom_days = models.PositiveIntegerField(
        null=True, 
        blank=True, 
        help_text="Custom frequency in days, if frequency is set to 'custom'"
    )
    next_due_date = models.DateTimeField(null=True, blank=True)
    
    # Direct ImageFields instead of ForeignKey to JobImage
    before_image = models.ImageField(
        upload_to='maintenance_pm_images/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])],
        null=True,
        blank=True,
        help_text="Image before maintenance"
    )
    after_image = models.ImageField(
        upload_to='maintenance_pm_images/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])],
        null=True,
        blank=True,
        help_text="Image after maintenance"
    )
    
    # JPEG versions for PDF generation compatibility
    before_image_jpeg_path = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Path to JPEG version of the before image for PDF generation"
    )
    after_image_jpeg_path = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Path to JPEG version of the after image for PDF generation"
    )
    
    notes = models.TextField(blank=True, null=True)
    procedure = models.TextField(blank=True, null=True, help_text="Maintenance procedure details")
    
    # Enhanced procedure management
    procedure_template = models.ForeignKey(
        'MaintenanceProcedure',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='maintenance_tasks',
        help_text="Template procedure for this maintenance task"
    )
    
    # Priority and status fields
    priority = models.CharField(
        max_length=20,
        choices=[
            ('low', 'Low'),
            ('medium', 'Medium'),
            ('high', 'High'),
            ('critical', 'Critical'),
        ],
        default='medium',
        help_text="Priority level of the maintenance task"
    )
    
    estimated_duration = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Estimated duration in minutes"
    )
    
    actual_duration = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Actual time taken in minutes"
    )
    
    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending'),
            ('in_progress', 'In Progress'),
            ('completed', 'Completed'),
            ('cancelled', 'Cancelled'),
            ('overdue', 'Overdue'),
        ],
        default='pending',
        help_text="Current status of the maintenance task"
    )
    
    # Completion details
    completed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_maintenance_tasks'
    )
    
    completion_notes = models.TextField(
        blank=True,
        null=True,
        help_text="Notes about the completion of the task"
    )
    
    # Quality and verification
    quality_score = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="Quality score from 1-10"
    )
    
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_maintenance_tasks'
    )
    
    verification_date = models.DateTimeField(null=True, blank=True)
    
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_preventive_maintenances'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-scheduled_date']
        verbose_name = 'Preventive Maintenance'
        verbose_name_plural = 'Preventive Maintenances'
        indexes = [
            models.Index(fields=['scheduled_date', 'next_due_date']),
            models.Index(fields=['frequency']),
        ]

    def __str__(self):
        return f"PM {self.pm_id} - {self.pmtitle}"

    def process_image(self, image_file, quality=85):
        """
        Process and resize the image, creating JPEG version for PDF generation compatibility.
        """
        if not image_file:
            return None, None
            
        try:
            img = Image.open(image_file)
            
            # Resize if image is larger than MAX_SIZE
            if img.width > self.MAX_SIZE[0] or img.height > self.MAX_SIZE[1]:
                img.thumbnail(self.MAX_SIZE, Image.Resampling.LANCZOS)

            # Convert RGBA to RGB if necessary
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.getchannel('A'))
                img = background

            # Convert to RGB if not already
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Create JPEG version
            jpeg_output = BytesIO()

            # Save as JPEG (for PDF generation)
            img.save(jpeg_output, 'JPEG', quality=quality, optimize=True)
            jpeg_output.seek(0)

            # Generate unique filename
            random_name = get_random_string(12)
            jpeg_name = f'{random_name}.jpg'

            return {
                'jpeg': ContentFile(jpeg_output.getvalue()),
                'jpeg_name': jpeg_name
            }
            
        except Exception as e:
            print(f"Error processing image: {e}")
            return None, None

    def save(self, *args, **kwargs):
        # Generate PM ID if not set
        if not self.pm_id:
            timestamp = timezone.now().strftime('%y')
            unique_id = get_random_string(length=6, allowed_chars='0123456789ABCDEF')
            self.pm_id = f"pm{timestamp}{unique_id}"
            
        # Calculate next due date based on frequency
        if self.completed_date and not self.next_due_date:
            self.calculate_next_due_date()
        
        # Process before_image if it's been changed
        if hasattr(self, '_before_image_changed') and self._before_image_changed:
            processed_images = self.process_image(self.before_image)
            if processed_images:
                # Save the JPEG version (for PDF generation)
                jpeg_path = f'maintenance_pm_images/{processed_images["jpeg_name"]}'
                jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(jpeg_full_path), exist_ok=True)
                
                # Save JPEG file
                with open(jpeg_full_path, 'wb') as f:
                    f.write(processed_images['jpeg'].read())
                
                # Store JPEG path for PDF generation
                self.before_image_jpeg_path = jpeg_path
                
                # Reset the processed images
                processed_images['jpeg'].close()
                
            self._before_image_changed = False
            
        # Process after_image if it's been changed
        if hasattr(self, '_after_image_changed') and self._after_image_changed:
            processed_images = self.process_image(self.after_image)
            if processed_images:
                # Save the JPEG version (for PDF generation)
                jpeg_path = f'maintenance_pm_images/{processed_images["jpeg_name"]}'
                jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(jpeg_full_path), exist_ok=True)
                
                # Save JPEG file
                with open(jpeg_full_path, 'wb') as f:
                    f.write(processed_images['jpeg'].read())
                
                # Store JPEG path for PDF generation
                self.after_image_jpeg_path = jpeg_path
                
                # Reset the processed images
                processed_images['jpeg'].close()
                
            self._after_image_changed = False
            
        super().save(*args, **kwargs)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Store original image paths to detect changes
        self._original_before_image = self.before_image
        self._original_after_image = self.after_image
        self._before_image_changed = False
        self._after_image_changed = False
    
    def clean(self):
        super().clean()
        # Mark images as changed if they differ from the original
        if self.before_image != self._original_before_image:
            self._before_image_changed = True
        if self.after_image != self._original_after_image:
            self._after_image_changed = True
            
    def calculate_next_due_date(self):
        """Calculate the next due date based on frequency"""
        if not self.completed_date:
            return
            
        base_date = self.completed_date
        
        if self.frequency == 'daily':
            self.next_due_date = base_date + timezone.timedelta(days=1)
        elif self.frequency == 'weekly':
            self.next_due_date = base_date + timezone.timedelta(weeks=1)
        elif self.frequency == 'monthly':
            # Add one month (approximately)
            month = base_date.month + 1
            year = base_date.year
            if month > 12:
                month = 1
                year += 1
            # Handle different month lengths
            day = min(base_date.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
            self.next_due_date = base_date.replace(year=year, month=month, day=day)
        elif self.frequency == 'quarterly':
            # Add three months
            month = base_date.month + 3
            year = base_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(base_date.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
            self.next_due_date = base_date.replace(year=year, month=month, day=day)
        elif self.frequency == 'semi_annual':
            # Add six months
            month = base_date.month + 6
            year = base_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(base_date.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 
                                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
            self.next_due_date = base_date.replace(year=year, month=month, day=day)
        elif self.frequency == 'annual':
            # Add one year
            self.next_due_date = base_date.replace(year=base_date.year + 1)
        elif self.frequency == 'custom' and self.custom_days:
            # Add custom number of days
            self.next_due_date = base_date + timezone.timedelta(days=self.custom_days)
            
    def delete(self, *args, **kwargs):
        """Remove image files when model instance is deleted"""
        # Store image paths before deletion
        before_image_path = self.before_image.path if self.before_image and hasattr(self.before_image, 'path') else None
        after_image_path = self.after_image.path if self.after_image and hasattr(self.after_image, 'path') else None
        
        # Call the parent delete method
        super().delete(*args, **kwargs)
        
        # Delete image files after model is deleted
        if before_image_path and os.path.isfile(before_image_path):
            os.remove(before_image_path)
            
        if after_image_path and os.path.isfile(after_image_path):
            os.remove(after_image_path)


def get_upload_path(instance, filename):
    """Generate a unique path for uploaded files"""
    ext = Path(filename).suffix
    random_filename = get_random_string(length=12)
    return f'{random_filename}{ext}'





class Property(models.Model):
    id = models.AutoField(primary_key=True) 
    property_id = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        editable=False
    )
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    users = models.ManyToManyField(User, related_name='accessible_properties')
    created_at = models.DateTimeField(auto_now_add=True)
    is_preventivemaintenance=models.BooleanField(default=False)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Properties'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.property_id:
            self.property_id = f"P{get_random_string(length=8, allowed_chars='0123456789ABCDEF')}"
        super().save(*args, **kwargs)


class Room(models.Model):
    room_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    room_type = models.CharField(max_length=50, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    properties = models.ManyToManyField(
        Property,
        related_name='rooms',
        blank=True
    )

    class Meta:
        ordering = ['room_type', 'name']
        verbose_name_plural = 'Rooms'
        indexes = [
            models.Index(fields=['room_type']),
            models.Index(fields=['is_active'])
        ]

    def __str__(self):
        return f"{self.room_type} - {self.name}"

    def clean(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValidationError("Room name cannot be empty.")

    def activate(self):
        self.is_active = True
        self.save()

    def deactivate(self):
        self.is_active = False
        self.save()


class Topic(models.Model):
    id = models.AutoField(primary_key=True) 
    title = models.CharField(
        max_length=160,
        unique=True,
        verbose_name="Subject"
    )
    description = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['title']
        verbose_name_plural = 'Topics'

    def __str__(self):
        return self.title


class JobImage(models.Model):
    # Image size configuration
    MAX_SIZE = (800, 800)  # Maximum image dimensions

    job = models.ForeignKey(
        'Job',  # Add ForeignKey to Job
        on_delete=models.CASCADE,
        related_name='job_images',  # Related name for reverse access
        help_text="The job associated with this image"
    )

    image = models.ImageField(
        upload_to='maintenance_job_images/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])],
        null=True,
        blank=True,
        help_text="Uploaded image file"
    )

    uploaded_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_job_images',
        help_text="User who uploaded the image"
    )

    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the image was uploaded"
    )
    
    # JPEG version for PDF generation compatibility
    jpeg_path = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Path to JPEG version of the image for PDF generation"
    )

    class Meta:
        ordering = ['-uploaded_at']
        verbose_name = 'Job Image'
        verbose_name_plural = 'Job Images'

    def __str__(self):
        return f"Image for Job {self.job.job_id} uploaded at {self.uploaded_at.date()}"

    def process_image(self, image_file, quality=85):
        """
        Process and resize the image, creating JPEG version for PDF generation compatibility.
        """
        try:
            img = Image.open(image_file)

            # Resize if image is larger than MAX_SIZE
            if img.width > self.MAX_SIZE[0] or img.height > self.MAX_SIZE[1]:
                img.thumbnail(self.MAX_SIZE, Image.Resampling.LANCZOS)

            # Convert RGBA to RGB if necessary
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.getchannel('A'))
                img = background

            # Convert to RGB if not already
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Create JPEG version
            jpeg_output = BytesIO()

            # Save as JPEG (for PDF generation)
            img.save(jpeg_output, 'JPEG', quality=quality, optimize=True)
            jpeg_output.seek(0)

            return {
                'jpeg': jpeg_output
            }
        except Exception as e:
            raise Exception(f"Error processing image: {e}")

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        # Process and convert image only if it's a new image
        if is_new and self.image:
            try:
                # Process and convert image to JPEG format
                processed_images = self.process_image(self.image)

                # Generate filename for JPEG version
                base_name = Path(self.image.name).stem
                jpeg_name = f'{base_name}.jpg'

                # Save the JPEG version (for PDF generation)
                jpeg_path = f'{self.image.field.upload_to}/{jpeg_name}'
                jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(jpeg_full_path), exist_ok=True)
                
                # Save JPEG file
                with open(jpeg_full_path, 'wb') as f:
                    f.write(processed_images['jpeg'].getvalue())

                # Store JPEG path for PDF generation
                self.jpeg_path = jpeg_name

                # Close the processed images to free memory
                processed_images['jpeg'].close()

            except Exception as e:
                logger.error(f"Error processing image: {e}")
                # Don't fail the save if image processing fails
                pass

        # Call the parent save method to store the object in the database
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Remove image file when model instance is deleted"""
        if self.image:
            if os.path.isfile(self.image.path):
                os.remove(self.image.path)

        super().delete(*args, **kwargs)


class Job(models.Model):
    is_preventivemaintenance = models.BooleanField(default=False, db_index=True)
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('waiting_sparepart', 'Waiting Sparepart'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
   
    job_id = models.CharField(
        max_length=16, 
        unique=True, 
        blank=True, 
        editable=False
    )
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='updated_jobs')
   
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='maintenance_jobs'
    )
    rooms = models.ManyToManyField(
        Room, 
        related_name='jobs', 
        blank=True
    )
    topics = models.ManyToManyField(
        Topic, 
        related_name='jobs', 
        blank=True
    )
    is_defective = models.BooleanField(default=False)
    
    images = models.ManyToManyField(
        'JobImage', 
        related_name='jobs', 
        blank=True
    )
    description = models.TextField()
    remarks = models.TextField()
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='pending',
        db_index=True
    )
    priority = models.CharField(
        max_length=20, 
        choices=PRIORITY_CHOICES, 
        default='medium'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Maintenance Jobs'
        indexes = [
            models.Index(fields=['status', 'created_at','is_preventivemaintenance']),
        ]

    def __str__(self):
        return f"Job {self.job_id} - {self.get_status_display()}"

    def save(self, *args, **kwargs):
        if not self.job_id:
            self.job_id = self.generate_job_id()
        
        if self.status == 'completed' and not self.completed_at:
            self.completed_at = timezone.now()
        super().save(*args, **kwargs)

    @classmethod
    def generate_job_id(cls):
        timestamp = timezone.now().strftime('%y')
        unique_id = get_random_string(length=6, allowed_chars='0123456789ABCDEF')
        return f"j{timestamp}{unique_id}"
        
    def create_preventive_maintenance(self, scheduled_date, frequency='monthly', created_by=None):
        """Create a preventive maintenance schedule for this job"""
        if not self.is_preventivemaintenance:
            self.is_preventivemaintenance = True
            self.save()
            
        # Import here to avoid circular import issues
        from .models import PreventiveMaintenance
        
        return PreventiveMaintenance.objects.create(
            job=self,
            scheduled_date=scheduled_date,
            frequency=frequency,
            created_by=created_by or self.user
        )


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    positions = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(upload_to='profile_images/', blank=True, null=True)
    properties = models.ManyToManyField(
        Property,
        related_name='user_profiles',
        blank=True
    )
    
    # Google OAuth fields
    google_id = models.CharField(max_length=100, blank=True, null=True)
    email_verified = models.BooleanField(default=False)
    access_token = models.TextField(blank=True, null=True)
    refresh_token = models.TextField(blank=True, null=True)
    login_provider = models.CharField(max_length=50, blank=True, null=True)
    last_login_google = models.DateTimeField(null=True, blank=True)

    # Password reset fields
    reset_password_token = models.CharField(max_length=128, blank=True, null=True)
    reset_password_expires_at = models.DateTimeField(null=True, blank=True)
    reset_password_used = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['google_id']),
        ]

    def __str__(self):
        return f"{self.user.username}'s Profile"

    def save(self, *args, **kwargs):
        if self.profile_image:
            try:
                img = Image.open(self.profile_image)
                
                # Convert RGBA to RGB if necessary
                if img.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.getchannel('A'))
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                # Resize image if too large
                if img.height > 300 or img.width > 300:
                    output_size = (300, 300)
                    img.thumbnail(output_size, Image.Resampling.LANCZOS)

                # Save as JPEG
                output = BytesIO()
                img.save(output, format='JPEG', quality=85, optimize=True)
                output.seek(0)

                # Generate unique filename
                random_name = get_random_string(12)
                jpeg_name = f'profile_images/{random_name}.jpg'

                # Save the processed image
                self.profile_image.save(
                    jpeg_name,
                    ContentFile(output.getvalue()),
                    save=False
                )
                
                output.close()
            except Exception as e:
                print(f"Error processing profile image: {e}")

        super().save(*args, **kwargs)

    def update_from_google_data(self, google_data):
        """Update profile with data from Google"""
        if google_data.get('picture'):
            # Try to download the profile image
            try:
                response = requests.get(google_data['picture'], stream=True, timeout=10)
                response.raise_for_status()
                
                filename = f"profile_image_{self.user.id}.jpg"
                self.profile_image.save(filename, ContentFile(response.content), save=False)
                logger.info(f"Profile image saved successfully from Google data")
            except Exception as e:
                logger.error(f"Error downloading profile image: {e}")
        
        self.google_id = google_data.get('sub')
        self.email_verified = google_data.get('email_verified', False)
        self.login_provider = 'google'
        self.last_login_google = timezone.now()
        
        # Update user model fields
        self.user.first_name = google_data.get('given_name', '')
        self.user.last_name = google_data.get('family_name', '')
        self.user.email = google_data.get('email', '')
        
        self.user.save()
        self.save()


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Create a UserProfile for every new User"""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Save UserProfile when User is saved"""
    if not hasattr(instance, 'userprofile'):
        UserProfile.objects.create(user=instance)
    instance.userprofile.save()


class Session(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    session_token = models.CharField(max_length=255, unique=True)
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() >= self.expires_at

    def __str__(self):
        return f"Session for {self.user.username} - Expires: {self.expires_at}"
    
    
class Machine(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('maintenance', 'Under Maintenance'),
        ('repair', 'Under Repair'),
        ('inactive', 'Inactive'),
        ('retired', 'Retired'),
    ]

    id = models.AutoField(primary_key=True)
    machine_id = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        editable=False
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=200, blank=True, null=True)
    
    # Relationship with Property
    property = models.ForeignKey(
        'Property',
        on_delete=models.CASCADE,
        related_name='machines'
    )
    
    # Many-to-many relationship with PreventiveMaintenance
    preventive_maintenances = models.ManyToManyField(
        'PreventiveMaintenance',
        related_name='machines',
        blank=True
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    
    installation_date = models.DateField(null=True, blank=True)
    last_maintenance_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Machine'
        verbose_name_plural = 'Machines'
        indexes = [
            models.Index(fields=['machine_id']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.name} ({self.machine_id})"
    
    def save(self, *args, **kwargs):
        if not self.machine_id:
            timestamp = timezone.now().strftime('%y')
            unique_id = get_random_string(length=8, allowed_chars='0123456789ABCDEF')
            self.machine_id = f"M{timestamp}{unique_id}"
        super().save(*args, **kwargs)
    
    def get_next_maintenance_date(self):
        """Get the nearest upcoming maintenance date"""
        upcoming_maintenances = self.preventive_maintenances.filter(
            next_due_date__gt=timezone.now()
        ).order_by('next_due_date')
        
        if upcoming_maintenances.exists():
            return upcoming_maintenances.first().next_due_date
        return None


class MaintenanceProcedure(models.Model):
    """Model for storing detailed maintenance procedures"""
    name = models.CharField(max_length=200)
    description = models.TextField()
    steps = models.JSONField(
        default=list, 
        help_text="List of maintenance steps in JSON format"
    )
    estimated_duration = models.PositiveIntegerField(help_text="Estimated duration in minutes")
    required_tools = models.TextField(blank=True, null=True)
    safety_notes = models.TextField(blank=True, null=True)
    difficulty_level = models.CharField(
        max_length=20,
        choices=[
            ('beginner', 'Beginner'),
            ('intermediate', 'Intermediate'),
            ('advanced', 'Advanced'),
            ('expert', 'Expert'),
        ],
        default='intermediate',
        help_text="Skill level required for this procedure"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        verbose_name = 'Maintenance Procedure'
        verbose_name_plural = 'Maintenance Procedures'
    
    def __str__(self):
        return self.name
    
    def get_steps_count(self):
        """Get the total number of steps"""
        return len(self.steps) if self.steps else 0
    
    def get_step(self, step_number):
        """Get a specific step by number (1-based indexing)"""
        if not self.steps or step_number < 1 or step_number > len(self.steps):
            return None
        return self.steps[step_number - 1]
    
    def add_step(self, step_data):
        """Add a new step to the procedure"""
        if not self.steps:
            self.steps = []
        
        # Validate step data
        required_fields = ['title', 'description', 'estimated_time']
        for field in required_fields:
            if field not in step_data:
                raise ValueError(f"Step must include '{field}' field")
        
        # Add step number
        step_data['step_number'] = len(self.steps) + 1
        step_data['created_at'] = timezone.now().isoformat()
        
        self.steps.append(step_data)
        self.save()
        return step_data
    
    def update_step(self, step_number, step_data):
        """Update a specific step"""
        if not self.steps or step_number < 1 or step_number > len(self.steps):
            raise ValueError(f"Invalid step number: {step_number}")
        
        # Preserve step number and created_at
        step_data['step_number'] = step_number
        if 'created_at' not in self.steps[step_number - 1]:
            step_data['created_at'] = timezone.now().isoformat()
        else:
            step_data['created_at'] = self.steps[step_number - 1]['created_at']
        
        step_data['updated_at'] = timezone.now().isoformat()
        self.steps[step_number - 1] = step_data
        self.save()
        return step_data
    
    def delete_step(self, step_number):
        """Delete a specific step and reorder remaining steps"""
        if not self.steps or step_number < 1 or step_number > len(self.steps):
            raise ValueError(f"Invalid step number: {step_number}")
        
        # Remove the step
        del self.steps[step_number - 1]
        
        # Reorder remaining steps
        for i, step in enumerate(self.steps):
            step['step_number'] = i + 1
            step['updated_at'] = timezone.now().isoformat()
        
        self.save()
        return True
    
    def reorder_steps(self, new_order):
        """Reorder steps based on new order list (step numbers)"""
        if not self.steps:
            return False
        
        if len(new_order) != len(self.steps):
            raise ValueError("New order must include all steps")
        
        # Create new steps list with reordered steps
        new_steps = []
        for new_step_num in new_order:
            step = next((s for s in self.steps if s.get('step_number') == new_step_num), None)
            if step:
                step['step_number'] = len(new_steps) + 1
                step['updated_at'] = timezone.now().isoformat()
                new_steps.append(step)
        
        self.steps = new_steps
        self.save()
        return True
    
    def validate_steps(self):
        """Validate that all steps have required fields"""
        if not self.steps:
            return True, "No steps defined"
        
        errors = []
        for i, step in enumerate(self.steps):
            step_num = i + 1
            required_fields = ['title', 'description', 'estimated_time']
            
            for field in required_fields:
                if field not in step or not step[field]:
                    errors.append(f"Step {step_num}: Missing or empty '{field}' field")
            
            # Validate estimated_time is positive
            if 'estimated_time' in step and step['estimated_time'] <= 0:
                errors.append(f"Step {step_num}: Estimated time must be positive")
        
        return len(errors) == 0, errors
    
    def get_total_estimated_time(self):
        """Calculate total estimated time for all steps"""
        if not self.steps:
            return 0
        
        total_time = 0
        for step in self.steps:
            if 'estimated_time' in step and isinstance(step['estimated_time'], (int, float)):
                total_time += step['estimated_time']
        
        return total_time
    
    def duplicate_procedure(self, new_name):
        """Create a duplicate of this procedure with a new name"""
        duplicate = MaintenanceProcedure.objects.create(
            name=new_name,
            description=self.description,
            steps=self.steps.copy() if self.steps else [],
            estimated_duration=self.estimated_duration,
            required_tools=self.required_tools,
            safety_notes=self.safety_notes,
            difficulty_level=self.difficulty_level
        )
        return duplicate


class MaintenanceChecklist(models.Model):
    """Model for maintenance checklists"""
    maintenance = models.ForeignKey(
        PreventiveMaintenance, 
        on_delete=models.CASCADE, 
        related_name='checklists'
    )
    item = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    is_completed = models.BooleanField(default=False)
    completed_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='completed_checklist_items'
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['order']
        verbose_name = 'Maintenance Checklist Item'
        verbose_name_plural = 'Maintenance Checklist Items'
    
    def __str__(self):
        return f"{self.maintenance.pm_id} - {self.item}"


class MaintenanceHistory(models.Model):
    """Model for tracking maintenance history"""
    maintenance = models.ForeignKey(
        PreventiveMaintenance,
        on_delete=models.CASCADE,
        related_name='history'
    )
    action = models.CharField(max_length=100)  # e.g., 'started', 'completed', 'rescheduled'
    notes = models.TextField(blank=True, null=True)
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Maintenance History'
        verbose_name_plural = 'Maintenance History'
    
    def __str__(self):
        return f"{self.maintenance.pm_id} - {self.action} at {self.timestamp}"


class MaintenanceSchedule(models.Model):
    """Model for managing maintenance schedules"""
    maintenance = models.OneToOneField(
        PreventiveMaintenance,
        on_delete=models.CASCADE,
        related_name='schedule'
    )
    is_recurring = models.BooleanField(default=True)
    next_occurrence = models.DateTimeField()
    recurrence_pattern = models.JSONField(
        default=dict,
        help_text="Pattern for recurring maintenance (e.g., {'type': 'monthly', 'day': 15})"
    )
    last_occurrence = models.DateTimeField(null=True, blank=True)
    total_occurrences = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = 'Maintenance Schedule'
        verbose_name_plural = 'Maintenance Schedules'
    
    def __str__(self):
        return f"Schedule for {self.maintenance.pm_id}"