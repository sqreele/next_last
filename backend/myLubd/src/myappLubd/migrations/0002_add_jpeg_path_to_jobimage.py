# Generated manually to add jpeg_path field to JobImage model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobimage',
            name='jpeg_path',
            field=models.CharField(
                blank=True,
                help_text='Path to JPEG version of the image for PDF generation',
                max_length=500,
                null=True
            ),
        ),
    ]
