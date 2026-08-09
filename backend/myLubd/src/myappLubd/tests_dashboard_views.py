from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase


User = get_user_model()


class DashboardSummaryRegressionTests(APITestCase):
    def test_user_without_property_access_gets_empty_summary_contract(self):
        user = User.objects.create_user(username='dashboard-user', password='pw12345!')
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get('/api/v1/dashboard/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            response.data,
            {
                'totalJobs': 0,
                'pmJobs': 0,
                'nonPmJobs': 0,
                'completionRate': 0,
                'trendByMonth': [],
                'pmNonPmByMonth': [],
                'statusByMonth': [],
                'topUsersByMonth': [],
                'topicsByMonth': [],
            },
        )
