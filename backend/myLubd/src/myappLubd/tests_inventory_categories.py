from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models.deletion import ProtectedError
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .admin import InventoryAdmin, InventoryAdminForm, InventoryCategoryAdmin
from .models import Inventory, InventoryCategory, Property, Tenant, TenantMembership


User = get_user_model()


class InventoryCategoryMigrationTests(TransactionTestCase):
    migrate_from = ('myappLubd', '0083_stripe_billing_v1')
    migrate_to = ('myappLubd', '0084_inventory_category_model')

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        TenantOld = old_apps.get_model('myappLubd', 'Tenant')
        PropertyOld = old_apps.get_model('myappLubd', 'Property')
        InventoryOld = old_apps.get_model('myappLubd', 'Inventory')

        tenant = TenantOld.objects.create(name='Migration tenant')
        property_obj = PropertyOld.objects.create(name='Migration property', tenant=tenant)
        self.item_ids = []
        for index, code in enumerate((
            'tools', 'parts', 'supplies', 'equipment', 'consumables',
            'safety', 'safety_equipment', 'other', 'legacy_custom',
            ' Safety ',
        ), start=1):
            item = InventoryOld.objects.create(
                item_id=f'MIG-{index:03d}', name=f'Item {code}', category=code,
                property=property_obj,
            )
            self.item_ids.append(item.pk)
        orphan = InventoryOld.objects.create(
            item_id='MIG-999', name='Unscoped item', category='parts', property=None
        )
        self.item_ids.append(orphan.pk)

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.apps = executor.loader.project_state([self.migrate_to]).apps

    def tearDown(self):
        MigrationExecutor(connection).migrate(
            [MigrationExecutor(connection).loader.graph.leaf_nodes('myappLubd')[0]]
        )
        super().tearDown()

    def test_every_inventory_row_is_preserved_and_mapped(self):
        InventoryNew = self.apps.get_model('myappLubd', 'Inventory')
        rows = list(InventoryNew.objects.filter(pk__in=self.item_ids).select_related('category'))
        self.assertEqual(len(rows), len(self.item_ids))
        self.assertFalse(any(row.category_id is None for row in rows))
        for code in ('tools', 'parts', 'supplies', 'equipment', 'consumables', 'other'):
            with self.subTest(code=code):
                row = InventoryNew.objects.get(name=f'Item {code}')
                self.assertEqual(row.category.code, code)
                self.assertEqual(row.category.tenant_id, row.property.tenant_id)
        self.assertEqual(
            InventoryNew.objects.get(name='Item safety').category.code,
            'safety_equipment',
        )
        self.assertEqual(
            InventoryNew.objects.get(name='Item legacy_custom').category.code,
            'legacy_custom',
        )
        self.assertEqual(
            InventoryNew.objects.get(name='Item  Safety ').category.code,
            ' Safety ',
        )
        self.assertEqual(
            InventoryNew.objects.get(name='Item  Safety ').category.name,
            'Safety',
        )
        unscoped_item = InventoryNew.objects.get(name='Unscoped item')
        self.assertIsNone(unscoped_item.category.tenant_id)
        self.assertEqual(unscoped_item.category.sort_order, 20)

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        reversed_apps = executor.loader.project_state([self.migrate_from]).apps
        InventoryOld = reversed_apps.get_model('myappLubd', 'Inventory')
        reversed_rows = InventoryOld.objects.filter(pk__in=self.item_ids)
        self.assertEqual(reversed_rows.count(), len(self.item_ids))
        self.assertEqual(reversed_rows.get(name='Item safety').category, 'safety')
        self.assertEqual(reversed_rows.get(name='Item safety_equipment').category, 'safety')
        self.assertEqual(reversed_rows.get(name='Item legacy_custom').category, 'legacy_custom')
        self.assertEqual(reversed_rows.get(name='Item  Safety ').category, ' Safety ')

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        forward_again_apps = executor.loader.project_state([self.migrate_to]).apps
        InventoryAgain = forward_again_apps.get_model('myappLubd', 'Inventory')
        self.assertEqual(InventoryAgain.objects.filter(pk__in=self.item_ids).count(), len(self.item_ids))
        self.assertFalse(
            InventoryAgain.objects.filter(pk__in=self.item_ids, category_id__isnull=True).exists()
        )


class InventoryCategoryBehaviorTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Category tenant')
        self.other_tenant = Tenant.objects.create(name='Other category tenant')
        self.property = Property.objects.create(name='Category hotel', tenant=self.tenant)
        self.other_property = Property.objects.create(name='Other category hotel', tenant=self.other_tenant)
        self.user = User.objects.create_user(username='category-user', password='pw12345!')
        TenantMembership.objects.create(
            user=self.user, tenant=self.tenant, role='technician', is_active=True
        ).properties.add(self.property)
        TenantMembership.objects.create(
            user=self.user, tenant=self.other_tenant, role='technician', is_active=True
        ).properties.add(self.other_property)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_api_accepts_and_returns_legacy_category_codes(self):
        response = self.client.post('/api/v1/inventory/', {
            'name': 'API part',
            'category': 'parts',
            'quantity': 1,
            'property_id': self.property.property_id,
        }, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['category'], 'parts')
        self.assertEqual(response.data['category_display'], 'Parts')
        self.assertEqual(Inventory.objects.get(name='API part').category.tenant, self.tenant)

        safety = self.client.post('/api/v1/inventory/', {
            'name': 'Safety item',
            'category': 'safety',
            'quantity': 1,
            'property_id': self.property.property_id,
        }, format='json', secure=True)
        self.assertEqual(safety.status_code, status.HTTP_201_CREATED, safety.data)
        self.assertEqual(safety.data['category'], 'safety_equipment')

        item_id = response.data['item_id']
        replaced = self.client.put(f'/api/v1/inventory/{item_id}/', {
            'name': 'API tool',
            'category': 'tools',
            'quantity': 2,
            'property_id': self.property.property_id,
        }, format='json', secure=True)
        self.assertEqual(replaced.status_code, status.HTTP_200_OK, replaced.data)
        self.assertEqual(replaced.data['category'], 'tools')

        unknown = self.client.patch(
            f'/api/v1/inventory/{item_id}/',
            {'category': 'does_not_exist'},
            format='json',
            secure=True,
        )
        self.assertEqual(unknown.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_category_is_retained_but_cannot_be_newly_assigned(self):
        category = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        item = Inventory.objects.create(name='Existing part', property=self.property, category=category)
        category.is_active = False
        category.save(update_fields=['is_active', 'updated_at'])

        unchanged = self.client.patch(
            f'/api/v1/inventory/{item.item_id}/', {'quantity': 4}, format='json', secure=True
        )
        self.assertEqual(unchanged.status_code, status.HTTP_200_OK, unchanged.data)
        self.assertEqual(unchanged.data['category'], 'parts')
        self.assertEqual(unchanged.data['category_display'], 'Parts')
        rejected = self.client.post('/api/v1/inventory/', {
            'name': 'New part', 'category': 'parts', 'quantity': 1,
            'property_id': self.property.property_id,
        }, format='json', secure=True)
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
        change_rejected = self.client.patch(
            f'/api/v1/inventory/{item.item_id}/',
            {'category': 'parts'},
            format='json',
            secure=True,
        )
        self.assertEqual(change_rejected.status_code, status.HTTP_400_BAD_REQUEST)
        item.refresh_from_db()
        self.assertEqual(item.category_id, category.pk)

        with self.assertRaises(ValidationError):
            Inventory.objects.create(
                name='Direct inactive assignment',
                property=self.property,
                category=category,
            )

    def test_missing_category_does_not_fall_back_to_inactive_other(self):
        other = InventoryCategory.objects.get(tenant=self.tenant, code='other')
        other.is_active = False
        other.save(update_fields=['is_active', 'updated_at'])
        with self.assertRaises(ValidationError):
            Inventory.objects.create(name='No active default', property=self.property)

    def test_category_tenant_isolation_and_protected_deletion(self):
        InventoryCategory.objects.create(
            tenant=self.other_tenant, code='foreign_only', name='Foreign Only'
        )
        response = self.client.post('/api/v1/inventory/', {
            'name': 'Wrong tenant', 'category': 'foreign_only', 'quantity': 1,
            'property_id': self.property.property_id,
        }, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

        options = self.client.get(
            '/api/v1/inventory/filter_options/',
            {'property_id': self.property.property_id},
            secure=True,
        )
        self.assertNotIn('foreign_only', {row['value'] for row in options.data['categories']})

        unscoped = InventoryCategory.objects.create(
            tenant=None, code='reserved_option', name='Reserved Option'
        )
        unscoped_assignment = self.client.post('/api/v1/inventory/', {
            'name': 'Unscoped API attempt',
            'category': unscoped.code,
            'quantity': 1,
            'property_id': self.property.property_id,
        }, format='json', secure=True)
        self.assertEqual(unscoped_assignment.status_code, status.HTTP_400_BAD_REQUEST)
        inactive = InventoryCategory.objects.get(tenant=self.tenant, code='supplies')
        inactive.is_active = False
        inactive.save(update_fields=['is_active', 'updated_at'])
        options = self.client.get(
            '/api/v1/inventory/filter_options/',
            {'property_id': self.property.property_id},
            secure=True,
        )
        option_codes = {row['value'] for row in options.data['categories']}
        self.assertNotIn(unscoped.code, option_codes)
        self.assertNotIn(inactive.code, option_codes)

        inaccessible_tenant = Tenant.objects.create(name='Inaccessible options tenant')
        inaccessible_property = Property.objects.create(
            name='Inaccessible options hotel', tenant=inaccessible_tenant
        )
        inaccessible = self.client.get(
            '/api/v1/inventory/filter_options/',
            {'property_id': inaccessible_property.property_id},
            secure=True,
        )
        self.assertEqual(inaccessible.status_code, status.HTTP_404_NOT_FOUND)

        local = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        Inventory.objects.create(name='Protected part', property=self.property, category=local)
        with self.assertRaises(ProtectedError):
            local.delete()

    def test_model_rejects_scoped_inventory_with_unscoped_category(self):
        unscoped = InventoryCategory.objects.create(
            tenant=None, code='legacy_unscoped', name='Legacy Unscoped'
        )
        with self.assertRaises(ValidationError):
            Inventory.objects.create(
                name='Invalid scoped item', property=self.property, category=unscoped
            )

        legacy = Inventory.objects.create(name='Legacy item', property=None, category=unscoped)
        legacy.property = self.property
        with self.assertRaises(ValidationError):
            legacy.save()

    def test_property_change_requires_destination_tenant_category(self):
        tools = InventoryCategory.objects.get(tenant=self.tenant, code='tools')
        item = Inventory.objects.create(name='Movable tools', property=self.property, category=tools)

        rejected = self.client.patch(
            f'/api/v1/inventory/{item.item_id}/',
            {'property_id': self.other_property.property_id},
            format='json',
            secure=True,
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST, rejected.data)
        item.refresh_from_db()
        self.assertEqual((item.property, item.category.tenant), (self.property, self.tenant))

        moved = self.client.patch(
            f'/api/v1/inventory/{item.item_id}/',
            {'property_id': self.other_property.property_id, 'category': 'tools'},
            format='json',
            secure=True,
        )
        self.assertEqual(moved.status_code, status.HTTP_200_OK, moved.data)
        item.refresh_from_db()
        self.assertEqual((item.property, item.category.tenant), (self.other_property, self.other_tenant))

    def test_property_change_within_tenant_preserves_category(self):
        second_property = Property.objects.create(name='Second category hotel', tenant=self.tenant)
        self.user.tenant_memberships.get(tenant=self.tenant).properties.add(second_property)
        parts = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        item = Inventory.objects.create(name='Same tenant move', property=self.property, category=parts)

        response = self.client.patch(
            f'/api/v1/inventory/{item.item_id}/',
            {'property_id': second_property.property_id},
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item.refresh_from_db()
        self.assertEqual((item.property, item.category), (second_property, parts))

    def test_filter_and_ordering_use_category_codes(self):
        InventoryCategory.objects.filter(tenant=self.tenant).delete()
        tools = InventoryCategory.objects.create(tenant=self.tenant, code='tools', name='Tools')
        parts = InventoryCategory.objects.create(tenant=self.tenant, code='parts', name='Parts')
        consumables = InventoryCategory.objects.create(
            tenant=self.tenant, code='consumables', name='Consumables'
        )
        self.assertEqual(
            list(InventoryCategory.objects.filter(pk__in=[tools.pk, parts.pk, consumables.pk])
                 .order_by('pk').values_list('code', flat=True)),
            ['tools', 'parts', 'consumables'],
        )
        for name, category in (
            ('Tools row', tools), ('Parts row', parts), ('Consumables row', consumables)
        ):
            Inventory.objects.create(name=name, property=self.property, category=category)

        filtered = self.client.get('/api/v1/inventory/', {'category': 'parts'}, secure=True)
        self.assertEqual([row['name'] for row in filtered.data['results']], ['Parts row'])

        ascending = self.client.get('/api/v1/inventory/', {'ordering': 'category'}, secure=True)
        descending = self.client.get('/api/v1/inventory/', {'ordering': '-category'}, secure=True)
        self.assertEqual(
            [row['category'] for row in ascending.data['results']],
            ['consumables', 'parts', 'tools'],
        )
        self.assertEqual(
            [row['category'] for row in descending.data['results']],
            ['tools', 'parts', 'consumables'],
        )

    def test_defaults_are_idempotent_and_codes_are_tenant_unique(self):
        expected_codes = {code for code, _name, _order in InventoryCategory.DEFAULTS}
        self.assertSetEqual(
            set(InventoryCategory.objects.filter(tenant=self.tenant).values_list('code', flat=True)),
            expected_codes,
        )
        self.tenant.save()
        InventoryCategory.ensure_defaults(self.tenant)
        InventoryCategory.ensure_defaults(self.tenant)
        self.assertEqual(InventoryCategory.objects.filter(tenant=self.tenant).count(), 7)
        with self.assertRaises(IntegrityError), transaction.atomic():
            InventoryCategory.objects.create(tenant=self.tenant, code='parts', name='Duplicate')
        unscoped_parts = InventoryCategory.objects.create(
            tenant=None, code='parts', name='Legacy Parts'
        )
        self.assertIsNone(unscoped_parts.tenant_id)

    def test_tenant_and_seed_rows_rollback_together_in_transaction(self):
        tenant_pk = None
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                tenant = Tenant.objects.create(name='Rolled back category tenant')
                tenant_pk = tenant.pk
                self.assertEqual(
                    InventoryCategory.objects.filter(tenant=tenant).count(), 7
                )
                raise RuntimeError('force rollback')
        self.assertFalse(Tenant.objects.filter(pk=tenant_pk).exists())
        self.assertFalse(InventoryCategory.objects.filter(tenant_id=tenant_pk).exists())

    def test_bulk_import_resolves_exact_tenant_and_rejects_unknown_or_inactive(self):
        InventoryCategory.objects.create(tenant=self.tenant, code='chemicals', name='A Chemicals')
        InventoryCategory.objects.create(
            tenant=self.other_tenant, code='chemicals', name='B Chemicals'
        )
        InventoryCategory.objects.create(
            tenant=self.other_tenant, code='foreign_csv_only', name='Foreign CSV Only'
        )
        inactive = InventoryCategory.objects.get(tenant=self.tenant, code='supplies')
        inactive.is_active = False
        inactive.save(update_fields=['is_active', 'updated_at'])
        InventoryCategory.objects.create(
            tenant=None, code='unscoped_only', name='Reserved Unscoped'
        )

        csv_text = (
            'name,category,quantity,min_quantity\n'
            'Scoped chemical,chemicals,1,0\n'
            'Safety alias,safety,1,0\n'
            'Unknown,does_not_exist,1,0\n'
            'Inactive,supplies,1,0\n'
            'Foreign tenant only,foreign_csv_only,1,0\n'
            'Unscoped,unscoped_only,1,0\n'
        )
        response = self.client.post(
            f'/api/v1/inventory/bulk-import/?property_id={self.property.property_id}',
            {'csv': csv_text},
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS, response.data)
        self.assertEqual((response.data['created_count'], response.data['error_count']), (2, 4))
        imported = Inventory.objects.get(name='Scoped chemical')
        self.assertEqual((imported.category.name, imported.category.tenant), ('A Chemicals', self.tenant))
        safety = Inventory.objects.get(name='Safety alias')
        self.assertEqual((safety.category.code, safety.category.tenant), ('safety_equipment', self.tenant))
        self.assertTrue(all('unknown or inactive' in row['error'] for row in response.data['errors']))


class InventoryCategoryAdminTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='category-admin', email='admin@example.com', password='pw12345!'
        )
        self.tenant = Tenant.objects.create(name='Admin category tenant')
        self.property = Property.objects.create(name='Admin category hotel', tenant=self.tenant)
        self.client.force_login(self.superuser)

    def test_category_admin_is_registered_searchable_sortable_and_filterable(self):
        model_admin = admin.site._registry[InventoryCategory]
        self.assertIsInstance(model_admin, InventoryCategoryAdmin)
        self.assertIn('name', model_admin.search_fields)
        self.assertIn('is_active', model_admin.list_filter)
        self.assertIn('sort_order', model_admin.list_editable)
        category = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        self.assertIn('tenant', model_admin.get_readonly_fields(None, category))
        self.assertIn('code', model_admin.get_readonly_fields(None, category))

    def test_admin_can_add_and_edit_category(self):
        add_response = self.client.post(reverse('admin:myappLubd_inventorycategory_add'), {
            'tenant': self.tenant.pk,
            'name': 'Chemicals',
            'code': 'chemicals',
            'is_active': 'on',
            'sort_order': 35,
            '_save': 'Save',
        }, secure=True)
        self.assertEqual(add_response.status_code, 302)
        category = InventoryCategory.objects.get(tenant=self.tenant, code='chemicals')
        change_response = self.client.post(
            reverse('admin:myappLubd_inventorycategory_change', args=[category.pk]),
            {
                'tenant': self.tenant.pk,
                'name': 'Cleaning Chemicals',
                'code': 'chemicals',
                'sort_order': 36,
                '_save': 'Save',
            },
            secure=True,
        )
        self.assertEqual(change_response.status_code, 302)
        category.refresh_from_db()
        self.assertEqual(category.name, 'Cleaning Chemicals')
        self.assertFalse(category.is_active)
        enable_response = self.client.post(
            reverse('admin:myappLubd_inventorycategory_change', args=[category.pk]),
            {
                'name': category.name,
                'is_active': 'on',
                'sort_order': category.sort_order,
                '_save': 'Save',
            },
            secure=True,
        )
        self.assertEqual(enable_response.status_code, 302)
        category.refresh_from_db()
        self.assertTrue(category.is_active)

    def test_scoped_category_admin_cannot_create_for_another_tenant(self):
        user = User.objects.create_user(
            username='scoped-category-manager', password='pw12345!', is_staff=True
        )
        TenantMembership.objects.create(
            user=user, tenant=self.tenant, role='manager', is_active=True
        ).properties.add(self.property)
        user.user_permissions.add(
            Permission.objects.get(codename='view_inventorycategory'),
            Permission.objects.get(codename='add_inventorycategory'),
        )
        other_tenant = Tenant.objects.create(name='Forbidden category tenant')
        self.client.force_login(user)

        add_page = self.client.get(
            reverse('admin:myappLubd_inventorycategory_add'), secure=True
        )
        tenant_choices = add_page.context['adminform'].form.fields['tenant'].queryset
        self.assertSetEqual(set(tenant_choices.values_list('pk', flat=True)), {self.tenant.pk})

        response = self.client.post(reverse('admin:myappLubd_inventorycategory_add'), {
            'tenant': other_tenant.pk,
            'name': 'Forbidden',
            'code': 'forbidden',
            'is_active': 'on',
            'sort_order': 10,
            '_save': 'Save',
        }, secure=True)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            InventoryCategory.objects.filter(
                tenant=other_tenant, code='forbidden'
            ).exists()
        )

    def test_inventory_admin_category_field_fails_closed_on_add(self):
        model_admin = admin.site._registry[Inventory]
        self.assertIsInstance(model_admin, InventoryAdmin)
        self.assertNotIn('category', model_admin.autocomplete_fields)
        response = self.client.get(reverse('admin:myappLubd_inventory_add'), secure=True)
        self.assertEqual(response.status_code, 200)
        category_field = response.context['adminform'].form.fields['category']
        self.assertFalse(category_field.required)
        self.assertFalse(category_field.queryset.exists())

    def test_inventory_admin_add_and_cross_tenant_validation(self):
        parts = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        form = InventoryAdminForm(data={
            'name': 'Admin-created part',
            'category': parts.pk,
            'property': self.property.pk,
            'quantity': 1,
            'min_quantity': 0,
            'max_quantity': 0,
            'unit': 'pcs',
            'status': 'available',
        })
        self.assertTrue(form.is_valid(), form.errors)
        item = form.save()
        self.assertEqual((item.property, item.category), (self.property, parts))

        other_tenant = Tenant.objects.create(name='Foreign admin tenant')
        foreign_category = InventoryCategory.objects.get(tenant=other_tenant, code='parts')
        foreign_form = InventoryAdminForm(data={
            'name': 'Cross-tenant part',
            'category': foreign_category.pk,
            'property': self.property.pk,
            'quantity': 1,
            'min_quantity': 0,
            'max_quantity': 0,
            'unit': 'pcs',
            'status': 'available',
        })
        self.assertFalse(foreign_form.is_valid())
        self.assertIn('category', foreign_form.errors)

        add_response = self.client.post(reverse('admin:myappLubd_inventory_add'), {
            'name': 'Admin default category item',
            'category': '',
            'property': self.property.pk,
            'quantity': 1,
            'min_quantity': 0,
            'max_quantity': 0,
            'unit': 'pcs',
            'status': 'available',
            '_save': 'Save',
        }, secure=True)
        self.assertEqual(add_response.status_code, 302)
        created = Inventory.objects.get(name='Admin default category item')
        self.assertEqual((created.category.code, created.category.tenant), ('other', self.tenant))

        destination_tenant = Tenant.objects.create(name='Admin move tenant')
        destination_property = Property.objects.create(
            name='Admin move hotel', tenant=destination_tenant
        )
        destination_tools = InventoryCategory.objects.get(
            tenant=destination_tenant, code='tools'
        )
        move_response = self.client.post(
            reverse('admin:myappLubd_inventory_change', args=[item.pk]),
            {
                'name': item.name,
                'category': destination_tools.pk,
                'property': destination_property.pk,
                'quantity': item.quantity,
                'min_quantity': item.min_quantity,
                'max_quantity': item.max_quantity,
                'unit': item.unit,
                'status': item.status,
                '_save': 'Save',
            },
            secure=True,
        )
        self.assertEqual(move_response.status_code, 302)
        item.refresh_from_db()
        self.assertEqual(
            (item.property, item.category),
            (destination_property, destination_tools),
        )

    def test_normal_admin_forms_reject_unscoped_and_inactive_new_assignments(self):
        unscoped_form = admin.site._registry[InventoryCategory].form(data={
            'tenant': '',
            'name': 'Reserved',
            'code': 'reserved',
            'is_active': 'on',
            'sort_order': 1,
        })
        self.assertFalse(unscoped_form.is_valid())
        self.assertIn('tenant', unscoped_form.errors)

        inactive = InventoryCategory.objects.get(tenant=self.tenant, code='supplies')
        inactive.is_active = False
        inactive.save(update_fields=['is_active', 'updated_at'])
        inventory_form = InventoryAdminForm(data={
            'name': 'Inactive admin assignment',
            'category': inactive.pk,
            'property': self.property.pk,
            'quantity': 1,
            'min_quantity': 0,
            'max_quantity': 0,
            'unit': 'pcs',
            'status': 'available',
        })
        self.assertFalse(inventory_form.is_valid())
        self.assertIn('category', inventory_form.errors)

    def test_existing_inactive_category_does_not_invalidate_admin_form(self):
        category = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        item = Inventory.objects.create(name='Inactive admin item', property=self.property, category=category)
        category.is_active = False
        category.save(update_fields=['is_active', 'updated_at'])
        form = InventoryAdminForm(data={
            'name': item.name,
            'category': category.pk,
            'property': self.property.pk,
            'quantity': 0,
            'min_quantity': 0,
            'max_quantity': 0,
            'unit': 'pcs',
            'status': 'out_of_stock',
        }, instance=item)
        self.assertTrue(form.is_valid(), form.errors)
        response = self.client.get(
            reverse('admin:myappLubd_inventory_change', args=[item.pk]),
            secure=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            category.pk,
            response.context['adminform'].form.fields['category'].queryset.values_list(
                'pk', flat=True
            ),
        )

    def test_change_form_category_choices_are_bound_to_inventory_tenant(self):
        user = User.objects.create_user(
            username='scoped-category-admin', password='pw12345!', is_staff=True
        )
        TenantMembership.objects.create(
            user=user, tenant=self.tenant, role='supervisor', is_active=True
        ).properties.add(self.property)
        user.user_permissions.add(
            Permission.objects.get(codename='view_inventory'),
            Permission.objects.get(codename='change_inventory'),
        )
        other_tenant = Tenant.objects.create(name='Autocomplete other tenant')
        InventoryCategory.objects.create(
            tenant=other_tenant, code='foreign_secret', name='Foreign Secret'
        )
        InventoryCategory.objects.create(
            tenant=None, code='reserved_secret', name='Reserved Secret'
        )
        inactive = InventoryCategory.objects.get(tenant=self.tenant, code='supplies')
        inactive.is_active = False
        inactive.save(update_fields=['is_active', 'updated_at'])
        parts = InventoryCategory.objects.get(tenant=self.tenant, code='parts')
        item = Inventory.objects.create(
            name='Scoped admin item', property=self.property, category=parts
        )
        self.client.force_login(user)

        response = self.client.get(
            reverse('admin:myappLubd_inventory_change', args=[item.pk]), secure=True
        )
        self.assertEqual(response.status_code, 200, response.content)
        choices = response.context['adminform'].form.fields['category'].queryset
        self.assertSetEqual(set(choices.values_list('tenant_id', flat=True)), {self.tenant.pk})
        self.assertNotIn('foreign_secret', choices.values_list('code', flat=True))
        self.assertNotIn('reserved_secret', choices.values_list('code', flat=True))
        self.assertNotIn('supplies', choices.values_list('code', flat=True))
        self.assertIn('parts', choices.values_list('code', flat=True))
