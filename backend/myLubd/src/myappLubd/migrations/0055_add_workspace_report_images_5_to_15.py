# Generated migration to add image fields 5-15 to WorkspaceReport model
# for single-page PDF with grid layout of up to 15 images

from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0054_add_supplier_to_workspace_report'),
    ]

    operations = [
        # Image 5
        migrations.AddField(
            model_name='workspacereport',
            name='image_5',
            field=models.ImageField(
                blank=True,
                help_text='Image 5 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 5'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_5_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 5', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_5_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 6
        migrations.AddField(
            model_name='workspacereport',
            name='image_6',
            field=models.ImageField(
                blank=True,
                help_text='Image 6 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 6'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_6_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 6', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_6_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 7
        migrations.AddField(
            model_name='workspacereport',
            name='image_7',
            field=models.ImageField(
                blank=True,
                help_text='Image 7 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 7'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_7_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 7', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_7_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 8
        migrations.AddField(
            model_name='workspacereport',
            name='image_8',
            field=models.ImageField(
                blank=True,
                help_text='Image 8 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 8'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_8_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 8', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_8_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 9
        migrations.AddField(
            model_name='workspacereport',
            name='image_9',
            field=models.ImageField(
                blank=True,
                help_text='Image 9 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 9'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_9_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 9', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_9_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 10
        migrations.AddField(
            model_name='workspacereport',
            name='image_10',
            field=models.ImageField(
                blank=True,
                help_text='Image 10 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 10'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_10_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 10', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_10_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 11
        migrations.AddField(
            model_name='workspacereport',
            name='image_11',
            field=models.ImageField(
                blank=True,
                help_text='Image 11 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 11'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_11_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 11', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_11_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 12
        migrations.AddField(
            model_name='workspacereport',
            name='image_12',
            field=models.ImageField(
                blank=True,
                help_text='Image 12 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 12'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_12_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 12', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_12_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 13
        migrations.AddField(
            model_name='workspacereport',
            name='image_13',
            field=models.ImageField(
                blank=True,
                help_text='Image 13 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 13'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_13_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 13', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_13_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 14
        migrations.AddField(
            model_name='workspacereport',
            name='image_14',
            field=models.ImageField(
                blank=True,
                help_text='Image 14 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 14'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_14_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 14', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_14_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        
        # Image 15
        migrations.AddField(
            model_name='workspacereport',
            name='image_15',
            field=models.ImageField(
                blank=True,
                help_text='Image 15 for the report',
                null=True,
                upload_to='workspace_reports/%Y/%m/',
                validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])],
                verbose_name='Image 15'
            ),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_15_caption',
            field=models.CharField(blank=True, help_text='Caption for Image 15', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='workspacereport',
            name='image_15_jpeg_path',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
    ]
