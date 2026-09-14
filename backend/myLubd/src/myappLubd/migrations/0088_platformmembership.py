# Generated manually because the local audit environment has no Django runtime.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('myappLubd', '0087_pm_line_reminder_delivery'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('platform_super_admin', 'Platform super admin'), ('platform_billing_admin', 'Platform billing admin'), ('platform_support', 'Platform support')], max_length=32)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('granted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='granted_platform_memberships', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='platform_memberships', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['user__username', 'role'],
                'indexes': [models.Index(fields=['user', 'is_active'], name='platform_member_active_idx')],
                'constraints': [models.UniqueConstraint(fields=('user', 'role'), name='unique_user_platform_membership_role')],
            },
        ),
    ]
