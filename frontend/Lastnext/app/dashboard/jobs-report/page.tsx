"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Building2, Info, FileText, Download } from 'lucide-react';
import JobsReport from '@/app/components/jobs/JobsReport';
import { useUser, useProperties } from '@/app/lib/stores/mainStore';

export default function JobsReportPage() {
  const { selectedPropertyId: selectedProperty, userProfile } = useUser();
  const { properties: userProperties } = useProperties();

  return (
    <div className="min-h-screen bg-white">
      {/* Instagram-style header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">Jobs Report</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Property Selection Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Current Property Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedProperty ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default">Selected</Badge>
                <span className="font-medium">
                  {userProperties.find(p => p.property_id === selectedProperty)?.name || `Property ${selectedProperty}`}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Property ID: {selectedProperty}
              </p>
              <p className="text-sm text-gray-600">
                This property was automatically selected based on your user profile and preferences.
              </p>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No property selected. Please select a property to view the jobs report.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Your Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Username</p>
                <p className="text-sm text-gray-600">{userProfile?.username || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Position</p>
                <p className="text-sm text-gray-600">{userProfile?.positions || 'N/A'}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Available Properties</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {userProfile?.properties?.map((property: any) => (
                  <Badge 
                    key={property.property_id || property.id} 
                    variant={property.property_id === selectedProperty || property.id === selectedProperty ? "default" : "outline"}
                  >
                    {property.name || `Property ${property.property_id || property.id}`}
                  </Badge>
                )) || <span className="text-sm text-gray-500">No properties assigned</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            How the Property Selection Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                1
              </div>
              <div>
                <p className="font-medium text-gray-700">Automatic Property Detection</p>
                <p>The system automatically detects your assigned properties from your user profile and session data.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                2
              </div>
              <div>
                <p className="font-medium text-gray-700">Smart Property Filtering</p>
                <p>Jobs are automatically filtered based on your selected property, considering multiple property association methods.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                3
              </div>
              <div>
                <p className="font-medium text-gray-700">Comprehensive Reporting</p>
                <p>Generate detailed PDF reports with statistics, charts, and job details specific to your selected property.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Jobs Report Component */}
        <JobsReport />
      </div>
    </div>
  );
}
