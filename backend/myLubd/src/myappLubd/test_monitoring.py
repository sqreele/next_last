#!/usr/bin/env python3
"""
Test script for monitoring system
"""
import os
import sys
import requests
import json
from datetime import datetime

# Add Django project to path
sys.path.append('/home/sqreele/next_last/backend/myLubd/src')

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
import django
django.setup()

def test_monitoring_endpoints():
    """Test all monitoring endpoints"""
    base_url = "http://localhost:8000"
    
    endpoints = [
        ("/api/v1/monitoring/", "Web Dashboard"),
        ("/api/v1/monitoring/api/dashboard/", "API Dashboard"),
        ("/api/v1/monitoring/health/", "Health Check"),
        ("/api/v1/monitoring/performance/", "Performance"),
        ("/api/v1/monitoring/system/", "System Resources"),
        ("/api/v1/monitoring/api/alerts/", "Alerts"),
    ]
    
    print("🧪 Testing Monitoring Endpoints")
    print("=" * 50)
    
    for endpoint, name in endpoints:
        try:
            print(f"\nTesting {name}...")
            response = requests.get(f"{base_url}{endpoint}", timeout=10)
            
            print(f"  Status: {response.status_code}")
            print(f"  Content-Type: {response.headers.get('content-type', 'Unknown')}")
            
            if response.status_code == 200:
                if 'application/json' in response.headers.get('content-type', ''):
                    try:
                        data = response.json()
                        print(f"  ✅ JSON Response: {len(str(data))} characters")
                        if 'data' in data:
                            print(f"  📊 Data keys: {list(data['data'].keys()) if isinstance(data['data'], dict) else 'Not a dict'}")
                    except json.JSONDecodeError as e:
                        print(f"  ❌ JSON Parse Error: {e}")
                        print(f"  📄 Response preview: {response.text[:200]}...")
                else:
                    print(f"  📄 HTML Response: {len(response.text)} characters")
                    print(f"  📄 Preview: {response.text[:100]}...")
            else:
                print(f"  ❌ Error: {response.text[:200]}...")
                
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request Error: {e}")
        except Exception as e:
            print(f"  ❌ Unexpected Error: {e}")

def test_simple_monitor():
    """Test the simple monitor"""
    print("\n🔍 Testing Simple Monitor")
    print("=" * 50)
    
    try:
        from myappLubd.simple_monitor import SimpleMonitor
        
        monitor = SimpleMonitor()
        data = monitor.get_monitoring_data()
        
        print("✅ Simple Monitor Working!")
        print(f"📊 Database Queries: {data['database']['total_queries']}")
        print(f"⚡ Cache Status: {data['cache']['status']}")
        print(f"🌐 API Endpoints: {len(data['api_status'])}")
        print(f"💻 Memory Usage: {data['system']['memory_usage_mb']:.1f} MB")
        
    except Exception as e:
        print(f"❌ Simple Monitor Error: {e}")

def test_monitoring_imports():
    """Test monitoring module imports"""
    print("\n📦 Testing Monitoring Imports")
    print("=" * 50)
    
    try:
        from myappLubd.monitoring import performance_monitor, SystemMonitor, HealthChecker
        print("✅ All monitoring modules imported successfully")
        
        # Test performance monitor
        metrics = performance_monitor.get_metrics()
        print(f"📊 Performance Monitor: {metrics['request_count']} requests")
        
        # Test system monitor
        system_health = SystemMonitor.get_system_health()
        print(f"💻 System Monitor: CPU {system_health['cpu']}%")
        
        # Test health checker
        health = HealthChecker.get_overall_health()
        print(f"🏥 Health Checker: Database {health['database']['status']}")
        
    except Exception as e:
        print(f"❌ Import Error: {e}")

def main():
    """Main test function"""
    print("🔍 PCMS Monitoring System Test")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Test imports first
    test_monitoring_imports()
    
    # Test simple monitor
    test_simple_monitor()
    
    # Test API endpoints
    test_monitoring_endpoints()
    
    print("\n" + "=" * 60)
    print("✅ Monitoring test completed!")

if __name__ == "__main__":
    main()
