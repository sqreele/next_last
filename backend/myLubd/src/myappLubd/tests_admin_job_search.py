from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

from .admin import IsDefectFilter, JobAdmin
from .models import Job, Room


User = get_user_model()


class JobAdminSearchTests(TestCase):
    def setUp(self):
        self.request = RequestFactory().get('/admin/myappLubd/job/')
        self.admin = JobAdmin(Job, AdminSite())
        self.user = User.objects.create_user(username='engineer', password='pw12345!')
        self.room = Room.objects.create(name='LUBD-1205', room_type='Deluxe')
        self.job = Job.objects.create(
            user=self.user,
            description='Replace air filter',
            remarks='Admin search test',
            status='pending',
            priority='medium',
        )
        self.job.rooms.add(self.room)

    def test_search_matches_room_name(self):
        queryset, _ = self.admin.get_search_results(self.request, Job.objects.all(), '1205')

        self.assertIn(self.job, queryset)

    def test_search_does_not_match_room_id(self):
        queryset, _ = self.admin.get_search_results(
            self.request,
            Job.objects.all(),
            str(self.room.room_id),
        )

        self.assertNotIn(self.job, queryset)

    def test_search_does_not_match_description(self):
        queryset, _ = self.admin.get_search_results(
            self.request,
            Job.objects.all(),
            'Replace air filter',
        )

        self.assertNotIn(self.job, queryset)


class IsDefectFilterTests(TestCase):
    def setUp(self):
        self.request = RequestFactory().get('/admin/myappLubd/job/?is_defect=1')
        self.user = User.objects.create_user(username='engineer-filter', password='pw12345!')
        self.defect_job = Job.objects.create(
            user=self.user,
            description='Defect job',
            remarks='Admin filter test',
            status='pending',
            priority='medium',
            is_defective=True,
        )
        self.non_defect_job = Job.objects.create(
            user=self.user,
            description='Non defect job',
            remarks='Admin filter test',
            status='pending',
            priority='medium',
            is_defective=False,
        )

    def test_is_defect_filter_uses_requested_query_parameter(self):
        defect_filter = IsDefectFilter(
            self.request,
            {'is_defect': '1'},
            Job,
            JobAdmin(Job, AdminSite()),
        )

        queryset = defect_filter.queryset(self.request, Job.objects.all())

        self.assertIn(self.defect_job, queryset)
        self.assertNotIn(self.non_defect_job, queryset)


class JobAdminCsvExportTests(TestCase):
    def setUp(self):
        self.request = RequestFactory().get('/admin/myappLubd/job/')
        self.admin = JobAdmin(Job, AdminSite())
        self.user = User.objects.create_user(username='csv-engineer', password='pw12345!')
        self.job = Job.objects.create(
            user=self.user,
            description='CSV export image test',
            remarks='Includes image URL',
            status='pending',
            priority='medium',
        )

    def test_export_jobs_csv_includes_image_urls_and_display_formulas(self):
        from csv import DictReader
        from io import StringIO
        from django.core.files.uploadedfile import SimpleUploadedFile

        image = self.job.job_images.create(
            uploaded_by=self.user,
            image=SimpleUploadedFile(
                'before.jpg',
                b'not-real-image-bytes',
                content_type='image/jpeg',
            ),
        )

        response = self.admin.export_jobs_csv(self.request, Job.objects.filter(pk=self.job.pk))
        rows = list(DictReader(StringIO(response.content.decode())))

        expected_url = self.request.build_absolute_uri(image.image.url)
        self.assertEqual(rows[0]['Image URLs'], expected_url)
        self.assertEqual(
            rows[0]['Image Formulas (Excel/Google Sheets)'],
            f'=IMAGE("{expected_url}")',
        )
        self.assertIn('IMAGE formula', rows[0]['Image Export Notes'])

    def test_export_jobs_google_sheets_csv_uses_image_formulas(self):
        from csv import DictReader
        from io import StringIO
        from django.core.files.uploadedfile import SimpleUploadedFile

        image = self.job.job_images.create(
            uploaded_by=self.user,
            image=SimpleUploadedFile(
                'before-for-sheets.jpg',
                b'not-real-image-bytes',
                content_type='image/jpeg',
            ),
        )

        response = self.admin.export_jobs_google_sheets_csv(self.request, Job.objects.filter(pk=self.job.pk))
        rows = list(DictReader(StringIO(response.content.decode())))

        expected_url = self.request.build_absolute_uri(image.image.url)
        self.assertIn('jobs_google_sheets_', response['Content-Disposition'])
        self.assertEqual(rows[0]['Image URLs'], expected_url)
        self.assertEqual(
            rows[0]['Image Formulas (Excel/Google Sheets)'],
            f'=IMAGE("{expected_url}")',
        )

    def test_export_jobs_excel_leaves_mpo_images_as_urls(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from unittest.mock import patch

        image = self.job.job_images.create(
            uploaded_by=self.user,
            image=SimpleUploadedFile(
                'stereo.mpo',
                b'not-real-mpo-image-bytes',
                content_type='image/mpo',
            ),
        )

        with patch('openpyxl.drawing.image.Image', side_effect=KeyError('.mpo')):
            response = self.admin.export_jobs_excel(self.request, Job.objects.filter(pk=self.job.pk))

        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        from io import BytesIO
        from openpyxl import load_workbook

        workbook = load_workbook(BytesIO(response.content))
        row = next(workbook.active.iter_rows(min_row=2, max_row=2, values_only=True))
        self.assertEqual(row[16], 'Image URL only (unsupported Excel preview)')
        self.assertEqual(row[17], self.request.build_absolute_uri(image.image.url))
