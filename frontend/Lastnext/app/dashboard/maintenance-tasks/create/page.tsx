'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';

export default function CreateMaintenanceTaskPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/maintenance-tasks">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Create Maintenance Task</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create via Django Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            Maintenance tasks (procedures/templates) are best created through the Django admin interface
            where you can manage detailed steps, tools, and safety notes.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">How to create a maintenance task:</h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800 text-sm">
              <li>Go to Django Admin: <code className="bg-blue-100 px-2 py-1 rounded">http://localhost:8000/admin/</code></li>
              <li>Navigate to <strong>Maintenance Tasks</strong> section</li>
              <li>Click <strong>"Add Maintenance Task"</strong></li>
              <li>Fill in:
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li>Equipment (Machine)</li>
                  <li>Task name and description</li>
                  <li>Frequency (daily, weekly, monthly, etc.)</li>
                  <li>Estimated duration</li>
                  <li>Responsible department</li>
                  <li>Difficulty level</li>
                  <li>Steps (JSON format)</li>
                  <li>Required tools</li>
                  <li>Safety notes</li>
                </ul>
              </li>
              <li>Save the task</li>
              <li>Return here to view and use it in preventive maintenance schedules</li>
            </ol>
          </div>

          <div className="flex gap-3">
            <Button asChild>
              <a href="http://localhost:8000/admin/myappLubd/maintenanceprocedure/add/" target="_blank" rel="noopener noreferrer">
                Open Django Admin
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/maintenance-tasks">
                View All Tasks
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Reference Card */}
      <Card>
        <CardHeader>
          <CardTitle>Task Template Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <h4 className="font-semibold text-gray-900">What is a Maintenance Task?</h4>
            <p className="text-gray-600">
              A maintenance task is a reusable template/procedure that defines HOW to perform maintenance
              on a specific piece of equipment. It includes:
            </p>
            <ul className="text-gray-600 space-y-1">
              <li><strong>Step-by-step instructions</strong> for performing the maintenance</li>
              <li><strong>Frequency</strong> of how often it should be done</li>
              <li><strong>Tools and materials</strong> required</li>
              <li><strong>Safety precautions</strong> and notes</li>
              <li><strong>Estimated time</strong> to complete</li>
              <li><strong>Skill level</strong> required</li>
            </ul>
            
            <h4 className="font-semibold text-gray-900 mt-4">How it's used:</h4>
            <p className="text-gray-600">
              Once created, these task templates can be used when creating Preventive Maintenance schedules.
              The schedule references the task and adds specific dates, assignments, and tracking.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

