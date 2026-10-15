from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('myappLubd', '0094_room_name_per_property'),
    ]

    operations = [
        migrations.AlterField(
            model_name='job',
            name='priority',
            field=models.CharField(
                choices=[
                    ('low', 'Low'),
                    ('medium', 'Medium'),
                    ('high', 'High'),
                    ('critical', 'Critical'),
                ],
                default='medium',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='jobimage',
            name='image_type',
            field=models.CharField(
                choices=[('before', 'Before'), ('after', 'After')],
                db_index=True,
                default='before',
                help_text='Whether this image documents the issue before or after work.',
                max_length=10,
            ),
        ),
    ]
