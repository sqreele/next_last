"""
Management command to test notification API endpoints
Usage: python manage.py test_notifications [--username USERNAME] [--password PASSWORD] [--base-url URL]
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse
import json
import sys

User = get_user_model()


class Command(BaseCommand):
    help = 'Test notification API endpoints'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default='admin',
            help='Username for authentication (default: admin)'
        )
        parser.add_argument(
            '--password',
            type=str,
            default='sqreele1234',
            help='Password for authentication'
        )
        parser.add_argument(
            '--base-url',
            type=str,
            default='http://localhost:8000',
            help='Base URL for API (default: http://localhost:8000)'
        )
        parser.add_argument(
            '--days',
            type=int,
            default=7,
            help='Number of days for upcoming notifications (default: 7)'
        )

    def handle(self, *args, **options):
        username = options['username']
        password = options['password']
        base_url = options['base_url']
        days = options['days']

        self.stdout.write(self.style.SUCCESS(f'\n🧪 Testing Notification API Endpoints'))
        self.stdout.write(f'Base URL: {base_url}')
        self.stdout.write(f'Username: {username}')
        self.stdout.write('=' * 60)

        # Step 1: Get authentication token
        self.stdout.write(self.style.WARNING('\n1️⃣ Getting authentication token...'))
        try:
            client = Client()
            token_response = client.post(
                '/api/v1/token/',
                data=json.dumps({
                    'username': username,
                    'password': password
                }),
                content_type='application/json'
            )

            if token_response.status_code != 200:
                self.stdout.write(
                    self.style.ERROR(f'❌ Authentication failed: {token_response.status_code}')
                )
                self.stdout.write(f'Response: {token_response.content.decode()}')
                sys.exit(1)

            token_data = json.loads(token_response.content)
            access_token = token_data.get('access')
            
            if not access_token:
                self.stdout.write(self.style.ERROR('❌ No access token received'))
                sys.exit(1)

            self.stdout.write(self.style.SUCCESS('✅ Authentication successful'))
            self.stdout.write(f'Token: {access_token[:50]}...')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error during authentication: {str(e)}'))
            sys.exit(1)

        # Prepare headers for authenticated requests
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        # Step 2: Test overdue notifications endpoint
        self.stdout.write(self.style.WARNING('\n2️⃣ Testing GET /api/v1/notifications/overdue/'))
        try:
            overdue_response = client.get(
                '/api/v1/notifications/overdue/',
                headers=headers
            )

            self.stdout.write(f'Status Code: {overdue_response.status_code}')
            
            if overdue_response.status_code == 200:
                overdue_data = json.loads(overdue_response.content)
                count = overdue_data.get('count', 0)
                results = overdue_data.get('results', [])
                
                self.stdout.write(self.style.SUCCESS(f'✅ Success! Found {count} overdue tasks'))
                if count > 0:
                    self.stdout.write(f'\nFirst overdue task:')
                    self.stdout.write(json.dumps(results[0] if results else {}, indent=2))
                else:
                    self.stdout.write('No overdue tasks found')
            else:
                self.stdout.write(self.style.ERROR(f'❌ Failed: {overdue_response.content.decode()}'))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error: {str(e)}'))

        # Step 3: Test upcoming notifications endpoint
        self.stdout.write(self.style.WARNING(f'\n3️⃣ Testing GET /api/v1/notifications/upcoming/?days={days}'))
        try:
            upcoming_response = client.get(
                f'/api/v1/notifications/upcoming/?days={days}',
                headers=headers
            )

            self.stdout.write(f'Status Code: {upcoming_response.status_code}')
            
            if upcoming_response.status_code == 200:
                upcoming_data = json.loads(upcoming_response.content)
                count = upcoming_data.get('count', 0)
                days_param = upcoming_data.get('days', days)
                results = upcoming_data.get('results', [])
                
                self.stdout.write(self.style.SUCCESS(f'✅ Success! Found {count} upcoming tasks (next {days_param} days)'))
                if count > 0:
                    self.stdout.write(f'\nFirst upcoming task:')
                    self.stdout.write(json.dumps(results[0] if results else {}, indent=2))
                else:
                    self.stdout.write('No upcoming tasks found')
            else:
                self.stdout.write(self.style.ERROR(f'❌ Failed: {upcoming_response.content.decode()}'))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error: {str(e)}'))

        # Step 4: Test all notifications endpoint
        self.stdout.write(self.style.WARNING(f'\n4️⃣ Testing GET /api/v1/notifications/all/?days={days}'))
        try:
            all_response = client.get(
                f'/api/v1/notifications/all/?days={days}',
                headers=headers
            )

            self.stdout.write(f'Status Code: {all_response.status_code}')
            
            if all_response.status_code == 200:
                all_data = json.loads(all_response.content)
                overdue_count = all_data.get('overdue_count', 0)
                upcoming_count = all_data.get('upcoming_count', 0)
                total_count = all_data.get('total_count', 0)
                days_param = all_data.get('days', days)
                
                self.stdout.write(self.style.SUCCESS('✅ Success!'))
                self.stdout.write(f'  Overdue: {overdue_count}')
                self.stdout.write(f'  Upcoming (next {days_param} days): {upcoming_count}')
                self.stdout.write(f'  Total: {total_count}')
            else:
                self.stdout.write(self.style.ERROR(f'❌ Failed: {all_response.content.decode()}'))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error: {str(e)}'))

        self.stdout.write(self.style.SUCCESS('\n' + '=' * 60))
        self.stdout.write(self.style.SUCCESS('✅ Testing completed!'))

