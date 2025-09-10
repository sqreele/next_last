"""
Performance testing script for the PCMS backend
"""
import os
import sys
import django
import time
import requests
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from myappLubd.models import Job, Property, Room, Topic, PreventiveMaintenance

User = get_user_model()


class PerformanceTester:
    """
    Performance testing utilities
    """
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.client = Client()
        self.results = []
    
    def test_database_performance(self) -> Dict[str, Any]:
        """
        Test database query performance
        """
        print("Testing database performance...")
        
        # Clear query log
        connection.queries.clear()
        
        start_time = time.time()
        
        # Test Job queries
        jobs = list(Job.objects.select_related('user').prefetch_related('rooms', 'topics')[:100])
        job_time = time.time() - start_time
        
        # Test Property queries
        start_time = time.time()
        properties = list(Property.objects.prefetch_related('rooms', 'users')[:50])
        property_time = time.time() - start_time
        
        # Test PreventiveMaintenance queries
        start_time = time.time()
        pm_tasks = list(PreventiveMaintenance.objects.select_related('job', 'created_by').prefetch_related('topics', 'machines')[:50])
        pm_time = time.time() - start_time
        
        total_queries = len(connection.queries)
        
        return {
            'job_query_time': job_time,
            'property_query_time': property_time,
            'pm_query_time': pm_time,
            'total_queries': total_queries,
            'jobs_retrieved': len(jobs),
            'properties_retrieved': len(properties),
            'pm_tasks_retrieved': len(pm_tasks)
        }
    
    def test_cache_performance(self) -> Dict[str, Any]:
        """
        Test cache performance
        """
        print("Testing cache performance...")
        
        # Test cache set/get
        test_data = {'test': 'data', 'timestamp': time.time()}
        
        # Set cache
        start_time = time.time()
        cache.set('performance_test', test_data, 300)
        set_time = time.time() - start_time
        
        # Get cache
        start_time = time.time()
        retrieved_data = cache.get('performance_test')
        get_time = time.time() - start_time
        
        # Test cache miss
        start_time = time.time()
        cache.get('non_existent_key')
        miss_time = time.time() - start_time
        
        return {
            'cache_set_time': set_time,
            'cache_get_time': get_time,
            'cache_miss_time': miss_time,
            'data_retrieved': retrieved_data == test_data
        }
    
    def test_api_endpoints(self) -> Dict[str, Any]:
        """
        Test API endpoint performance
        """
        print("Testing API endpoints...")
        
        endpoints = [
            '/api/v1/health/',
            '/api/v1/properties/',
            '/api/v1/rooms/',
            '/api/v1/jobs/',
            '/api/v1/preventive-maintenance/',
        ]
        
        results = {}
        
        for endpoint in endpoints:
            start_time = time.time()
            try:
                response = self.client.get(endpoint)
                response_time = time.time() - start_time
                
                results[endpoint] = {
                    'status_code': response.status_code,
                    'response_time': response_time,
                    'success': response.status_code == 200
                }
            except Exception as e:
                results[endpoint] = {
                    'status_code': 500,
                    'response_time': time.time() - start_time,
                    'success': False,
                    'error': str(e)
                }
        
        return results
    
    def test_concurrent_requests(self, num_requests: int = 10) -> Dict[str, Any]:
        """
        Test concurrent request handling
        """
        print(f"Testing {num_requests} concurrent requests...")
        
        def make_request():
            start_time = time.time()
            try:
                response = self.client.get('/api/v1/health/')
                return {
                    'status_code': response.status_code,
                    'response_time': time.time() - start_time,
                    'success': response.status_code == 200
                }
            except Exception as e:
                return {
                    'status_code': 500,
                    'response_time': time.time() - start_time,
                    'success': False,
                    'error': str(e)
                }
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=num_requests) as executor:
            futures = [executor.submit(make_request) for _ in range(num_requests)]
            results = [future.result() for future in as_completed(futures)]
        
        total_time = time.time() - start_time
        
        successful_requests = sum(1 for r in results if r['success'])
        average_response_time = sum(r['response_time'] for r in results) / len(results)
        
        return {
            'total_requests': num_requests,
            'successful_requests': successful_requests,
            'failed_requests': num_requests - successful_requests,
            'total_time': total_time,
            'average_response_time': average_response_time,
            'requests_per_second': num_requests / total_time,
            'results': results
        }
    
    def test_memory_usage(self) -> Dict[str, Any]:
        """
        Test memory usage
        """
        print("Testing memory usage...")
        
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        memory_before = process.memory_info().rss
        
        # Create some test data
        test_data = []
        for i in range(1000):
            test_data.append({
                'id': i,
                'name': f'Test Item {i}',
                'description': f'Description for test item {i}' * 10,
                'data': list(range(100))
            })
        
        memory_after = process.memory_info().rss
        memory_used = memory_after - memory_before
        
        # Clean up
        del test_data
        
        return {
            'memory_before': memory_before,
            'memory_after': memory_after,
            'memory_used': memory_used,
            'memory_used_mb': memory_used / (1024 * 1024)
        }
    
    def run_all_tests(self) -> Dict[str, Any]:
        """
        Run all performance tests
        """
        print("Starting performance tests...")
        
        results = {
            'database': self.test_database_performance(),
            'cache': self.test_cache_performance(),
            'api_endpoints': self.test_api_endpoints(),
            'concurrent_requests': self.test_concurrent_requests(),
            'memory_usage': self.test_memory_usage(),
            'timestamp': time.time()
        }
        
        return results
    
    def print_results(self, results: Dict[str, Any]):
        """
        Print test results in a formatted way
        """
        print("\n" + "="*50)
        print("PERFORMANCE TEST RESULTS")
        print("="*50)
        
        # Database Performance
        db_results = results['database']
        print(f"\nDatabase Performance:")
        print(f"  Job queries: {db_results['job_query_time']:.3f}s ({db_results['jobs_retrieved']} items)")
        print(f"  Property queries: {db_results['property_query_time']:.3f}s ({db_results['properties_retrieved']} items)")
        print(f"  PM queries: {db_results['pm_query_time']:.3f}s ({db_results['pm_tasks_retrieved']} items)")
        print(f"  Total queries: {db_results['total_queries']}")
        
        # Cache Performance
        cache_results = results['cache']
        print(f"\nCache Performance:")
        print(f"  Set time: {cache_results['cache_set_time']:.6f}s")
        print(f"  Get time: {cache_results['cache_get_time']:.6f}s")
        print(f"  Miss time: {cache_results['cache_miss_time']:.6f}s")
        print(f"  Data integrity: {'✓' if cache_results['data_retrieved'] else '✗'}")
        
        # API Endpoints
        api_results = results['api_endpoints']
        print(f"\nAPI Endpoints:")
        for endpoint, result in api_results.items():
            status = "✓" if result['success'] else "✗"
            print(f"  {endpoint}: {status} {result['response_time']:.3f}s ({result['status_code']})")
        
        # Concurrent Requests
        concurrent_results = results['concurrent_requests']
        print(f"\nConcurrent Requests:")
        print(f"  Total: {concurrent_results['total_requests']}")
        print(f"  Successful: {concurrent_results['successful_requests']}")
        print(f"  Failed: {concurrent_results['failed_requests']}")
        print(f"  Average response time: {concurrent_results['average_response_time']:.3f}s")
        print(f"  Requests per second: {concurrent_results['requests_per_second']:.2f}")
        
        # Memory Usage
        memory_results = results['memory_usage']
        print(f"\nMemory Usage:")
        print(f"  Memory used: {memory_results['memory_used_mb']:.2f} MB")
        
        print("\n" + "="*50)


def main():
    """
    Main function to run performance tests
    """
    tester = PerformanceTester()
    
    try:
        results = tester.run_all_tests()
        tester.print_results(results)
        
        # Save results to file
        with open('performance_test_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\nResults saved to performance_test_results.json")
        
    except Exception as e:
        print(f"Error running performance tests: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
