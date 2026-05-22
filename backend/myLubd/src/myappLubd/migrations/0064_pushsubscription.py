from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("myappLubd", "0063_area_jobcomment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PushSubscription",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("endpoint", models.URLField(max_length=512, unique=True)),
                ("p256dh", models.CharField(help_text="Client public key (base64url).", max_length=255)),
                ("auth", models.CharField(help_text="Client auth secret (base64url).", max_length=255)),
                ("user_agent", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="push_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Push subscription",
                "verbose_name_plural": "Push subscriptions",
            },
        ),
        migrations.AddIndex(
            model_name="pushsubscription",
            index=models.Index(fields=["user", "is_active"], name="myappLubd_p_user_id_2c6c80_idx"),
        ),
    ]
