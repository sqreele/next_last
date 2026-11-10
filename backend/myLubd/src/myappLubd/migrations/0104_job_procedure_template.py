from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0103_billing_receipt_email_sent_at')]

    operations = [migrations.AddField(
        model_name='job', name='procedure_template',
        field=models.ForeignKey(blank=True, help_text='PM template selected for this machine work order', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='jobs', to='myappLubd.maintenanceprocedure'),
    )]
