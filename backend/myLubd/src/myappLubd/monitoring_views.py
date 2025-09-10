"""
Monitoring views for web interface
"""
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
from django.conf import settings
import json

from .monitoring_dashboard import MonitoringDashboard


@require_http_methods(["GET"])
def monitoring_dashboard_view(request):
    """
    Render the monitoring dashboard HTML page
    """
    # Create a simple HTML page that redirects to the correct API endpoint
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PCMS Backend Monitoring</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .container { max-width: 800px; margin: 0 auto; }
            .loading { color: #666; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 PCMS Backend Monitoring</h1>
            <p>Real-time system performance and health monitoring</p>
            <div class="loading">Loading monitoring data...</div>
            <div id="dashboard"></div>
        </div>
        
        <script>
            async function fetchMonitoringData() {
                try {
                    console.log('Fetching monitoring data from: /api/v1/monitoring/api/dashboard/');
                    const response = await fetch('/api/v1/monitoring/api/dashboard/');
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return await response.json();
                } catch (error) {
                    console.error('Error fetching monitoring data:', error);
                    return { error: error.message };
                }
            }
            
            function renderDashboard(data) {
                const dashboard = document.getElementById('dashboard');
                if (data.error) {
                    dashboard.innerHTML = `<div class="error">Error: ${data.error}</div>`;
                    return;
                }
                
                dashboard.innerHTML = `
                    <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h3>✅ Monitoring API Working!</h3>
                        <p><strong>Status:</strong> ${data.status}</p>
                        <p><strong>Timestamp:</strong> ${data.data.timestamp}</p>
                        <p><strong>Database Status:</strong> ${data.data.health.database.status}</p>
                        <p><strong>Cache Status:</strong> ${data.data.health.cache.status}</p>
                        <p><strong>Total Requests:</strong> ${data.data.performance.request_count}</p>
                        <p><strong>Average Response Time:</strong> ${data.data.performance.average_response_time.toFixed(3)}s</p>
                        <button onclick="location.reload()" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">
                            🔄 Refresh
                        </button>
                    </div>
                `;
            }
            
            // Load data on page load
            fetchMonitoringData().then(renderDashboard);
        </script>
    </body>
    </html>
    """
    from django.http import HttpResponse
    return HttpResponse(html_content, content_type='text/html')


@require_http_methods(["GET"])
def monitoring_data_api(request):
    """
    API endpoint for monitoring data (same as MonitoringDashboard)
    """
    dashboard = MonitoringDashboard()
    return dashboard.get(request)


@require_http_methods(["GET"])
def monitoring_export(request):
    """
    Export monitoring data as JSON
    """
    try:
        dashboard = MonitoringDashboard()
        response = dashboard.get(request)
        
        if response.status_code == 200:
            data = json.loads(response.content)
            
            # Add export metadata
            export_data = {
                'export_info': {
                    'timestamp': data['data']['timestamp'],
                    'exported_by': request.user.username if request.user.is_authenticated else 'anonymous',
                    'format': 'json'
                },
                'monitoring_data': data['data']
            }
            
            return JsonResponse(export_data, json_dumps_params={'indent': 2})
        else:
            return response
            
    except Exception as e:
        return JsonResponse({
            'error': 'Failed to export monitoring data',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def monitoring_alerts(request):
    """
    Get monitoring alerts and warnings
    """
    try:
        alerts = []
        
        # Check performance thresholds
        from .monitoring import performance_monitor
        metrics = performance_monitor.get_metrics()
        
        # High response time alert
        avg_response_time = performance_monitor.get_average_response_time()
        if avg_response_time > 1.0:
            alerts.append({
                'type': 'warning',
                'message': f'High average response time: {avg_response_time:.3f}s',
                'severity': 'medium'
            })
        
        # High query count alert
        if metrics['database_queries'] > 50:
            alerts.append({
                'type': 'warning',
                'message': f'High database query count: {metrics["database_queries"]}',
                'severity': 'medium'
            })
        
        # Low cache hit rate alert
        cache_hit_rate = performance_monitor.get_cache_hit_rate()
        if cache_hit_rate < 0.5:
            alerts.append({
                'type': 'warning',
                'message': f'Low cache hit rate: {cache_hit_rate:.1%}',
                'severity': 'low'
            })
        
        # System resource alerts
        from .monitoring import SystemMonitor
        system_health = SystemMonitor.get_system_health()
        
        # High CPU usage alert
        if system_health['cpu'] > 80:
            alerts.append({
                'type': 'critical',
                'message': f'High CPU usage: {system_health["cpu"]:.1f}%',
                'severity': 'high'
            })
        
        # High memory usage alert
        memory_percent = system_health['memory']['percent']
        if memory_percent > 85:
            alerts.append({
                'type': 'critical',
                'message': f'High memory usage: {memory_percent:.1f}%',
                'severity': 'high'
            })
        
        # High disk usage alert
        disk_percent = system_health['disk']['percent']
        if disk_percent > 90:
            alerts.append({
                'type': 'critical',
                'message': f'High disk usage: {disk_percent:.1f}%',
                'severity': 'high'
            })
        
        # Health status alerts
        from .monitoring import HealthChecker
        health = HealthChecker.get_overall_health()
        
        if health['database']['status'] != 'healthy':
            alerts.append({
                'type': 'critical',
                'message': f'Database health issue: {health["database"].get("error", "Unknown error")}',
                'severity': 'high'
            })
        
        if health['cache']['status'] != 'healthy':
            alerts.append({
                'type': 'warning',
                'message': f'Cache health issue: {health["cache"].get("error", "Unknown error")}',
                'severity': 'medium'
            })
        
        return JsonResponse({
            'status': 'success',
            'alerts': alerts,
            'total_alerts': len(alerts),
            'critical_count': len([a for a in alerts if a['severity'] == 'high']),
            'warning_count': len([a for a in alerts if a['severity'] in ['medium', 'low']])
        })
        
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def monitoring_history(request):
    """
    Get historical monitoring data
    """
    try:
        from django.core.cache import cache
        
        # Get historical data from cache
        history_data = cache.get('monitoring_history', [])
        
        # Limit to last 100 entries
        if len(history_data) > 100:
            history_data = history_data[-100:]
        
        return JsonResponse({
            'status': 'success',
            'data': history_data,
            'count': len(history_data)
        })
        
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def monitoring_clear_history(request):
    """
    Clear monitoring history
    """
    try:
        from django.core.cache import cache
        cache.delete('monitoring_history')
        
        return JsonResponse({
            'status': 'success',
            'message': 'Monitoring history cleared successfully'
        })
        
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)
