from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0071_pm_master_plan'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobcomment',
            name='client_comment_request_id',
            field=models.UUIDField(
                blank=True,
                editable=False,
                help_text=(
                    'Immutable client identity used to deduplicate one logical '
                    'comment submission.'
                ),
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name='jobcomment',
            constraint=models.UniqueConstraint(
                condition=models.Q(client_comment_request_id__isnull=False),
                fields=('author', 'job', 'client_comment_request_id'),
                name='uniq_job_comment_request',
            ),
        ),
    ]
