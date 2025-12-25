from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('myappLubd', '0052_inventory_m2m_job_pm'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkspaceReport',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('report_id', models.CharField(
                    blank=True,
                    editable=False,
                    help_text='Unique identifier for the report (auto-generated)',
                    max_length=50,
                    unique=True
                )),
                ('custom_topic', models.CharField(
                    blank=True,
                    help_text='Custom topic if not selecting from predefined topics',
                    max_length=255,
                    null=True
                )),
                ('title', models.CharField(
                    help_text='Report title',
                    max_length=255
                )),
                ('description', models.TextField(
                    help_text='Detailed description of the report'
                )),
                ('custom_text_1', models.TextField(
                    blank=True,
                    help_text='Additional custom text field (e.g., observations, findings)',
                    null=True,
                    verbose_name='Custom Text 1'
                )),
                ('custom_text_2', models.TextField(
                    blank=True,
                    help_text='Additional custom text field (e.g., recommendations)',
                    null=True,
                    verbose_name='Custom Text 2'
                )),
                ('custom_text_3', models.TextField(
                    blank=True,
                    help_text='Additional custom text field (e.g., action items)',
                    null=True,
                    verbose_name='Custom Text 3'
                )),
                ('custom_text_1_label', models.CharField(
                    default='Observations',
                    help_text='Label for Custom Text 1 field',
                    max_length=100
                )),
                ('custom_text_2_label', models.CharField(
                    default='Recommendations',
                    help_text='Label for Custom Text 2 field',
                    max_length=100
                )),
                ('custom_text_3_label', models.CharField(
                    default='Action Items',
                    help_text='Label for Custom Text 3 field',
                    max_length=100
                )),
                ('status', models.CharField(
                    choices=[
                        ('draft', 'Draft'),
                        ('pending_review', 'Pending Review'),
                        ('in_progress', 'In Progress'),
                        ('approved', 'Approved'),
                        ('completed', 'Completed'),
                        ('rejected', 'Rejected'),
                        ('archived', 'Archived')
                    ],
                    default='draft',
                    help_text='Current status of the report',
                    max_length=20
                )),
                ('priority', models.CharField(
                    choices=[
                        ('low', 'Low'),
                        ('medium', 'Medium'),
                        ('high', 'High'),
                        ('urgent', 'Urgent')
                    ],
                    default='medium',
                    help_text='Priority level of the report',
                    max_length=20
                )),
                ('image_1', models.ImageField(
                    blank=True,
                    help_text='Primary image for the report',
                    null=True,
                    upload_to='workspace_reports/%Y/%m/',
                    validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                    verbose_name='Image 1'
                )),
                ('image_1_caption', models.CharField(
                    blank=True,
                    help_text='Caption for Image 1',
                    max_length=255,
                    null=True
                )),
                ('image_2', models.ImageField(
                    blank=True,
                    help_text='Secondary image for the report',
                    null=True,
                    upload_to='workspace_reports/%Y/%m/',
                    validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                    verbose_name='Image 2'
                )),
                ('image_2_caption', models.CharField(
                    blank=True,
                    help_text='Caption for Image 2',
                    max_length=255,
                    null=True
                )),
                ('image_3', models.ImageField(
                    blank=True,
                    help_text='Third image for the report',
                    null=True,
                    upload_to='workspace_reports/%Y/%m/',
                    validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                    verbose_name='Image 3'
                )),
                ('image_3_caption', models.CharField(
                    blank=True,
                    help_text='Caption for Image 3',
                    max_length=255,
                    null=True
                )),
                ('image_4', models.ImageField(
                    blank=True,
                    help_text='Fourth image for the report',
                    null=True,
                    upload_to='workspace_reports/%Y/%m/',
                    validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                    verbose_name='Image 4'
                )),
                ('image_4_caption', models.CharField(
                    blank=True,
                    help_text='Caption for Image 4',
                    max_length=255,
                    null=True
                )),
                ('image_1_jpeg_path', models.CharField(blank=True, max_length=500, null=True)),
                ('image_2_jpeg_path', models.CharField(blank=True, max_length=500, null=True)),
                ('image_3_jpeg_path', models.CharField(blank=True, max_length=500, null=True)),
                ('image_4_jpeg_path', models.CharField(blank=True, max_length=500, null=True)),
                ('report_date', models.DateField(
                    default=django.utils.timezone.now,
                    help_text='Date of the report'
                )),
                ('due_date', models.DateField(
                    blank=True,
                    help_text='Due date for any actions required',
                    null=True
                )),
                ('completed_date', models.DateField(
                    blank=True,
                    help_text='Date when report actions were completed',
                    null=True
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('notes', models.TextField(
                    blank=True,
                    help_text='Additional notes or comments',
                    null=True
                )),
                ('created_by', models.ForeignKey(
                    blank=True,
                    help_text='User who created this report',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_workspace_reports',
                    to=settings.AUTH_USER_MODEL
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    help_text='User who last updated this report',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='updated_workspace_reports',
                    to=settings.AUTH_USER_MODEL
                )),
                ('property', models.ForeignKey(
                    blank=True,
                    help_text='Property associated with this report',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='workspace_reports',
                    to='myappLubd.property'
                )),
                ('topic', models.ForeignKey(
                    blank=True,
                    help_text='Topic/Subject of the report',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='workspace_reports',
                    to='myappLubd.topic'
                )),
            ],
            options={
                'verbose_name': 'Workspace Report',
                'verbose_name_plural': 'Workspace Reports',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['report_id'], name='myappLubd_w_report__b5c123_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['status'], name='myappLubd_w_status_a1d234_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['priority'], name='myappLubd_w_priorit_c2e345_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['property'], name='myappLubd_w_propert_d3f456_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['topic'], name='myappLubd_w_topic_i_e4g567_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['created_by'], name='myappLubd_w_created_f5h678_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['report_date'], name='myappLubd_w_report__g6i789_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['created_at'], name='myappLubd_w_created_h7j890_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['status', 'priority'], name='myappLubd_w_status__i8k901_idx'),
        ),
        migrations.AddIndex(
            model_name='workspacereport',
            index=models.Index(fields=['property', 'status'], name='myappLubd_w_propert_j9l012_idx'),
        ),
    ]
