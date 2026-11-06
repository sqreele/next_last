import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0096_pending_job_image')]
    operations = [
        migrations.CreateModel(name='DemoJobMachine', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('job', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='demo_machine', to='myappLubd.job')),
            ('machine', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='myappLubd.machine')),
        ]),
        migrations.CreateModel(name='DemoJobDocument', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('file', models.FileField(upload_to='demo_documents/%Y/%m/')),
            ('name', models.CharField(max_length=200)),
            ('size', models.PositiveIntegerField()),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='demo_documents', to='myappLubd.job')),
        ]),
    ]
