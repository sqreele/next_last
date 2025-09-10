#!/usr/bin/env python3
"""
Real-time monitoring script for PCMS backend
"""
import os
import sys
import time
import json
import requests
from datetime import datetime
import argparse

# Add Django project to path
sys.path.append('/home/sqreele/next_last/backend/myLubd/src')

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
import django
django.setup()

from myappLubd.monitoring import performance_monitor, SystemMonitor, HealthChecker


class RealTimeMonitor:
    """
    Real-time monitoring display
    """
    
    def __init__(self, base_url="http://localhost:8000", refresh_interval=5):
        self.base_url = base_url
        self.refresh_interval = refresh_interval
        self.running = True
    
    def clear_screen(self):
        """Clear terminal screen"""
        os.system('clear' if os.name == 'posix' else 'cls')
    
    def get_api_data(self, endpoint):
        """Get data from API endpoint"""
        try:
            response = requests.get(f"{self.base_url}{endpoint}", timeout=5)
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": f"HTTP {response.status_code}"}
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}
    
    def format_bytes(self, bytes_value):
        """Format bytes to human readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if bytes_value < 1024.0:
                return f"{bytes_value:.1f} {unit}"
            bytes_value /= 1024.0
        return f"{bytes_value:.1f} PB"
    
    def format_percentage(self, value, total):
        """Format percentage"""
        if total == 0:
            return "0.0%"
        return f"{(value / total) * 100:.1f}%"
    
    def display_header(self):
        """Display monitoring header"""
        print("=" * 80)
        print("🔍 PCMS BACKEND REAL-TIME MONITORING")
        print("=" * 80)
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Refresh: {self.refresh_interval}s | Press Ctrl+C to exit")
        print("=" * 80)
    
    def display_performance_metrics(self):
        """Display performance metrics"""
        print("\n📊 PERFORMANCE METRICS")
        print("-" * 40)
        
        metrics = performance_monitor.get_metrics()
        avg_response_time = performance_monitor.get_average_response_time()
        cache_hit_rate = performance_monitor.get_cache_hit_rate()
        
        print(f"Total Requests: {metrics['request_count']}")
        print(f"Avg Response Time: {avg_response_time:.3f}s")
        print(f"Cache Hit Rate: {cache_hit_rate:.1%}")
        print(f"Database Queries: {metrics['database_queries']}")
        print(f"Slow Queries: {metrics['slow_queries']}")
    
    def display_system_resources(self):
        """Display system resource usage"""
        print("\n💻 SYSTEM RESOURCES")
        print("-" * 40)
        
        try:
            resources = SystemMonitor.get_system_health()
            memory = resources['memory']
            cpu = resources['cpu']
            disk = resources['disk']
            
            print(f"CPU Usage: {cpu:.1f}%")
            print(f"Memory Usage: {memory['percent']:.1f}% ({self.format_bytes(memory['rss'])})")
            print(f"Memory Available: {self.format_bytes(memory['available'])}")
            print(f"Disk Usage: {disk['percent']:.1f}% ({self.format_bytes(disk['used'])}/{self.format_bytes(disk['total'])})")
        except Exception as e:
            print(f"Error getting system resources: {e}")
    
    def display_health_status(self):
        """Display health status"""
        print("\n🏥 HEALTH STATUS")
        print("-" * 40)
        
        try:
            health = HealthChecker.get_overall_health()
            
            # Database health
            db_status = health['database']['status']
            db_icon = "✅" if db_status == 'healthy' else "❌"
            print(f"Database: {db_icon} {db_status}")
            
            # Cache health
            cache_status = health['cache']['status']
            cache_icon = "✅" if cache_status == 'healthy' else "❌"
            print(f"Cache: {cache_icon} {cache_status}")
            
            # Overall status
            overall_status = "healthy" if db_status == "healthy" and cache_status == "healthy" else "unhealthy"
            overall_icon = "✅" if overall_status == 'healthy' else "❌"
            print(f"Overall: {overall_icon} {overall_status}")
            
        except Exception as e:
            print(f"Error getting health status: {e}")
    
    def display_api_status(self):
        """Display API endpoint status"""
        print("\n🌐 API STATUS")
        print("-" * 40)
        
        endpoints = [
            ('/api/v1/health/', 'Health Check'),
            ('/api/v1/properties/', 'Properties'),
            ('/api/v1/jobs/', 'Jobs'),
            ('/api/v1/preventive-maintenance/', 'Preventive Maintenance')
        ]
        
        for endpoint, name in endpoints:
            try:
                start_time = time.time()
                response = requests.get(f"{self.base_url}{endpoint}", timeout=3)
                response_time = time.time() - start_time
                
                status_icon = "✅" if response.status_code == 200 else "❌"
                print(f"{name}: {status_icon} {response.status_code} ({response_time:.3f}s)")
            except Exception as e:
                print(f"{name}: ❌ Error ({str(e)[:30]}...)")
    
    def display_recent_activity(self):
        """Display recent activity"""
        print("\n📈 RECENT ACTIVITY")
        print("-" * 40)
        
        try:
            # Get recent requests from cache
            from django.core.cache import cache
            recent_requests = cache.get('recent_requests', [])
            
            if recent_requests:
                print("Recent Requests:")
                for req in recent_requests[-5:]:  # Last 5 requests
                    timestamp = req.get('timestamp', 'Unknown')
                    method = req.get('method', 'Unknown')
                    path = req.get('path', 'Unknown')
                    status = req.get('status_code', 'Unknown')
                    response_time = req.get('response_time', 'Unknown')
                    
                    print(f"  {timestamp} {method} {path} -> {status} ({response_time})")
            else:
                print("No recent activity data available")
                
        except Exception as e:
            print(f"Error getting recent activity: {e}")
    
    def run(self):
        """Run the monitoring display"""
        try:
            while self.running:
                self.clear_screen()
                self.display_header()
                self.display_performance_metrics()
                self.display_system_resources()
                self.display_health_status()
                self.display_api_status()
                self.display_recent_activity()
                
                print("\n" + "=" * 80)
                print("Press Ctrl+C to exit...")
                
                time.sleep(self.refresh_interval)
                
        except KeyboardInterrupt:
            print("\n\nMonitoring stopped by user.")
            self.running = False
        except Exception as e:
            print(f"\nError in monitoring: {e}")
            self.running = False


def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='PCMS Backend Real-time Monitor')
    parser.add_argument('--url', default='http://localhost:8000', help='Backend URL')
    parser.add_argument('--interval', type=int, default=5, help='Refresh interval in seconds')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    
    args = parser.parse_args()
    
    monitor = RealTimeMonitor(args.url, args.interval)
    
    if args.once:
        # Run once
        monitor.clear_screen()
        monitor.display_header()
        monitor.display_performance_metrics()
        monitor.display_system_resources()
        monitor.display_health_status()
        monitor.display_api_status()
        monitor.display_recent_activity()
    else:
        # Run continuously
        monitor.run()


if __name__ == "__main__":
    main()
