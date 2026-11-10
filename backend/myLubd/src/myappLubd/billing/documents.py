"""Non-VAT Thai commercial documents. No payment state is accepted from clients."""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from ..models import BillingInvoice, BillingProfile, BillingIssuerSettings
from .stripe_service import StripeBillingError, _invoice_subscription_id, _provider_id, _timestamp_to_datetime, _value


class BillingProfileSerializer(serializers.ModelSerializer):
    tax_id = serializers.RegexField(r'^[0-9]{13}$', allow_blank=True, required=False)

    class Meta:
        model = BillingProfile
        fields = ['legal_name', 'address', 'tax_id', 'branch', 'email']


def issuer_details():
    stored = BillingIssuerSettings.objects.filter(pk=1).values(
        'legal_name', 'address', 'tax_id', 'email',
    ).first()
    # A saved Admin configuration takes precedence as a complete identity.
    # Environment configuration remains compatible until the first Admin save.
    issuer = stored if stored is not None else dict(getattr(settings, 'BILLING_ISSUER', {}) or {})
    if not all(str(issuer.get(key, '')).strip() for key in ('legal_name', 'address', 'tax_id', 'email')):
        raise StripeBillingError('billing_issuer_missing', 'Please configure the legal billing issuer before issuing invoices.')
    return issuer


@transaction.atomic
def snapshot_invoice(invoice, subscription):
    """Called only with Stripe-authoritative invoices for the bound subscription.

    Finalized identity, line items and totals are frozen; subsequent provider
    reads update payment status only, so profile edits never rewrite old bills.
    """
    if (
        _provider_id(_value(invoice, 'customer')) != subscription.external_customer_id
        or _invoice_subscription_id(invoice) != subscription.external_subscription_id
    ):
        raise StripeBillingError('stripe_invoice_mismatch', 'Invoice does not belong to this subscription.')
    if _value(invoice, 'status') == 'draft':
        return None
    currency = _value(invoice, 'currency')
    allowed = {'usd', 'thb'} if subscription.tenant.billing_model == 'property_quantity_v1' else {'thb'}
    if currency not in allowed:
        raise StripeBillingError('unsupported_invoice_currency', 'PromptPay invoices must be in THB.')
    for field in ('total_tax_amounts', 'total_taxes'):
        if any(int(_value(tax, 'amount', 0)) for tax in (_value(invoice, field) or [])):
            raise StripeBillingError('vat_not_supported', 'VAT is not supported by this billing flow.')
    if _value(_value(invoice, 'lines', {}), 'has_more', False):
        raise StripeBillingError('unsupported_invoice_lines', 'Invoice has too many lines.')
    profile = BillingProfile.objects.get(tenant=subscription.tenant)
    address = _value(invoice, 'customer_address') or {}
    customer_address = '\n'.join(str(_value(address, key) or '') for key in (
        'line1', 'line2', 'city', 'state', 'postal_code', 'country'
    ) if _value(address, key))
    custom_fields = {_value(item, 'name'): _value(item, 'value') for item in (_value(invoice, 'custom_fields') or [])}
    transitions = _value(invoice, 'status_transitions') or {}
    paid_at = _timestamp_to_datetime(_value(transitions, 'paid_at')) if _value(invoice, 'status') == 'paid' else None
    lines = [{
        'description': str(_value(line, 'description') or 'StayMaint subscription'),
        'amount_minor': int(_value(line, 'amount', 0)),
        'period_start': _value(_value(line, 'period', {}), 'start'),
        'period_end': _value(_value(line, 'period', {}), 'end'),
        'price_id': (_provider_id(_value(line, 'price')) or
                     _value(_value(_value(line, 'pricing', {}), 'price_details', {}), 'price')),
    } for line in _value(_value(invoice, 'lines', {}), 'data', [])]
    discounts = sum(int(_value(item, 'amount', 0)) for item in (_value(invoice, 'total_discount_amounts') or []))
    if discounts:
        lines.append({'description': 'ส่วนลด / Discount', 'amount_minor': -discounts})
    document, created = BillingInvoice.objects.select_for_update().get_or_create(
        provider_invoice_id=_provider_id(invoice),
        defaults={
            'tenant': subscription.tenant,
            'provider_subscription_id': subscription.external_subscription_id,
            'provider_number': str(_value(invoice, 'number') or ''),
            'issuer': issuer_details(),
            'customer': {
                'legal_name': _value(invoice, 'customer_name') or profile.legal_name,
                'address': customer_address or profile.address,
                'email': _value(invoice, 'customer_email') or profile.email,
                'tax_id': custom_fields.get('Tax ID', profile.tax_id),
                'branch': custom_fields.get('Branch', profile.branch),
            },
            'lines': lines,
            'currency': currency,
            'total_minor': int(_value(invoice, 'total', 0)),
            'status': _value(invoice, 'status'),
            'issued_at': _timestamp_to_datetime(_value(transitions, 'finalized_at') or _value(invoice, 'created')),
            'due_at': _timestamp_to_datetime(_value(invoice, 'due_date')),
            'paid_at': paid_at,
            'amount_paid_minor': int(_value(invoice, 'amount_paid', 0)),
            'amount_due_minor': max(0, int(_value(invoice, 'amount_due', _value(invoice, 'total', 0)) or 0)),
            'amount_remaining_minor': int(_value(invoice, 'amount_remaining', 0) or 0),
        },
    )
    if not created:
        if document.tenant_id != subscription.tenant_id:
            raise StripeBillingError('stripe_invoice_mismatch', 'Invoice tenant mismatch.')
        # A delayed open-state read must never undo a recorded payment, nor
        # change the amount on a receipt which has already been issued.
        if not document.paid_at:
            document.status = _value(invoice, 'status')
            document.amount_paid_minor = int(_value(invoice, 'amount_paid', 0))
        # A receipt remains a historical payment record after later refunds.
        document.paid_at = document.paid_at or paid_at
        document.amount_due_minor = max(0, int(_value(invoice, 'amount_due', document.amount_due_minor) or 0))
        document.amount_remaining_minor = 0 if document.paid_at else max(0, int(_value(invoice, 'amount_remaining', document.amount_remaining_minor) or 0))
        document.save(update_fields=['status', 'amount_paid_minor', 'paid_at', 'amount_due_minor', 'amount_remaining_minor'])
    return document


def document_summary(document):
    return {
        'id': document.pk, 'number': document.number,
        'receipt_number': document.receipt_number,
        'status': document.status, 'currency': document.currency.upper(),
        'total': str(Decimal(document.total_minor) / 100),
        'amount_due': str(Decimal(document.amount_remaining_minor) / 100),
        'issued_at': document.issued_at.isoformat(),
        'due_at': document.due_at.isoformat() if document.due_at else None,
        'paid_at': document.paid_at.isoformat() if document.paid_at else None,
    }


def render_document_pdf(document, receipt=False):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    if receipt and not document.paid_at:
        raise StripeBillingError('receipt_unavailable', 'A receipt is available only after payment.')
    # The production static volume can mask source fonts. Docker keeps an
    # immutable copy outside that mount; local development uses source fonts.
    font_directories = [
        Path('/usr/local/share/fonts/mylubd'),
        Path(settings.BASE_DIR) / 'static' / 'fonts',
        Path(settings.STATIC_ROOT) / 'fonts',
    ]
    font_dir = next((directory for directory in font_directories if all(
        (directory / f'Sarabun-{weight}.ttf').is_file() for weight in ('Regular', 'Bold')
    )), None)
    if font_dir is None:
        raise ValueError('Billing PDF fonts are unavailable.')
    for name in ('Regular', 'Bold'):
        font_name = f'BillingSarabun-{name}'
        if font_name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(font_name, str(font_dir / f'Sarabun-{name}.ttf')))
    # Thai combining marks need HarfBuzz positioning. CJK wrapping bypasses
    # ReportLab's shaping path and leaves vowels and tone marks misplaced.
    style = ParagraphStyle('billing', fontName='BillingSarabun-Regular', fontSize=11, leading=17, shaping=1)
    heading = ParagraphStyle('heading', parent=style, fontName='BillingSarabun-Bold', fontSize=20, leading=28)
    def p(value, text_style=style):
        return Paragraph(escape(str(value or '')).replace('\n', '<br/>'), text_style)
    def money(minor):
        return f'{Decimal(minor) / 100:,.2f} {document.currency.upper()}'
    def date(value):
        return timezone.localtime(value, timezone.get_fixed_timezone(420)).strftime('%d/%m/%Y') if value else '—'
    number = document.receipt_number if receipt else document.number
    story = [p('StayMaint'), p('ใบเสร็จรับเงิน' if receipt else 'ใบแจ้งหนี้', heading),
             p(f'เลขที่ {number}'), p(f'วันที่ {date(document.paid_at if receipt else document.issued_at)}'), Spacer(1, 16)]
    for title, identity in [('ผู้รับเงิน / ผู้ให้บริการ', document.issuer), ('ลูกค้า', document.customer)]:
        story.extend([p(title), p(identity.get('legal_name')), p(identity.get('address')),
                      p(f"เลขประจำตัวผู้เสียภาษี: {identity.get('tax_id') or '—'}"),
                      p(identity.get('branch')), p(identity.get('email')), Spacer(1, 12)])
    table_rows = [[p('รายการ'), p('จำนวนเงิน')]]
    if document.property_manifest:
        story.extend([p('Properties / ฐานค่าบริการรายเดือน'),
                      *[p(f"{row['name']} ({row['property_id']}) — {money(document.unit_amount_minor)} / เดือน") for row in document.property_manifest],
                      Spacer(1, 12)])
    for line in document.lines:
        description = line['description']
        if line.get('period_start') and line.get('period_end'):
            description += f"\nรอบบริการ {date(_timestamp_to_datetime(line['period_start']))} – {date(_timestamp_to_datetime(line['period_end']))}"
        table_rows.append([p(description), p(money(line['amount_minor']))])
    table_rows.append([p('ยอดรวม'), p(money(document.total_minor))])
    if receipt:
        table_rows.append([p('รับชำระแล้ว'), p(money(document.amount_paid_minor))])
    table = Table(table_rows, colWidths=[360, 150], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8f1f4')),
                              ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                              ('TOPPADDING', (0, 0), (-1, -1), 8),
                              ('LINEABOVE', (0, -1), (-1, -1), 0.5, colors.grey)]))
    story.extend([table, Spacer(1, 16), p('ผู้ให้บริการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม'),
                  p(f'อ้างอิงใบแจ้งหนี้ {document.number}' if receipt else f'กำหนดชำระ {date(document.due_at)}')])
    if not receipt and document.status in {'void', 'uncollectible'}:
        story.append(p('ยกเลิก' if document.status == 'void' else 'หนี้ที่เรียกเก็บไม่ได้'))
    if not receipt and document.status == 'open':
        billing_url = str(getattr(settings, 'FRONTEND_BASE_URL', '') or '').rstrip('/') + '/dashboard/settings/billing/'
        if billing_url.startswith('https://'):
            story.append(Paragraph(
                f'ชำระเงิน: <link href="{escape(billing_url, {chr(34): "&quot;"})}" color="#126176">'
                'เข้าสู่ StayMaint แล้วเลือกชำระบิลนี้</link>', style,
            ))
    buffer = BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40,
                      title=f'{number} StayMaint', author=document.issuer['legal_name']).build(story)
    return buffer.getvalue()
