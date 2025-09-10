#!/usr/bin/env python3
"""
Simple monitoring test without Django dependencies
"""
import requests
import json
import time

def test_monitoring_api():
    """Test the monitoring API endpoints"""
    base_url = "http://localhost:8000"
    
    print("🔍 Testing PCMS Monitoring API")
    print("=" * 50)
    
    # Test API dashboard endpoint
    try:
        print("\n1. Testing API Dashboard...")
        response = requests.get(f"{base_url}/api/v1/monitoring/api/dashboard/", timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('content-type', 'Unknown')}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Success! Data keys: {list(data.keys())}")
            if 'data' in data:
                print(f"   📊 Performance: {data['data']['performance']}")
                print(f"   🏥 Health: {data['data']['health']}")
        else:
            print(f"   ❌ Error: {response.text[:200]}")
            
    except Exception as e:
        print(f"   ❌ Request failed: {e}")
    
    # Test web dashboard
    try:
        print("\n2. Testing Web Dashboard...")
        response = requests.get(f"{base_url}/api/v1/monitoring/", timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('content-type', 'Unknown')}")
        
        if response.status_code == 200:
            if 'text/html' in response.headers.get('content-type', ''):
                print("   ✅ HTML Dashboard loaded successfully")
                # Check if the correct API endpoint is in the JavaScript
                if '/api/v1/monitoring/api/dashboard/' in response.text:
                    print("   ✅ Correct API endpoint found in JavaScript")
                else:
                    print("   ⚠️  API endpoint might be incorrect in JavaScript")
            else:
                print(f"   📄 Response: {response.text[:200]}...")
        else:
            print(f"   ❌ Error: {response.text[:200]}")
            
    except Exception as e:
        print(f"   ❌ Request failed: {e}")
    
    # Test health endpoint
    try:
        print("\n3. Testing Health Check...")
        response = requests.get(f"{base_url}/api/v1/monitoring/health/", timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Health Status: {data.get('status', 'Unknown')}")
            print(f"   🏥 Services: {data.get('services', {})}")
        else:
            print(f"   ❌ Error: {response.text[:200]}")
            
    except Exception as e:
        print(f"   ❌ Request failed: {e}")

def main():
    """Main test function"""
    print("🧪 PCMS Monitoring System Test")
    print("=" * 60)
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    test_monitoring_api()
    
    print("\n" + "=" * 60)
    print("✅ Monitoring test completed!")
    print("\nTo access monitoring:")
    print("🌐 Web Dashboard: http://localhost:8000/api/v1/monitoring/")
    print("📊 API Dashboard: http://localhost:8000/api/v1/monitoring/api/dashboard/")
    print("🏥 Health Check: http://localhost:8000/api/v1/monitoring/health/")

if __name__ == "__main__":
    main()
