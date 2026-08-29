import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0079_auth_identity'),
    ]

    operations = [
        migrations.CreateModel(
            name='TenantInvitation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('role', models.CharField(choices=[('owner', 'Owner'), ('admin', 'Admin'), ('manager', 'Manager'), ('supervisor', 'Supervisor'), ('technician', 'Technician'), ('viewer', 'Viewer'), ('billing', 'Billing')], max_length=20)),
                ('token_hash', models.CharField(editable=False, max_length=64, unique=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('accepted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='accepted_tenant_invitations', to=settings.AUTH_USER_MODEL)),
                ('invited_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_tenant_invitations', to=settings.AUTH_USER_MODEL)),
                ('properties', models.ManyToManyField(blank=True, related_name='tenant_invitations', to='myappLubd.property')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invitations', to='myappLubd.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['tenant', 'created_at'], name='tenant_invite_created_idx')],
                'constraints': [
                    # Phase A MVP limitation: unresolved email uniqueness is
                    # global and must become tenant-scoped before public
                    # multi-organization launch.
                    models.UniqueConstraint(condition=models.Q(accepted_at__isnull=True, revoked_at__isnull=True), fields=('email',), name='unique_pending_invitation_email'),
                    models.CheckConstraint(check=models.Q(models.Q(accepted_at__isnull=True, accepted_by__isnull=True), models.Q(accepted_at__isnull=False, accepted_by__isnull=False), _connector='OR'), name='invitation_acceptance_actor_consistent'),
                    models.CheckConstraint(check=models.Q(accepted_at__isnull=True) | models.Q(revoked_at__isnull=True), name='invitation_not_accepted_and_revoked'),
                ],
            },
        ),
    ]
