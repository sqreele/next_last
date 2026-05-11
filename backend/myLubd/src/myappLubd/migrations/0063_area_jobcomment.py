from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("myappLubd", "0062_topic_is_visible_in_create_job"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Area",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=150)),
                ("description", models.TextField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "property",
                    models.ForeignKey(
                        help_text="Property this area belongs to",
                        on_delete=models.deletion.CASCADE,
                        related_name="areas",
                        to="myappLubd.property",
                    ),
                ),
            ],
            options={
                "verbose_name": "Area",
                "verbose_name_plural": "Areas",
                "ordering": ["name"],
            },
        ),
        migrations.AddConstraint(
            model_name="area",
            constraint=models.UniqueConstraint(
                fields=("property", "name"),
                name="unique_area_name_per_property",
            ),
        ),
        migrations.AddIndex(
            model_name="area",
            index=models.Index(
                fields=["property", "is_active"],
                name="myappLubd_a_propert_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="area",
            index=models.Index(
                fields=["name"],
                name="myappLubd_a_name_idx",
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="area",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional area/zone where this job is performed",
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="jobs",
                to="myappLubd.area",
            ),
        ),
        migrations.CreateModel(
            name="JobComment",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("comment", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "job",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="comments",
                        to="myappLubd.job",
                    ),
                ),
                (
                    "author",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="job_comments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Job Comment",
                "verbose_name_plural": "Job Comments",
                "ordering": ["created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="jobcomment",
            index=models.Index(
                fields=["job", "created_at"],
                name="myappLubd_j_job_idx",
            ),
        ),
    ]
