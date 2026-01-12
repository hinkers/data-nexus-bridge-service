from django.core.management.base import BaseCommand
from affinda_bridge.models import Workspace, Collection, FieldDefinition, DataPoint, Document


class Command(BaseCommand):
    help = 'Seed the database with test data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding database...')

        # Clear existing data
        Document.objects.all().delete()
        FieldDefinition.objects.all().delete()
        Collection.objects.all().delete()
        DataPoint.objects.all().delete()
        Workspace.objects.all().delete()

        # Create DataPoints
        invoice_datapoint = DataPoint.objects.create(
            identifier='invoice-parser-v3',
            name='Invoice Parser',
            slug='invoice-parser',
            description='Advanced invoice document parser',
            annotation_content_type='application/json',
            organization_identifier='acme-corp',
            extractor='invoice_v3',
            is_public=False,
            raw={'version': '3.0', 'features': ['line_items', 'tax_detection']}
        )

        receipt_datapoint = DataPoint.objects.create(
            identifier='receipt-parser-v2',
            name='Receipt Parser',
            slug='receipt-parser',
            description='Retail receipt parser',
            annotation_content_type='application/json',
            organization_identifier='acme-corp',
            extractor='receipt_v2',
            is_public=False,
            raw={'version': '2.0', 'features': ['merchant_detection', 'items']}
        )

        # Create Workspaces
        accounting_workspace = Workspace.objects.create(
            identifier='ws-accounting-2024',
            name='Accounting Documents 2024',
            organization_identifier='acme-corp',
            raw={'department': 'finance', 'year': 2024}
        )

        procurement_workspace = Workspace.objects.create(
            identifier='ws-procurement-2024',
            name='Procurement & Invoices 2024',
            organization_identifier='acme-corp',
            raw={'department': 'procurement', 'year': 2024}
        )

        hr_workspace = Workspace.objects.create(
            identifier='ws-hr-docs',
            name='HR Documents',
            organization_identifier='acme-corp',
            raw={'department': 'hr', 'confidential': True}
        )

        # Create Collections
        invoices_collection = Collection.objects.create(
            identifier='col-invoices-q1',
            name='Q1 Invoices',
            workspace=accounting_workspace,
            raw={'quarter': 1, 'status': 'active'}
        )

        receipts_collection = Collection.objects.create(
            identifier='col-receipts-q1',
            name='Q1 Receipts',
            workspace=accounting_workspace,
            raw={'quarter': 1, 'status': 'active'}
        )

        vendor_invoices_collection = Collection.objects.create(
            identifier='col-vendor-invoices',
            name='Vendor Invoices',
            workspace=procurement_workspace,
            raw={'status': 'processing'}
        )

        # Create additional DataPoints for each field type
        invoice_number_dp = DataPoint.objects.create(
            identifier='invoice-number-field',
            name='Invoice Number Field',
            slug='invoice-number',
            description='Invoice number extractor',
            annotation_content_type='string',
            organization_identifier='acme-corp',
            extractor='field_extractor',
            is_public=False,
            raw={'field_type': 'invoice_number'}
        )

        invoice_date_dp = DataPoint.objects.create(
            identifier='invoice-date-field',
            name='Invoice Date Field',
            slug='invoice-date',
            description='Invoice date extractor',
            annotation_content_type='date',
            organization_identifier='acme-corp',
            extractor='field_extractor',
            is_public=False,
            raw={'field_type': 'invoice_date'}
        )

        total_amount_dp = DataPoint.objects.create(
            identifier='total-amount-field',
            name='Total Amount Field',
            slug='total-amount',
            description='Total amount extractor',
            annotation_content_type='number',
            organization_identifier='acme-corp',
            extractor='field_extractor',
            is_public=False,
            raw={'field_type': 'total_amount'}
        )

        merchant_name_dp = DataPoint.objects.create(
            identifier='merchant-name-field',
            name='Merchant Name Field',
            slug='merchant-name',
            description='Merchant name extractor',
            annotation_content_type='string',
            organization_identifier='acme-corp',
            extractor='field_extractor',
            is_public=False,
            raw={'field_type': 'merchant_name'}
        )

        purchase_date_dp = DataPoint.objects.create(
            identifier='purchase-date-field',
            name='Purchase Date Field',
            slug='purchase-date',
            description='Purchase date extractor',
            annotation_content_type='date',
            organization_identifier='acme-corp',
            extractor='field_extractor',
            is_public=False,
            raw={'field_type': 'purchase_date'}
        )

        vendor_name_dp = DataPoint.objects.create(
            identifier='vendor-name-field',
            name='Vendor Name Field',
            slug='vendor-name',
            description='Vendor name extractor',
            annotation_content_type='string',
            organization_identifier='acme-corp',
            extractor='field_extractor',
            is_public=False,
            raw={'field_type': 'vendor_name'}
        )

        # Create Field Definitions
        FieldDefinition.objects.create(
            collection=invoices_collection,
            datapoint_identifier=invoice_number_dp.identifier,
            name='Invoice Number',
            slug='invoice_number',
            data_type='string',
            raw={'required': True, 'max_length': 50}
        )

        FieldDefinition.objects.create(
            collection=invoices_collection,
            datapoint_identifier=invoice_date_dp.identifier,
            name='Invoice Date',
            slug='invoice_date',
            data_type='date',
            raw={'required': True, 'format': 'YYYY-MM-DD'}
        )

        FieldDefinition.objects.create(
            collection=invoices_collection,
            datapoint_identifier=total_amount_dp.identifier,
            name='Total Amount',
            slug='total_amount',
            data_type='number',
            raw={'required': True, 'decimal_places': 2}
        )

        FieldDefinition.objects.create(
            collection=receipts_collection,
            datapoint_identifier=merchant_name_dp.identifier,
            name='Merchant Name',
            slug='merchant_name',
            data_type='string',
            raw={'required': True, 'max_length': 100}
        )

        FieldDefinition.objects.create(
            collection=receipts_collection,
            datapoint_identifier=purchase_date_dp.identifier,
            name='Purchase Date',
            slug='purchase_date',
            data_type='date',
            raw={'required': True, 'format': 'YYYY-MM-DD'}
        )

        FieldDefinition.objects.create(
            collection=vendor_invoices_collection,
            datapoint_identifier=vendor_name_dp.identifier,
            name='Vendor Name',
            slug='vendor_name',
            data_type='string',
            raw={'required': True, 'max_length': 200}
        )

        # Create Documents
        from datetime import datetime, timedelta
        from django.utils import timezone as tz

        Document.objects.create(
            identifier='doc-inv-001',
            custom_identifier='INV-2024-001',
            file_name='invoice_acme_jan.pdf',
            file_url='https://example.com/docs/invoice_acme_jan.pdf',
            workspace=accounting_workspace,
            collection=invoices_collection,
            state=Document.STATE_COMPLETE,
            in_review=False,
            failed=False,
            ready=True,
            last_updated_dt=tz.now() - timedelta(days=5),
            data={
                'invoice_number': 'INV-2024-001',
                'invoice_date': '2024-01-15',
                'total_amount': 1250.00
            },
            raw={'processed_at': '2024-01-15T10:30:00Z', 'confidence': 0.98}
        )

        Document.objects.create(
            identifier='doc-inv-002',
            custom_identifier='INV-2024-002',
            file_name='invoice_techcorp_feb.pdf',
            file_url='https://example.com/docs/invoice_techcorp_feb.pdf',
            workspace=accounting_workspace,
            collection=invoices_collection,
            state=Document.STATE_COMPLETE,
            in_review=False,
            failed=False,
            ready=True,
            last_updated_dt=tz.now() - timedelta(days=3),
            data={
                'invoice_number': 'INV-2024-002',
                'invoice_date': '2024-02-10',
                'total_amount': 3475.50
            },
            raw={'processed_at': '2024-02-10T14:20:00Z', 'confidence': 0.95}
        )

        Document.objects.create(
            identifier='doc-inv-003',
            custom_identifier='INV-2024-003',
            file_name='invoice_supplier_mar.pdf',
            file_url='https://example.com/docs/invoice_supplier_mar.pdf',
            workspace=accounting_workspace,
            collection=invoices_collection,
            state=Document.STATE_REVIEW,
            in_review=True,
            failed=False,
            ready=False,
            last_updated_dt=tz.now() - timedelta(hours=12),
            data={
                'invoice_number': 'INV-2024-003',
                'invoice_date': '2024-03-05',
                'total_amount': 892.25
            },
            raw={'processed_at': '2024-03-05T09:15:00Z', 'confidence': 0.72}
        )

        Document.objects.create(
            identifier='doc-rec-001',
            custom_identifier='REC-2024-001',
            file_name='receipt_office_supplies.jpg',
            file_url='https://example.com/docs/receipt_office_supplies.jpg',
            workspace=accounting_workspace,
            collection=receipts_collection,
            state=Document.STATE_COMPLETE,
            in_review=False,
            failed=False,
            ready=True,
            last_updated_dt=tz.now() - timedelta(days=7),
            data={
                'merchant_name': 'Office Depot',
                'purchase_date': '2024-01-20'
            },
            raw={'processed_at': '2024-01-20T11:00:00Z', 'confidence': 0.89}
        )

        Document.objects.create(
            identifier='doc-rec-002',
            custom_identifier='REC-2024-002',
            file_name='receipt_client_lunch.jpg',
            file_url='https://example.com/docs/receipt_client_lunch.jpg',
            workspace=accounting_workspace,
            collection=receipts_collection,
            state=Document.STATE_COMPLETE,
            in_review=False,
            failed=False,
            ready=True,
            last_updated_dt=tz.now() - timedelta(days=2),
            data={
                'merchant_name': 'The French Bistro',
                'purchase_date': '2024-02-15'
            },
            raw={'processed_at': '2024-02-15T16:45:00Z', 'confidence': 0.93}
        )

        Document.objects.create(
            identifier='doc-vendor-001',
            custom_identifier='VEND-2024-001',
            file_name='vendor_invoice_tech_services.pdf',
            file_url='https://example.com/docs/vendor_invoice_tech_services.pdf',
            workspace=procurement_workspace,
            collection=vendor_invoices_collection,
            state=Document.STATE_COMPLETE,
            in_review=False,
            failed=False,
            ready=True,
            last_updated_dt=tz.now() - timedelta(days=10),
            data={
                'vendor_name': 'TechServices Inc.'
            },
            raw={'processed_at': '2024-01-25T13:30:00Z', 'confidence': 0.96}
        )

        Document.objects.create(
            identifier='doc-vendor-002',
            custom_identifier='VEND-2024-002',
            file_name='vendor_invoice_office_rent.pdf',
            file_url='https://example.com/docs/vendor_invoice_office_rent.pdf',
            workspace=procurement_workspace,
            collection=vendor_invoices_collection,
            state=Document.STATE_ARCHIVED,
            in_review=False,
            failed=False,
            ready=True,
            last_updated_dt=tz.now() - timedelta(days=15),
            data={
                'vendor_name': 'Downtown Properties LLC'
            },
            raw={'processed_at': '2024-02-01T08:00:00Z', 'confidence': 0.99}
        )

        Document.objects.create(
            identifier='doc-failed-001',
            custom_identifier='FAIL-2024-001',
            file_name='corrupted_invoice.pdf',
            file_url='https://example.com/docs/corrupted_invoice.pdf',
            workspace=accounting_workspace,
            collection=invoices_collection,
            state=Document.STATE_REVIEW,
            in_review=False,
            failed=True,
            ready=False,
            last_updated_dt=tz.now() - timedelta(hours=6),
            data={},
            raw={'processed_at': '2024-03-10T12:00:00Z', 'error': 'File corrupted'}
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded database!'))
        self.stdout.write(f'  - Created {Workspace.objects.count()} workspaces')
        self.stdout.write(f'  - Created {Collection.objects.count()} collections')
        self.stdout.write(f'  - Created {DataPoint.objects.count()} data points')
        self.stdout.write(f'  - Created {FieldDefinition.objects.count()} field definitions')
        self.stdout.write(f'  - Created {Document.objects.count()} documents')
