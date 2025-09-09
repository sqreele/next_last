from flask import Flask, render_template, request, redirect, url_for, jsonify
from job_manager import JobManager, JobStatus
from email_service import EmailService
from datetime import datetime
import os

app = Flask(__name__)
app.secret_key = os.urandom(24)

@app.route('/')
def index():
    """Dashboard showing today's jobs"""
    manager = JobManager()
    summary = manager.get_daily_summary()
    manager.close()
    return render_template('dashboard.html', summary=summary)

@app.route('/add_job', methods=['GET', 'POST'])
def add_job():
    """Add a new job"""
    if request.method == 'POST':
        manager = JobManager()
        job = manager.add_job(
            job_name=request.form['job_name'],
            description=request.form.get('description')
        )
        manager.close()
        return redirect(url_for('index'))
    return render_template('add_job.html')

@app.route('/update_job/<int:job_id>', methods=['POST'])
def update_job(job_id):
    """Update job status"""
    status_map = {
        'pending': JobStatus.PENDING,
        'running': JobStatus.RUNNING,
        'completed': JobStatus.COMPLETED,
        'failed': JobStatus.FAILED,
        'cancelled': JobStatus.CANCELLED
    }
    
    manager = JobManager()
    status = status_map.get(request.form['status'])
    error_message = request.form.get('error_message')
    
    manager.update_job_status(job_id, status, error_message)
    manager.close()
    
    return redirect(url_for('index'))

@app.route('/send_report', methods=['POST'])
def send_report():
    """Send email report manually"""
    manager = JobManager()
    email_service = EmailService()
    
    summary = manager.get_daily_summary()
    success = email_service.send_daily_summary(summary)
    
    manager.close()
    
    return jsonify({'success': success})

@app.route('/api/jobs/today')
def api_jobs_today():
    """API endpoint for today's jobs"""
    manager = JobManager()
    summary = manager.get_daily_summary()
    manager.close()
    
    # Convert jobs to JSON-serializable format
    jobs_data = []
    for job in summary['jobs']:
        jobs_data.append({
            'id': job.id,
            'job_name': job.job_name,
            'status': job.status.value,
            'description': job.description,
            'created_at': job.created_at.isoformat(),
            'updated_at': job.updated_at.isoformat(),
            'error_message': job.error_message
        })
    
    return jsonify({
        'date': summary['date'],
        'total_jobs': summary['total_jobs'],
        'status_breakdown': summary['status_breakdown'],
        'jobs': jobs_data
    })

if __name__ == '__main__':
    # Create templates directory
    os.makedirs('templates', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=5000)