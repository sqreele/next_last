from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase


User = get_user_model()


class MaintenanceReportViewRegressionTests(APITestCase):
    def test_authenticated_user_with_no_visible_maintenance_gets_not_found_contract(self):
        user = User.objects.create_user(username='report-user', password='pw12345!')
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get('/api/v1/maintenance/report/pdf/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertEqual(
            response.data,
            {'error': 'No maintenance data found for the specified filters'},
        )
