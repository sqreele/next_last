#!/usr/bin/env python3
"""
Simple monitoring script that works without external dependencies
"""
import os
import sys
import time
import json
import requests
from datetime import datetime
from django.core.cache import cache
from django.db import connection

# Add Django project to path
sys.path.append('/home/sqreele/next_last/backend/myLubd/src')

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
import django
django.setup()


class SimpleMonitor:
    """
    Simple monitoring without external dependencies
    """
    
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.metrics = {
            'request_count': 0,
            'total_response_time': 0,
            'database_queries': 0,
            'cache_hits': 0,
            'cache_misses': 0
        }
    
    def get_database_stats(self):
        """Get basic database statistics"""
        try:
            queries = connection.queries
            return {
                'total_queries': len(queries),
                'slow_queries': len([q for q in queries if float(q['time']) > 0.1]),
                'average_query_time': sum(float(q['time']) for q in queries) / len(queries) if queries else 0
            }
        except Exception as e:
            return {
                'total_queries': 0,
                'slow_queries': 0,
                'average_query_time': 0,
                'error': str(e)
            }
    
    def get_cache_stats(self):
        """Get basic cache statistics"""
        try:
            # Test cache with a simple operation
            test_key = f"monitor_test_{int(time.time())}"
            test_value = {"test": True, "timestamp": time.time()}
            
            start_time = time.time()
            cache.set(test_key, test_value, 10)
            set_time = time.time() - start_time
            
            start_time = time.time()
            retrieved = cache.get(test_key)
            get_time = time.time() - start_time
            
            cache.delete(test_key)
            
            return {
                'status': 'healthy' if retrieved == test_value else 'unhealthy',
                'set_time': set_time,
                'get_time': get_time
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def get_api_status(self):
        """Check API endpoint status"""
        endpoints = [
            ('/api/v1/health/', 'Health Check'),
            ('/api/v1/properties/', 'Properties'),
            ('/api/v1/jobs/', 'Jobs')
        ]
        
        results = []
        for endpoint, name in endpoints:
            try:
                start_time = time.time()
                response = requests.get(f"{self.base_url}{endpoint}", timeout=5)
                response_time = time.time() - start_time
                
                results.append({
                    'name': name,
                    'status': response.status_code,
                    'response_time': response_time,
                    'healthy': response.status_code == 200
                })
            except Exception as e:
                results.append({
                    'name': name,
                    'status': 'error',
                    'response_time': 0,
                    'healthy': False,
                    'error': str(e)
                })
        
        return results
    
    def get_system_info(self):
        """Get basic system information"""
        try:
            # Get process memory usage (basic)
            import resource
            memory_usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            
            return {
                'memory_usage_mb': memory_usage / 1024,  # Convert to MB
                'timestamp': datetime.now().isoformat(),
                'python_version': sys.version,
                'django_version': django.get_version()
            }
        except Exception as e:
            return {
                'memory_usage_mb': 0,
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
    
    def get_monitoring_data(self):
        """Get comprehensive monitoring data"""
        return {
            'timestamp': datetime.now().isoformat(),
            'database': self.get_database_stats(),
            'cache': self.get_cache_stats(),
            'api_status': self.get_api_status(),
            'system': self.get_system_info(),
            'metrics': self.metrics
        }
    
    def display_monitoring_data(self):
        """Display monitoring data in a nice format"""
        data = self.get_monitoring_data()
        
        print("=" * 60)
        print("🔍 PCMS BACKEND MONITORING")
        print("=" * 60)
        print(f"Time: {data['timestamp']}")
        print("=" * 60)
        
        # Database stats
        print("\n📊 DATABASE PERFORMANCE")
        print("-" * 30)
        db_stats = data['database']
        print(f"Total Queries: {db_stats['total_queries']}")
        print(f"Slow Queries: {db_stats['slow_queries']}")
        print(f"Avg Query Time: {db_stats['average_query_time']:.3f}s")
        
        # Cache stats
        print("\n⚡ CACHE PERFORMANCE")
        print("-" * 30)
        cache_stats = data['cache']
        print(f"Status: {'✅ Healthy' if cache_stats['status'] == 'healthy' else '❌ Unhealthy'}")
        print(f"Set Time: {cache_stats['set_time']:.3f}s")
        print(f"Get Time: {cache_stats['get_time']:.3f}s")
        
        # API status
        print("\n🌐 API STATUS")
        print("-" * 30)
        for api in data['api_status']:
            status_icon = "✅" if api['healthy'] else "❌"
            print(f"{api['name']}: {status_icon} {api['status']} ({api['response_time']:.3f}s)")
        
        # System info
        print("\n💻 SYSTEM INFO")
        print("-" * 30)
        system = data['system']
        print(f"Memory Usage: {system['memory_usage_mb']:.1f} MB")
        print(f"Python Version: {system['python_version'].split()[0]}")
        print(f"Django Version: {system['django_version']}")
        
        print("\n" + "=" * 60)
    
    def run_continuous(self, interval=5):
        """Run monitoring continuously"""
        try:
            while True:
                os.system('clear' if os.name == 'posix' else 'cls')
                self.display_monitoring_data()
                print(f"\nRefreshing every {interval} seconds... Press Ctrl+C to exit")
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\n\nMonitoring stopped by user.")
        except Exception as e:
            print(f"\nError in monitoring: {e}")
    
    def run_once(self):
        """Run monitoring once and exit"""
        self.display_monitoring_data()


def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='PCMS Simple Monitor')
    parser.add_argument('--url', default='http://localhost:8000', help='Backend URL')
    parser.add_argument('--interval', type=int, default=5, help='Refresh interval in seconds')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    
    args = parser.parse_args()
    
    monitor = SimpleMonitor(args.url)
    
    if args.once:
        monitor.run_once()
    else:
        monitor.run_continuous(args.interval)


if __name__ == "__main__":
    main()
