from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("myappLubd", "0057_add_user_uses_roster"),
    ]

    operations = [
        migrations.CreateModel(
            name="RosterLeave",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("staff_id", models.CharField(max_length=10)),
                ("week", models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(53)])),
                ("day", models.CharField(choices=[("Mon", "Monday"), ("Tue", "Tuesday"), ("Wed", "Wednesday"), ("Thu", "Thursday"), ("Fri", "Friday"), ("Sat", "Saturday"), ("Sun", "Sunday")], max_length=3)),
                ("leave_type", models.CharField(choices=[("PH", "PH"), ("VC", "VC")], max_length=2)),
                ("note", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="roster_leaves", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="rosterleave",
            constraint=models.UniqueConstraint(fields=("created_by", "staff_id", "week", "day"), name="uniq_roster_leave_entry"),
        ),
    ]
