#!/usr/bin/env python3
"""
Setup script for PCMS monitoring system
"""
import os
import sys
import subprocess
import django
from pathlib import Path

# Add Django project to path
project_root = Path(__file__).parent / "src"
sys.path.insert(0, str(project_root))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

def install_requirements():
    """Install required packages"""
    print("📦 Installing monitoring requirements...")
    
    try:
        # Install psutil for system monitoring
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil>=5.9.0"])
        print("✅ psutil installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install psutil: {e}")
        print("⚠️  Monitoring will work but with limited system metrics")
    
    try:
        # Install requests for API monitoring
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests>=2.25.0"])
        print("✅ requests installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install requests: {e}")
        print("⚠️  API monitoring may not work properly")

def test_monitoring():
    """Test monitoring system"""
    print("\n🧪 Testing monitoring system...")
    
    try:
        from myappLubd.monitoring import performance_monitor, SystemMonitor, HealthChecker
        
        # Test performance monitor
        print("Testing performance monitor...")
        metrics = performance_monitor.get_metrics()
        print(f"✅ Performance monitor working: {metrics['request_count']} requests")
        
        # Test system monitor
        print("Testing system monitor...")
        system_health = SystemMonitor.get_system_health()
        print(f"✅ System monitor working: CPU {system_health['cpu']}%")
        
        # Test health checker
        print("Testing health checker...")
        health = HealthChecker.get_overall_health()
        print(f"✅ Health checker working: Database {health['database']['status']}")
        
        print("\n🎉 All monitoring systems are working!")
        return True
        
    except Exception as e:
        print(f"❌ Monitoring test failed: {e}")
        return False

def create_monitoring_directories():
    """Create necessary directories for monitoring"""
    print("\n📁 Creating monitoring directories...")
    
    # Create templates directory
    templates_dir = project_root / "myappLubd" / "templates" / "monitoring"
    templates_dir.mkdir(parents=True, exist_ok=True)
    print(f"✅ Created templates directory: {templates_dir}")
    
    # Create logs directory
    logs_dir = project_root / "logs"
    logs_dir.mkdir(exist_ok=True)
    print(f"✅ Created logs directory: {logs_dir}")

def show_monitoring_urls():
    """Show available monitoring URLs"""
    print("\n🌐 Available monitoring URLs:")
    print("=" * 50)
    print("Web Dashboard:")
    print("  http://localhost:8000/api/v1/monitoring/")
    print("\nAPI Endpoints:")
    print("  http://localhost:8000/api/v1/monitoring/health/")
    print("  http://localhost:8000/api/v1/monitoring/performance/")
    print("  http://localhost:8000/api/v1/monitoring/system/")
    print("  http://localhost:8000/api/v1/monitoring/api/dashboard/")
    print("\nCommand Line Monitoring:")
    print("  python src/myappLubd/monitor_realtime.py")

def main():
    """Main setup function"""
    print("🔍 PCMS Monitoring System Setup")
    print("=" * 40)
    
    # Install requirements
    install_requirements()
    
    # Create directories
    create_monitoring_directories()
    
    # Test monitoring
    if test_monitoring():
        show_monitoring_urls()
        print("\n✅ Monitoring setup completed successfully!")
        print("\nTo start monitoring:")
        print("1. Start your Django server: python manage.py runserver")
        print("2. Open the web dashboard: http://localhost:8000/api/v1/monitoring/")
        print("3. Or run command line monitor: python src/myappLubd/monitor_realtime.py")
    else:
        print("\n❌ Monitoring setup failed. Please check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
