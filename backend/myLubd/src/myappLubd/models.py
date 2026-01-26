from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.core.validators import FileExtensionValidator, MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.db.models import Q  # ✅ PERFORMANCE OPTIMIZATION: Import Q for partial indexes
from django.db.utils import ProgrammingError
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

# Natural key managers for stable fixture serialization/loading
class PropertyManager(models.Manager):
    def get_by_natural_key(self, property_id):
        return self.get(property_id=property_id)


class PreventiveMaintenanceManager(models.Manager):
    def get_by_natural_key(self, pm_id):
        return self.get(pm_id=pm_id)


class MachineManager(models.Manager):
    def get_by_natural_key(self, machine_id):
        return self.get(machine_id=machine_id)

# Custom User Model with property fields
class User(AbstractUser):
    property_name = models.CharField(max_length=255, blank=True, null=True, help_text="Name of the property this user belongs to")
    property_id = models.CharField(max_length=50, blank=True, null=True, help_text="ID of the property this user belongs to")
    uses_roster = models.BooleanField(default=False, help_text="Enable roster management access for this user")
    
    class Meta:
        pass


class RosterLeave(models.Model):
    DAY_CHOICES = [
        ('Mon', 'Monday'),
        ('Tue', 'Tuesday'),
        ('Wed', 'Wednesday'),
        ('Thu', 'Thursday'),
        ('Fri', 'Friday'),
        ('Sat', 'Saturday'),
        ('Sun', 'Sunday'),
    ]

    LEAVE_TYPE_CHOICES = [
        ('PH', 'PH'),
        ('VC', 'VC'),
    ]

    staff_id = models.CharField(max_length=10)
    week = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(53)])
    day = models.CharField(max_length=3, choices=DAY_CHOICES)
    leave_type = models.CharField(max_length=2, choices=LEAVE_TYPE_CHOICES)
    note = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='roster_leaves'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['created_by', 'staff_id', 'week', 'day'],
                name='uniq_roster_leave_entry'
            )
        ]

    def __str__(self):
        return f"{self.staff_id} {self.week} {self.day} {self.leave_type}"

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
    
    # Enhanced procedure management - Following ER diagram (task_id)
    procedure_template = models.ForeignKey(
        'MaintenanceProcedure',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='maintenance_schedules',
        help_text="Maintenance task this schedule is for (task_id in ER diagram)"
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
        settings.AUTH_USER_MODEL,
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
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_maintenance_tasks'
    )
    
    verification_date = models.DateTimeField(null=True, blank=True)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_preventive_maintenances'
    )
    
    # Following ER diagram - assigned_to field
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_maintenance_schedules',
        help_text="User assigned to perform this maintenance schedule"
    )
    
    # Following ER diagram - remarks field
    remarks = models.TextField(
        blank=True,
        null=True,
        help_text="Additional remarks about this maintenance schedule"
    )
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-scheduled_date']
        verbose_name = 'Preventive Maintenance'
        verbose_name_plural = 'Preventive Maintenance'
        indexes = [
            # ✅ PERFORMANCE: Enhanced database indexes following ER diagram
            models.Index(fields=['procedure_template']),  # FK to MaintenanceTask (task_id)
            models.Index(fields=['assigned_to']),  # FK to User
            models.Index(fields=['status']),  # Filter by status
            models.Index(fields=['scheduled_date']),  # Sort by schedule
            models.Index(fields=['completed_date']),  # Filter completed
            models.Index(fields=['scheduled_date', 'completed_date']),  # Composite for overdue
            models.Index(fields=['pm_id']),  # Unique ID lookups
            models.Index(fields=['created_by']),  # Creator lookups
            models.Index(fields=['job']),  # Related job lookups
            models.Index(fields=['status', 'assigned_to']),  # Common filtering pattern
            models.Index(fields=['procedure_template', 'status']),  # Task status tracking
        ]

    # Use a manager that can resolve by natural key
    objects = PreventiveMaintenanceManager()

    def __str__(self):
        return f"PM {self.pm_id} - {self.pmtitle}"

    def natural_key(self):
        # Unique, stable identifier for fixtures
        return (self.pm_id,)

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
                # Use the directory from the actual uploaded image path, not a hardcoded path
                image_path = Path(self.before_image.name)
                jpeg_name = f'{image_path.stem}.jpg'
                jpeg_path = str(image_path.parent / jpeg_name)
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
                # Use the directory from the actual uploaded image path, not a hardcoded path
                image_path = Path(self.after_image.name)
                jpeg_name = f'{image_path.stem}.jpg'
                jpeg_path = str(image_path.parent / jpeg_name)
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
        
        # Clear ManyToMany relationships before deletion to avoid errors if intermediate tables don't exist
        # This handles the case where migration 0052 hasn't been run or the table was dropped
        try:
            # Clear inventory_items relationship if it exists
            if hasattr(self, 'inventory_items'):
                self.inventory_items.clear()
        except ProgrammingError as e:
            # If the intermediate table doesn't exist, ignore the error
            # This can happen if migrations haven't been run
            error_str = str(e)
            if 'does not exist' not in error_str or 'inventory_preventive_maintenances' not in error_str:
                # Re-raise if it's a different ProgrammingError
                raise
        
        try:
            # Call the parent delete method
            super().delete(*args, **kwargs)
        except ProgrammingError as e:
            # Handle case where ManyToMany intermediate table doesn't exist
            error_str = str(e)
            if 'does not exist' in error_str and 'inventory_preventive_maintenances' in error_str:
                # The intermediate table doesn't exist, which means the ManyToMany relationship
                # was never properly set up (migration 0052 may not have been run).
                # Delete the record directly using SQL with proper table name handling
                pk = self.pk
                from django.db import connection
                
                # Get table name from Django's model meta and quote it properly
                # PostgreSQL is case-sensitive for quoted identifiers, so we need to handle this
                table_name = self._meta.db_table
                
                # Try with lowercase first (PostgreSQL's default behavior for unquoted identifiers)
                try:
                    with connection.cursor() as cursor:
                        # Use lowercase table name (PostgreSQL converts unquoted to lowercase)
                        cursor.execute(
                            'DELETE FROM {} WHERE id = %s'.format(table_name.lower()),
                            [pk]
                        )
                except ProgrammingError:
                    # If lowercase fails, try with quoted name (preserves exact case)
                    table_name_quoted = connection.ops.quote_name(table_name)
                    with connection.cursor() as cursor:
                        cursor.execute(
                            'DELETE FROM {} WHERE id = %s'.format(table_name_quoted),
                            [pk]
                        )
            else:
                # Re-raise if it's a different ProgrammingError
                raise
        
        # Delete image files after model is deleted
        if before_image_path and os.path.isfile(before_image_path):
            try:
                os.remove(before_image_path)
            except OSError:
                pass  # File may have already been deleted
            
        if after_image_path and os.path.isfile(after_image_path):
            try:
                os.remove(after_image_path)
            except OSError:
                pass  # File may have already been deleted


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
    users = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='accessible_properties')
    created_at = models.DateTimeField(auto_now_add=True)
    is_preventivemaintenance=models.BooleanField(default=False)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Properties'
        indexes = [
            # ✅ PERFORMANCE: Property indexes for faster lookups
            models.Index(fields=['property_id']),  # Frequently used in queries
            models.Index(fields=['name']),  # For search operations
        ]

    # Enable natural key lookups
    objects = PropertyManager()

    def __str__(self):
        return self.name

    def natural_key(self):
        return (self.property_id,)

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
            # ✅ PERFORMANCE: Enhanced Room indexes
            models.Index(fields=['room_type']),
            models.Index(fields=['is_active']),
            models.Index(fields=['room_id']),  # For direct lookups
            models.Index(fields=['name']),  # For search operations
            models.Index(fields=['room_type', 'is_active']),  # Composite for filtering
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
        indexes = [
            # ✅ PERFORMANCE: Topic indexes for faster filtering
            models.Index(fields=['title']),  # For search and filtering
        ]

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
        settings.AUTH_USER_MODEL,
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
        indexes = [
            # ✅ PERFORMANCE: JobImage indexes
            models.Index(fields=['job']),  # Foreign key lookups
            models.Index(fields=['uploaded_at']),  # For sorting
        ]

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
                # Extract the directory from the actual image path (which has date directories)
                image_path = Path(self.image.name)
                base_name = image_path.stem
                jpeg_name = f'{base_name}.jpg'

                # Save the JPEG version (for PDF generation)
                # Use the directory from the actual uploaded image path, not the template
                jpeg_path = str(image_path.parent / jpeg_name)
                jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(jpeg_full_path), exist_ok=True)
                
                # Save JPEG file
                with open(jpeg_full_path, 'wb') as f:
                    f.write(processed_images['jpeg'].getvalue())

                # Store JPEG path for PDF generation (relative to MEDIA_ROOT)
                self.jpeg_path = jpeg_path

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
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='updated_jobs')
   
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
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
    
    # Images are accessed through the reverse ForeignKey relationship
    # Use job.job_images.all() to get all images for a job
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
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Maintenance Jobs'
        indexes = [
            # ✅ PERFORMANCE OPTIMIZATION: Comprehensive database indexes
            # Single-field indexes (avoid duplicates with implicit indexes from db_index=True or FK/unique)
            models.Index(fields=['created_at']),
            models.Index(fields=['updated_at']),  # For sorting
            models.Index(fields=['priority']),
            models.Index(fields=['completed_at']),

            # Composite indexes for common query patterns
            models.Index(fields=['status', 'created_at']),  # Filter by status + sort
            models.Index(fields=['is_preventivemaintenance', 'status']),  # PM jobs by status
            models.Index(fields=['user', 'created_at']),  # User's jobs sorted
            models.Index(fields=['status', 'priority']),  # Status + priority filtering
            models.Index(fields=['user', 'status']),
            models.Index(fields=['created_at', 'status', 'priority']),

            # Partial indexes for better performance on filtered data
            models.Index(fields=['created_at'], condition=Q(status='pending'), name='job_pending_created_idx'),
            models.Index(fields=['created_at'], condition=Q(is_preventivemaintenance=True), name='job_pm_created_idx'),
            models.Index(fields=['completed_at'], condition=Q(completed_at__isnull=False), name='job_completed_at_idx'),
            
            # Legacy index (keeping for backward compatibility)
            models.Index(fields=['status', 'created_at','is_preventivemaintenance']),
        ]

    def __str__(self):
        return f"Job {self.job_id} - {self.get_status_display()}"

    def save(self, *args, **kwargs):
        if not self.job_id:
            self.job_id = self.generate_job_id()
        
        # Set created_at only for new objects
        if not self.pk:
            if not self.created_at:
                self.created_at = timezone.now()
        
        # Always update the updated_at timestamp unless explicitly specified in update_fields
        update_fields = kwargs.get('update_fields', None)
        if not update_fields or 'updated_at' not in update_fields:
            self.updated_at = timezone.now()
        
        # Only auto-set completed_at if status is completed and completed_at is not already set
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
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    positions = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(upload_to='profile_images/', blank=True, null=True)
    properties = models.ManyToManyField(
        Property,
        related_name='user_profiles',
        blank=True
    )
    
    # Property fields (also available in User model)
    property_name = models.CharField(max_length=255, blank=True, null=True, help_text="Name of the property this user belongs to")
    property_id = models.CharField(max_length=50, blank=True, null=True, help_text="ID of the property this user belongs to")
    
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
    
    # Email notification preferences
    email_notifications_enabled = models.BooleanField(
        default=True,
        help_text="If False, user will not receive email notifications (summary emails, etc.)"
    )

    class Meta:
        indexes = [
            # ✅ PERFORMANCE: UserProfile indexes
            models.Index(fields=['google_id']),
            models.Index(fields=['user']),  # Primary lookup
            models.Index(fields=['property_id']),  # Property filtering
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


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    """Create a UserProfile for every new User"""
    # Skip during loaddata/fixture deserialization
    if kwargs.get('raw'):
        return
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def save_user_profile(sender, instance, **kwargs):
    """Save UserProfile when User is saved"""
    # Skip during loaddata/fixture deserialization
    if kwargs.get('raw'):
        return
    if not hasattr(instance, 'userprofile'):
        UserProfile.objects.create(user=instance)
    instance.userprofile.save()


class Session(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sessions')
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
        editable=True,  # Changed: Now you can manually edit machine IDs
        help_text="Unique machine identifier (auto-generated if left empty)"
    )
    name = models.CharField(max_length=100)
    brand = models.CharField(max_length=100, blank=True, null=True, help_text="Equipment brand/manufacturer")
    category = models.CharField(max_length=100, blank=True, null=True, help_text="Equipment category/type")
    serial_number = models.CharField(max_length=100, blank=True, null=True, unique=True, help_text="Serial number")
    description = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=200, blank=True, null=True)
    group_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Task group ID for this machine (e.g., 'PUMP_MAINTENANCE', 'HVAC_CHECK'). This can also be inherited from linked maintenance procedures."
    )
    
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
    
    installation_date = models.DateField(null=True, blank=True, help_text="Date when equipment was installed")
    last_maintenance_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Equipment'
        verbose_name_plural = 'Equipment'
        indexes = [
            # ✅ PERFORMANCE: Enhanced Equipment indexes following ER diagram
            models.Index(fields=['machine_id']),  # Unique ID lookups
            models.Index(fields=['serial_number']),  # Serial number lookups
            models.Index(fields=['name']),  # For search
            models.Index(fields=['brand']),  # Filter by brand
            models.Index(fields=['category']),  # Filter by category/type
            models.Index(fields=['status']),  # Filter by status
            models.Index(fields=['property']),  # FK to Property
            models.Index(fields=['location']),  # Search by location
            models.Index(fields=['group_id']),  # Filter by task group
            models.Index(fields=['status', 'property']),  # Composite for filtering
            models.Index(fields=['category', 'status']),  # Equipment type and status
            models.Index(fields=['last_maintenance_date']),  # For maintenance tracking
            models.Index(fields=['installation_date']),  # For age tracking
        ]

    # Natural key manager
    objects = MachineManager()

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

    def natural_key(self):
        return (self.machine_id,)


class MaintenanceProcedure(models.Model):
    """Model for storing detailed maintenance procedures / tasks (templates)"""
    
    # Equipment field removed - tasks are now generic templates
    
    name = models.CharField(max_length=200, help_text="Task name/title")
    group_id = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Group ID to group related maintenance tasks together (e.g., 'PUMP_MAINTENANCE', 'HVAC_CHECK')"
    )
    category = models.CharField(
        max_length=100, 
        blank=True, 
        null=True, 
        help_text="Equipment category this task is typically for (e.g., Fire Pump, HVAC, Elevator)"
    )
    description = models.TextField(help_text="Detailed description of the maintenance task")
    
    # Frequency following ER diagram
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('semi_annual', 'Semi-Annual'),
        ('annual', 'Annual'),
        ('custom', 'Custom'),
    ]
    frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default='monthly',
        help_text="How often this task should be performed"
    )
    
    estimated_duration = models.CharField(
        max_length=50,
        default='0 mins',
        help_text="Estimated duration (e.g., '5 mins', '2 hours')"
    )
    
    # Responsible department following ER diagram
    responsible_department = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Department responsible for this task (e.g., Engineering, MEP Contractor)"
    )
    
    # Additional fields from original design
    steps = models.JSONField(
        default=list, 
        blank=True,
        help_text="List of maintenance steps in JSON format"
    )
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
    
    # Many-to-many relationship with Machine (Equipment)
    machines = models.ManyToManyField(
        'Machine',
        related_name='maintenance_procedures',
        blank=True,
        help_text="Machines (Equipment) that use this maintenance procedure template"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['category', 'frequency', 'name']
        verbose_name = 'Maintenance Task Template'
        verbose_name_plural = 'Maintenance Task Templates'
        indexes = [
            # ✅ PERFORMANCE: Maintenance Task indexes - equipment removed
            models.Index(fields=['category']),  # Filter by equipment category
            models.Index(fields=['frequency']),  # Filter by frequency
            models.Index(fields=['responsible_department']),  # Filter by department
            models.Index(fields=['name']),  # For search
            models.Index(fields=['difficulty_level']),  # For filtering
            models.Index(fields=['created_at']),  # For sorting
            models.Index(fields=['group_id']),  # Filter by task group
        ]
    
    def __str__(self):
        return f"{self.name} ({self.frequency})"
    
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
            
            # Skip validation if step is not a dictionary (legacy string data)
            if not isinstance(step, dict):
                continue
            
            required_fields = ['title', 'description', 'estimated_time']
            
            for field in required_fields:
                if field not in step or not step[field]:
                    errors.append(f"Step {step_num}: Missing or empty '{field}' field")
            
            # Validate estimated_time is positive
            if 'estimated_time' in step and isinstance(step['estimated_time'], (int, float)) and step['estimated_time'] <= 0:
                errors.append(f"Step {step_num}: Estimated time must be positive")
        
        return len(errors) == 0, errors
    
    def get_total_estimated_time(self):
        """Calculate total estimated time for all steps"""
        if not self.steps:
            return 0
        
        total_time = 0
        for step in self.steps:
            # Ensure step is a dictionary before accessing keys
            if isinstance(step, dict) and 'estimated_time' in step and isinstance(step['estimated_time'], (int, float)):
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


class MaintenanceTaskImage(models.Model):
    """Model for storing maintenance task images (before/after)"""
    
    IMAGE_TYPE_CHOICES = [
        ('before', 'Before'),
        ('after', 'After'),
    ]
    
    # Maximum image dimensions
    MAX_SIZE = (800, 800)
    
    id = models.AutoField(primary_key=True)
    
    # FK to MaintenanceTask (MaintenanceProcedure)
    task = models.ForeignKey(
        MaintenanceProcedure,
        on_delete=models.CASCADE,
        related_name='task_images',
        help_text="Maintenance task this image belongs to"
    )
    
    # Image type (Before/After)
    image_type = models.CharField(
        max_length=10,
        choices=IMAGE_TYPE_CHOICES,
        help_text="Type of image (Before or After)"
    )
    
    # Image field
    image_url = models.ImageField(
        upload_to='maintenance_task_images/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])],
        help_text="Image file"
    )
    
    # JPEG version for PDF generation compatibility
    jpeg_path = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Path to JPEG version of the image for PDF generation"
    )
    
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    # Optional: track who uploaded
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_task_images',
        help_text="User who uploaded this image"
    )
    
    class Meta:
        ordering = ['task', 'image_type', '-uploaded_at']
        verbose_name = 'Maintenance Task Image'
        verbose_name_plural = 'Maintenance Task Images'
        indexes = [
            models.Index(fields=['task']),  # FK lookup
            models.Index(fields=['image_type']),  # Filter by type
            models.Index(fields=['uploaded_at']),  # Sort by upload date
            models.Index(fields=['task', 'image_type']),  # Common query pattern
        ]
    
    def __str__(self):
        return f"{self.task.name} - {self.get_image_type_display()} ({self.uploaded_at.strftime('%Y-%m-%d')})"
    
    def process_image(self, image_file, quality=85):
        """Process and resize the image, creating JPEG version for PDF generation compatibility"""
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
            img.save(jpeg_output, 'JPEG', quality=quality, optimize=True)
            jpeg_output.seek(0)
            
            return {'jpeg': jpeg_output}
        except Exception as e:
            raise Exception(f"Error processing image: {e}")
    
    def save(self, *args, **kwargs):
        is_new = self.pk is None
        
        # Process and convert image only if it's a new image
        if is_new and self.image_url:
            try:
                # Process and convert image to JPEG format
                processed_images = self.process_image(self.image_url)
                
                # Generate filename for JPEG version
                image_path = Path(self.image_url.name)
                base_name = image_path.stem
                jpeg_name = f'{base_name}.jpg'
                
                # Save the JPEG version
                jpeg_path = str(image_path.parent / jpeg_name)
                jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(jpeg_full_path), exist_ok=True)
                
                # Save JPEG file
                with open(jpeg_full_path, 'wb') as f:
                    f.write(processed_images['jpeg'].getvalue())
                
                # Store JPEG path for PDF generation
                self.jpeg_path = jpeg_path
                
                # Close the processed image
                processed_images['jpeg'].close()
                
            except Exception as e:
                logger.error(f"Error processing task image: {e}")
                # Don't fail the save if image processing fails
                pass
        
        super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        """Remove image file when model instance is deleted"""
        if self.image_url:
            if os.path.isfile(self.image_url.path):
                os.remove(self.image_url.path)
        
        # Remove JPEG version if exists
        if self.jpeg_path:
            jpeg_full_path = os.path.join(settings.MEDIA_ROOT, self.jpeg_path)
            if os.path.isfile(jpeg_full_path):
                os.remove(jpeg_full_path)
        
        super().delete(*args, **kwargs)


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
        settings.AUTH_USER_MODEL, 
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
        settings.AUTH_USER_MODEL,
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
        verbose_name = 'Recurring Schedule'
        verbose_name_plural = 'Recurring Schedules'
    
    def __str__(self):
        return f"Schedule for {self.maintenance.pm_id}"


class UtilityConsumption(models.Model):
    """
    Model for tracking utility consumption data including electricity and water
    """
    MONTH_CHOICES = [
        (1, 'January'),
        (2, 'February'),
        (3, 'March'),
        (4, 'April'),
        (5, 'May'),
        (6, 'June'),
        (7, 'July'),
        (8, 'August'),
        (9, 'September'),
        (10, 'October'),
        (11, 'November'),
        (12, 'December'),
    ]
    
    id = models.AutoField(primary_key=True)
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='utility_consumptions',
        null=True,
        blank=True,
        help_text="Property associated with this utility consumption record"
    )
    month = models.IntegerField(
        choices=MONTH_CHOICES,
        help_text="Month of consumption (1-12)"
    )
    year = models.IntegerField(
        help_text="Year of consumption",
        default=timezone.now().year
    )
    
    # Electricity fields
    totalkwh = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total kWh consumption"
    )
    onpeakkwh = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="On-peak kWh consumption"
    )
    offpeakkwh = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Off-peak kWh consumption"
    )
    totalelectricity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total electricity cost"
    )
    electricity_cost_budget = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Budgeted electricity cost for the month"
    )
    
    # Water field
    water = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Water consumption (in cubic meters or units)"
    )
    
    # Night sale field
    nightsale = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Night sale revenue or consumption"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_utility_consumptions',
        help_text="User who created this record"
    )
    
    class Meta:
        ordering = ['-year', '-month', 'property']
        verbose_name = 'Utility Consumption'
        verbose_name_plural = 'Utility Consumptions'
        unique_together = [['property', 'month', 'year']]
        indexes = [
            models.Index(fields=['property', 'month', 'year']),
            models.Index(fields=['year', 'month']),
        ]
    
    def __str__(self):
        property_name = self.property.name if self.property else 'No Property'
        return f"{property_name} - {self.get_month_display()} {self.year}"


class Inventory(models.Model):
    """
    Model for tracking inventory items for maintenance engineers
    """
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('low_stock', 'Low Stock'),
        ('out_of_stock', 'Out of Stock'),
        ('reserved', 'Reserved'),
        ('maintenance', 'Under Maintenance'),
    ]
    
    CATEGORY_CHOICES = [
        ('tools', 'Tools'),
        ('parts', 'Parts'),
        ('supplies', 'Supplies'),
        ('equipment', 'Equipment'),
        ('consumables', 'Consumables'),
        ('safety', 'Safety Equipment'),
        ('other', 'Other'),
    ]
    
    id = models.AutoField(primary_key=True)
    item_id = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        editable=False,
        help_text="Unique identifier for the inventory item"
    )
    name = models.CharField(
        max_length=255,
        help_text="Name of the inventory item"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Description of the item"
    )
    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        default='other',
        help_text="Category of the inventory item"
    )
    quantity = models.PositiveIntegerField(
        default=0,
        help_text="Current quantity in stock"
    )
    min_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Minimum quantity threshold for low stock alerts"
    )
    max_quantity = models.PositiveIntegerField(
        default=0,
        null=True,
        blank=True,
        help_text="Maximum quantity capacity"
    )
    unit = models.CharField(
        max_length=50,
        default='pcs',
        help_text="Unit of measurement (e.g., pcs, kg, liters)"
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Unit price of the item"
    )
    location = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Storage location of the item"
    )
    supplier = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Supplier or vendor name"
    )
    supplier_contact = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Supplier contact information"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='available',
        help_text="Current status of the item"
    )
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='inventory_items',
        null=True,
        blank=True,
        help_text="Property associated with this inventory item"
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.SET_NULL,
        related_name='inventory_items',
        null=True,
        blank=True,
        help_text="Room where the item is stored"
    )
    jobs = models.ManyToManyField(
        'Job',
        related_name='inventory_items',
        blank=True,
        help_text="Jobs where this inventory item was used"
    )
    preventive_maintenances = models.ManyToManyField(
        'PreventiveMaintenance',
        related_name='inventory_items',
        blank=True,
        help_text="Preventive maintenance tasks where this inventory item was used"
    )
    last_restocked = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date when item was last restocked"
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expiry date if applicable"
    )
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes about the item"
    )
    image = models.ImageField(
        upload_to='inventory_images/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif'])],
        null=True,
        blank=True,
        help_text="Image of the inventory item"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='created_inventory_items',
        null=True,
        blank=True,
        help_text="User who created this inventory item"
    )
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Inventory Item'
        verbose_name_plural = 'Inventory Items'
        indexes = [
            models.Index(fields=['item_id']),
            models.Index(fields=['category', 'status']),
            models.Index(fields=['property', 'status']),
            models.Index(fields=['status']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate item_id if not provided"""
        if not self.item_id:
            # Generate item_id: INV-YYYYMMDD-XXXX format
            date_str = timezone.now().strftime('%Y%m%d')
            last_item = Inventory.objects.filter(
                item_id__startswith=f'INV-{date_str}'
            ).order_by('-item_id').first()
            
            if last_item and last_item.item_id:
                try:
                    last_num = int(last_item.item_id.split('-')[-1])
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = 1
            else:
                next_num = 1
            
            self.item_id = f'INV-{date_str}-{next_num:04d}'
        
        # Auto-update status based on quantity
        if self.quantity <= 0:
            self.status = 'out_of_stock'
        elif self.quantity < self.min_quantity:
            self.status = 'low_stock'
        elif self.status in ('out_of_stock', 'low_stock') and self.quantity >= self.min_quantity:
            self.status = 'available'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.item_id} - {self.name} ({self.quantity} {self.unit})"


class WorkspaceReport(models.Model):
    """
    Model for creating workspace reports with images, status, descriptions, 
    topic selection, and custom text fields. Supports PDF export.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_review', 'Pending Review'),
        ('in_progress', 'In Progress'),
        ('approved', 'Approved'),
        ('completed', 'Completed'),
        ('rejected', 'Rejected'),
        ('archived', 'Archived'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    # Maximum image dimensions
    MAX_SIZE = (1200, 1200)
    
    id = models.AutoField(primary_key=True)
    report_id = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        editable=False,
        help_text="Unique identifier for the report (auto-generated)"
    )
    
    # Topic/Subject
    topic = models.ForeignKey(
        Topic,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workspace_reports',
        help_text="Topic/Subject of the report"
    )
    custom_topic = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Custom topic if not selecting from predefined topics"
    )
    
    # Main content
    title = models.CharField(
        max_length=255,
        help_text="Report title"
    )
    description = models.TextField(
        help_text="Detailed description of the report"
    )
    
    # Custom text fields for flexible content
    custom_text_1 = models.TextField(
        blank=True,
        null=True,
        verbose_name="Custom Text 1",
        help_text="Additional custom text field (e.g., observations, findings)"
    )
    custom_text_2 = models.TextField(
        blank=True,
        null=True,
        verbose_name="Custom Text 2",
        help_text="Additional custom text field (e.g., recommendations)"
    )
    custom_text_3 = models.TextField(
        blank=True,
        null=True,
        verbose_name="Custom Text 3",
        help_text="Additional custom text field (e.g., action items)"
    )
    
    # Custom field labels (so admin can customize the field names)
    custom_text_1_label = models.CharField(
        max_length=100,
        default="Observations",
        help_text="Label for Custom Text 1 field"
    )
    custom_text_2_label = models.CharField(
        max_length=100,
        default="Recommendations",
        help_text="Label for Custom Text 2 field"
    )
    custom_text_3_label = models.CharField(
        max_length=100,
        default="Action Items",
        help_text="Label for Custom Text 3 field"
    )
    
    # Status and priority
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Current status of the report"
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default='medium',
        help_text="Priority level of the report"
    )
    
    # Images
    image_1 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 1",
        help_text="Primary image for the report"
    )
    image_1_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 1"
    )
    
    image_2 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 2",
        help_text="Secondary image for the report"
    )
    image_2_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 2"
    )
    
    image_3 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 3",
        help_text="Third image for the report"
    )
    image_3_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 3"
    )
    
    image_4 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 4",
        help_text="Fourth image for the report"
    )
    image_4_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 4"
    )
    
    # Additional images (5-15) for single-page PDF grid layout
    image_5 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 5",
        help_text="Image 5 for the report"
    )
    image_5_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 5"
    )
    
    image_6 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 6",
        help_text="Image 6 for the report"
    )
    image_6_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 6"
    )
    
    image_7 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 7",
        help_text="Image 7 for the report"
    )
    image_7_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 7"
    )
    
    image_8 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 8",
        help_text="Image 8 for the report"
    )
    image_8_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 8"
    )
    
    image_9 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 9",
        help_text="Image 9 for the report"
    )
    image_9_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 9"
    )
    
    image_10 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 10",
        help_text="Image 10 for the report"
    )
    image_10_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 10"
    )
    
    image_11 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 11",
        help_text="Image 11 for the report"
    )
    image_11_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 11"
    )
    
    image_12 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 12",
        help_text="Image 12 for the report"
    )
    image_12_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 12"
    )
    
    image_13 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 13",
        help_text="Image 13 for the report"
    )
    image_13_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 13"
    )
    
    image_14 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 14",
        help_text="Image 14 for the report"
    )
    image_14_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 14"
    )
    
    image_15 = models.ImageField(
        upload_to='workspace_reports/%Y/%m/',
        validators=[FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
        null=True,
        blank=True,
        verbose_name="Image 15",
        help_text="Image 15 for the report"
    )
    image_15_caption = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Caption for Image 15"
    )
    
    # JPEG paths for PDF generation (all 15 images)
    image_1_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_2_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_3_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_4_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_5_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_6_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_7_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_8_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_9_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_10_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_11_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_12_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_13_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_14_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    image_15_jpeg_path = models.CharField(max_length=500, null=True, blank=True)
    
    # Relationships
    property = models.ForeignKey(
        Property,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workspace_reports',
        help_text="Property associated with this report"
    )
    
    # Supplier information
    supplier = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Supplier or vendor name"
    )
    
    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_workspace_reports',
        help_text="User who created this report"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_workspace_reports',
        help_text="User who last updated this report"
    )
    
    # Date fields
    report_date = models.DateField(
        default=timezone.now,
        help_text="Date of the report"
    )
    due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Due date for any actions required"
    )
    completed_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when report actions were completed"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Additional notes
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes or comments"
    )
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Workspace Report'
        verbose_name_plural = 'Workspace Reports'
        indexes = [
            models.Index(fields=['report_id']),
            models.Index(fields=['status']),
            models.Index(fields=['priority']),
            models.Index(fields=['property']),
            models.Index(fields=['topic']),
            models.Index(fields=['created_by']),
            models.Index(fields=['report_date']),
            models.Index(fields=['created_at']),
            models.Index(fields=['status', 'priority']),
            models.Index(fields=['property', 'status']),
        ]
    
    def __str__(self):
        return f"{self.report_id} - {self.title}"
    
    def save(self, *args, **kwargs):
        # Generate report_id if not set
        if not self.report_id:
            date_str = timezone.now().strftime('%Y%m%d')
            last_report = WorkspaceReport.objects.filter(
                report_id__startswith=f'RPT-{date_str}'
            ).order_by('-report_id').first()
            
            if last_report and last_report.report_id:
                try:
                    last_num = int(last_report.report_id.split('-')[-1])
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = 1
            else:
                next_num = 1
            
            self.report_id = f'RPT-{date_str}-{next_num:04d}'
        
        # Process images and create JPEG versions for PDF (all 15 images)
        for i in range(1, 16):
            image_field = getattr(self, f'image_{i}', None)
            if image_field and hasattr(self, f'_image_{i}_changed') and getattr(self, f'_image_{i}_changed'):
                jpeg_path = self._process_image_to_jpeg(image_field)
                if jpeg_path:
                    setattr(self, f'image_{i}_jpeg_path', jpeg_path)
                setattr(self, f'_image_{i}_changed', False)
        
        super().save(*args, **kwargs)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Store original image paths to detect changes (all 15 images)
        for i in range(1, 16):
            setattr(self, f'_original_image_{i}', getattr(self, f'image_{i}', None))
            setattr(self, f'_image_{i}_changed', False)
    
    def clean(self):
        super().clean()
        # Mark images as changed if they differ from the original (all 15 images)
        for i in range(1, 16):
            original = getattr(self, f'_original_image_{i}', None)
            current = getattr(self, f'image_{i}', None)
            if current != original:
                setattr(self, f'_image_{i}_changed', True)
    
    def _process_image_to_jpeg(self, image_field, quality=85):
        """Process image and create JPEG version for PDF generation"""
        if not image_field:
            return None
        
        try:
            img = Image.open(image_field)
            
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
            
            # Generate JPEG path
            image_path = Path(image_field.name)
            jpeg_name = f'{image_path.stem}.jpg'
            jpeg_path = str(image_path.parent / jpeg_name)
            jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(jpeg_full_path), exist_ok=True)
            
            # Save JPEG file
            img.save(jpeg_full_path, 'JPEG', quality=quality, optimize=True)
            
            return jpeg_path
            
        except Exception as e:
            logger.error(f"Error processing image for WorkspaceReport: {e}")
            return None
    
    def get_topic_display(self):
        """Return the topic name (custom or from Topic model)"""
        if self.custom_topic:
            return self.custom_topic
        if self.topic:
            return self.topic.title
        return "No Topic"
    
    def get_images(self):
        """Return a list of all images with their captions (up to 15 images)"""
        images = []
        for i in range(1, 16):
            image = getattr(self, f'image_{i}', None)
            caption = getattr(self, f'image_{i}_caption', None) or f'Image {i}'
            if image:
                images.append({
                    'image': image,
                    'caption': caption,
                    'jpeg_path': getattr(self, f'image_{i}_jpeg_path', None)
                })
        return images
    
    def delete(self, *args, **kwargs):
        """Remove image files when model instance is deleted (all 15 images)"""
        for i in range(1, 16):
            image_field = getattr(self, f'image_{i}', None)
            if image_field and hasattr(image_field, 'path') and os.path.isfile(image_field.path):
                try:
                    os.remove(image_field.path)
                except OSError:
                    pass
            
            # Remove JPEG version
            jpeg_path = getattr(self, f'image_{i}_jpeg_path', None)
            if jpeg_path:
                jpeg_full_path = os.path.join(settings.MEDIA_ROOT, jpeg_path)
                if os.path.isfile(jpeg_full_path):
                    try:
                        os.remove(jpeg_full_path)
                    except OSError:
                        pass
        
        super().delete(*args, **kwargs)
