from django.db import migrations


CREATED_MESSAGE = 'Created through the application.'
COMPLETED_MESSAGE = 'Changed status to Completed through the application.'


def backfill_job_history(apps, schema_editor):
    Job = apps.get_model('myappLubd', 'Job')
    ContentType = apps.get_model('contenttypes', 'ContentType')
    LogEntry = apps.get_model('admin', 'LogEntry')

    content_type = ContentType.objects.get(app_label='myappLubd', model='job')
    jobs_with_history = set(
        LogEntry.objects.filter(content_type_id=content_type.pk)
        .values_list('object_id', flat=True)
    )
    status_labels = {
        'pending': 'Pending',
        'in_progress': 'In Progress',
        'waiting_sparepart': 'Waiting Sparepart',
        'completed': 'Completed',
        'cancelled': 'Cancelled',
    }
    entries = []

    for job in Job.objects.exclude(pk__in=jobs_with_history).iterator(chunk_size=1000):
        object_repr = (
            f'Job {job.job_id} - {status_labels.get(job.status, job.status)}'
        )[:200]
        entries.append(LogEntry(
            action_time=job.created_at,
            user_id=job.user_id,
            content_type_id=content_type.pk,
            object_id=str(job.pk),
            object_repr=object_repr,
            action_flag=1,
            change_message=CREATED_MESSAGE,
        ))
        if job.completed_at:
            entries.append(LogEntry(
                action_time=job.completed_at,
                user_id=job.updated_by_id or job.user_id,
                content_type_id=content_type.pk,
                object_id=str(job.pk),
                object_repr=object_repr,
                action_flag=2,
                change_message=COMPLETED_MESSAGE,
            ))

        if len(entries) >= 1000:
            LogEntry.objects.bulk_create(entries)
            entries = []

    if entries:
        LogEntry.objects.bulk_create(entries)


class Migration(migrations.Migration):

    dependencies = [
        ('admin', '0003_logentry_add_action_flag_choices'),
        ('myappLubd', '0092_job_soft_delete'),
    ]

    operations = [
        migrations.RunPython(
            backfill_job_history,
            migrations.RunPython.noop,
        ),
    ]
