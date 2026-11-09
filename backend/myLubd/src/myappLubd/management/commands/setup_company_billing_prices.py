import stripe
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from myappLubd.billing.company_service import catalog_price
from myappLubd.billing.stripe_service import _configure_stripe
from myappLubd.models import BillingPrice


class Command(BaseCommand):
    help = 'Explicit test-mode property price setup. Dry-run by default; never changes an existing catalog price.'

    def add_arguments(self, parser):
        parser.add_argument('--currency', choices=['usd', 'thb'], required=True)
        parser.add_argument('--thb-unit-minor', type=int)
        parser.add_argument('--price-id')
        parser.add_argument('--create', action='store_true')
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        from django.conf import settings
        currency = options['currency']
        unit = 2000 if currency == 'usd' else options['thb_unit_minor']
        if not unit or unit <= 0:
            raise CommandError('Provide an explicitly approved positive THB unit price in satang.')
        if not options['apply']:
            self.stdout.write(f'DRY RUN: {currency.upper()} {unit} minor units per Property per month; no changes.')
            return
        _configure_stripe()
        if not str(settings.STRIPE_SECRET_KEY).startswith('sk_test_'):
            raise CommandError('Only Stripe test mode is supported.')
        method = 'card' if currency == 'usd' else 'promptpay'
        existing = BillingPrice.objects.filter(currency=currency).first()
        if existing:
            if existing.unit_amount_minor != unit or (options['price_id'] and existing.stripe_price_id != options['price_id']):
                raise CommandError('An existing catalog is never overwritten. Review a separate price migration.')
            catalog_price(method)
            self.stdout.write('Existing catalog validated; unchanged.')
            return
        if options['price_id']:
            remote = stripe.Price.retrieve(options['price_id'])
        elif options['create']:
            other = BillingPrice.objects.filter(livemode=False).first()
            product = stripe.Product.retrieve(other.stripe_product_id) if other else stripe.Product.create(
                name='StayMaint Property Subscription', metadata={'billing_model': 'property_quantity_v1'},
                idempotency_key='staymaint-company-product-test-v1')
            remote = stripe.Price.create(product=product.id, currency=currency, unit_amount=unit,
                recurring={'interval': 'month', 'usage_type': 'licensed'},
                idempotency_key=f'staymaint-company-price-test-{currency}-{unit}-v1')
        else:
            raise CommandError('Supply --price-id to reuse or --create to explicitly create test objects.')
        product = stripe.Product.retrieve(remote.product)
        if product.livemode or product.name != 'StayMaint Property Subscription':
            raise CommandError('Use the approved test-mode StayMaint Property Subscription product.')
        other = BillingPrice.objects.filter(livemode=False).first()
        if other and remote.product != other.stripe_product_id:
            raise CommandError('USD and THB prices must use the same approved StayMaint product.')
        with transaction.atomic():
            BillingPrice.objects.create(currency=currency, stripe_product_id=remote.product,
                stripe_price_id=remote.id, unit_amount_minor=unit, livemode=False)
            catalog_price(method)
        self.stdout.write(f'{currency.upper()} test catalog saved and validated.')
