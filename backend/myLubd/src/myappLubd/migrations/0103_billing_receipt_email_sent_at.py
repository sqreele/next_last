from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0102_company_property_billing')]

    operations = [
        migrations.AddField(
            model_name='billinginvoice',
            name='receipt_email_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
