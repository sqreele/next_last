"""Shared administration."""
import os
from django.contrib import admin
from django.utils.html import format_html, format_html_join
from django.utils import timezone
from django import forms
from django.db.models import Count
from django.conf import settings
from io import BytesIO


def _absolute_file_url(request, file_field):
    """Return an absolute URL for a file field so CSV exports can link images."""
    if not file_field or not hasattr(file_field, 'url'):
        return ''
    try:
        url = file_field.url
    except ValueError:
        return ''
    if request is not None:
        return request.build_absolute_uri(url)
    return url


def _spreadsheet_image_formula(image_url):
    """Return a spreadsheet IMAGE formula for apps that can render image URLs."""
    if not image_url:
        return ''
    escaped_url = image_url.replace('"', '""')
    return f'=IMAGE("{escaped_url}")'


def _image_export_note(image_count):
    """Explain how image data appears in CSV exports.

    CSV files are plain text and cannot contain embedded image binaries. The
    export includes both direct URLs and optional spreadsheet formulas instead,
    so users can either click the links or render the images in spreadsheet apps
    that support IMAGE formulas.
    """
    if image_count <= 0:
        return 'No images attached to this record.'
    if image_count == 1:
        return 'CSV cannot embed images; open the Image URL or use the IMAGE formula in a supported spreadsheet.'
    return f'CSV cannot embed images; {image_count} image URLs/formulas are separated by new lines.'


class UnsupportedExcelImagePreview(ValueError):
    """Raised when an upload should be exported as a URL instead of an XLSX preview."""


def _excel_image_for_export(image_path, drawing_image_cls):
    """Return an openpyxl image that is safe to save inside an XLSX file.

    openpyxl can instantiate previews for some upload formats that XLSX
    packaging cannot save reliably. Convert uncommon camera/phone formats to
    a small PNG preview before embedding them.
    """
    from io import BytesIO
    from PIL import Image as PILImage

    supported_formats = {'gif', 'jpeg', 'png'}
    supported_extensions = {'.gif', '.jpeg', '.jpg', '.png'}

    image_extension = os.path.splitext(image_path)[1].lower()
    max_convert_pixels = 50_000_000

    with PILImage.open(image_path) as pil_image:
        image_format = (pil_image.format or '').lower()
        if image_format in supported_formats and image_extension in supported_extensions:
            return drawing_image_cls(image_path), None

        width, height = pil_image.size
        if width * height > max_convert_pixels:
            pil_image.thumbnail((3000, 3000))

        # Use the first frame for multi-picture formats such as MPO. Convert to
        # an Excel-friendly color mode before saving as PNG.
        try:
            pil_image.seek(0)
        except EOFError:
            pass

        # Build only a small preview for Excel. Some phone/camera uploads can
        # be very large, and encoding the full image can exceed the gunicorn
        # request timeout while exporting.
        max_preview_size = (120, 90)
        converted = pil_image.copy()
        converted.thumbnail(max_preview_size)
        if converted.mode not in ('RGB', 'RGBA'):
            converted = converted.convert('RGB')

        buffer = BytesIO()
        buffer.name = 'image.png'
        converted.save(buffer, format='PNG', optimize=False)
        buffer.seek(0)
        return drawing_image_cls(buffer), buffer


def create_month_filter(date_field, filter_title=None, param_name=None):
    """
    Factory function to create a month filter for any date field.
    Usage: CreatedAtMonthFilter = create_month_filter('created_at', 'Created Month', 'created_month')
    """
    class MonthFilter(admin.SimpleListFilter):
        title = filter_title or f'{date_field.replace("_", " ").title()} Month'
        parameter_name = param_name or f'{date_field}_month'

        def lookups(self, request, model_admin):
            # Get distinct year-month combinations from the database
            from django.db.models.functions import TruncMonth
            from django.db.models import Count

            try:
                # Get all distinct months from the date field
                queryset = model_admin.get_queryset(request)
                dates = (
                    queryset
                    .exclude(**{f'{date_field}__isnull': True})
                    .annotate(month=TruncMonth(date_field))
                    .values('month')
                    .annotate(count=Count('id'))
                    .order_by('-month')
                )

                months = []
                for entry in dates:
                    if entry['month']:
                        month_str = entry['month'].strftime('%Y-%m')
                        month_display = entry['month'].strftime('%B %Y')
                        months.append((month_str, f"{month_display} ({entry['count']})"))

                return months
            except Exception:
                return []

        def queryset(self, request, queryset):
            if self.value():
                try:
                    year, month = self.value().split('-')
                    return queryset.filter(**{
                        f'{date_field}__year': int(year),
                        f'{date_field}__month': int(month)
                    })
                except (ValueError, TypeError):
                    pass
            return queryset

    return MonthFilter


CreatedAtMonthFilter = create_month_filter('created_at', 'Created Month', 'created_month')


UpdatedAtMonthFilter = create_month_filter('updated_at', 'Updated Month', 'updated_month')


UploadedAtMonthFilter = create_month_filter('uploaded_at', 'Uploaded Month', 'uploaded_month')


ScheduledDateMonthFilter = create_month_filter('scheduled_date', 'Scheduled Month', 'scheduled_month')


CompletedDateMonthFilter = create_month_filter('completed_date', 'Completed Month', 'completed_month')


DueDateMonthFilter = create_month_filter('next_due_date', 'Due Date Month', 'due_month')


LastRestockedMonthFilter = create_month_filter('last_restocked', 'Restocked Month', 'restocked_month')


ExpiryDateMonthFilter = create_month_filter('expiry_date', 'Expiry Month', 'expiry_month')


InstallationDateMonthFilter = create_month_filter('installation_date', 'Installation Month', 'installation_month')


LastMaintenanceDateMonthFilter = create_month_filter('last_maintenance_date', 'Last Maintenance Month', 'last_maintenance_month')


CompletedAtMonthFilter = create_month_filter('completed_at', 'Completed Month', 'completed_month')


TimestampMonthFilter = create_month_filter('timestamp', 'Timestamp Month', 'timestamp_month')


NextOccurrenceMonthFilter = create_month_filter('next_occurrence', 'Next Occurrence Month', 'next_occurrence_month')


LastOccurrenceMonthFilter = create_month_filter('last_occurrence', 'Last Occurrence Month', 'last_occurrence_month')


ExpiresAtMonthFilter = create_month_filter('expires_at', 'Expires Month', 'expires_month')


class CreatedAtBeforeYearFilter(admin.SimpleListFilter):
    title = 'created before year'
    parameter_name = 'created_before_year'

    def lookups(self, request, model_admin):
        try:
            queryset = model_admin.get_queryset(request).exclude(created_at__isnull=True)
            years = queryset.dates('created_at', 'year', order='DESC')
            lookups = []

            for year_date in years:
                year = year_date.year
                start_of_year = timezone.datetime(year, 1, 1)
                if settings.USE_TZ and timezone.is_naive(start_of_year):
                    start_of_year = timezone.make_aware(start_of_year, timezone.get_current_timezone())
                count = queryset.filter(created_at__lt=start_of_year).count()
                if count:
                    lookups.append((str(year), f"Before {year} ({count})"))

            return lookups
        except Exception:
            return []

    def queryset(self, request, queryset):
        if self.value():
            try:
                year = int(self.value())
                start_of_year = timezone.datetime(year, 1, 1)
                if settings.USE_TZ and timezone.is_naive(start_of_year):
                    start_of_year = timezone.make_aware(start_of_year, timezone.get_current_timezone())
                return queryset.filter(created_at__lt=start_of_year)
            except (TypeError, ValueError):
                return queryset
        return queryset


class DatalistTextInput(forms.TextInput):
    """Text input that renders its configured values as datalist suggestions."""

    def __init__(self, *args, suggestions=(), **kwargs):
        super().__init__(*args, **kwargs)
        self.suggestions = suggestions

    def render(self, name, value, attrs=None, renderer=None):
        attrs = attrs.copy() if attrs else {}
        input_id = attrs.get('id', f'id_{name}')
        datalist_id = attrs.get('list', f'{input_id}_suggestions')
        attrs['list'] = datalist_id
        text_input = super().render(name, value, attrs, renderer)
        options = format_html_join(
            '',
            '<option value="{}"></option>',
            ((suggestion,) for suggestion in self.suggestions),
        )
        return format_html(
            '{}<datalist id="{}">{}</datalist>',
            text_input,
            datalist_id,
            options,
        )
