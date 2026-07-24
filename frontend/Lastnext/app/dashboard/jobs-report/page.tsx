"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { PageHeader, SectionCard } from "@/app/components/pcms-ui";
import { Badge } from "@/app/components/ui/badge";
import {
  Building2,
  Info,
  FileText,
  Download,
  CalendarRange,
} from "lucide-react";
import JobsReport from "@/app/components/jobs/JobsReport";
import { useUser, useProperties } from "@/app/lib/stores/mainStore";
import { getDisplayName } from "@/app/lib/utils/display-name";

export default function JobsReportPage() {
  const { selectedPropertyId: selectedProperty, userProfile } = useUser();
  const { properties: userProperties } = useProperties();

  return (
    <div className="space-y-6">
      <PageHeader
        title="PDF Report"
        description="Generate management-ready maintenance job reports by property and date range."
      />

      <SectionCard
        title="Generate PDF Report"
        description="Select a property and reporting period, then export a clean maintenance operations report."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-muted p-4">
            <CalendarRange className="mb-2 h-5 w-5 text-blue-600" />
            <p className="text-sm font-bold text-foreground">
              Date/property filters
            </p>
            <p className="text-xs text-muted-foreground">
              Use the report controls below.
            </p>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <FileText className="mb-2 h-5 w-5 text-violet-600" />
            <p className="text-sm font-bold text-foreground">
              Generated report list
            </p>
            <p className="text-xs text-muted-foreground">
              Review existing property reports.
            </p>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <Download className="mb-2 h-5 w-5 text-green-600" />
            <p className="text-sm font-bold text-foreground">
              Download buttons
            </p>
            <p className="text-xs text-muted-foreground">
              Export PDF Report files.
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="space-y-6">
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
                    {userProperties.find(
                      (p) => p.property_id === selectedProperty,
                    )?.name || `Property ${selectedProperty}`}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Property ID: {selectedProperty}
                </p>
                <p className="text-sm text-muted-foreground">
                  This property was automatically selected based on your user
                  profile and preferences.
                </p>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>
                  No property selected. Please select a property to view the
                  jobs report.
                </p>
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
                  <p className="text-sm font-medium text-muted-foreground">
                    Username
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {userProfile
                      ? getDisplayName(userProfile, "Unknown Technician")
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Position
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {userProfile?.positions || "N/A"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Available Properties
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {userProfile?.properties?.map((property: any) => (
                    <Badge
                      key={property.property_id || property.id}
                      variant={
                        property.property_id === selectedProperty ||
                        property.id === selectedProperty
                          ? "default"
                          : "outline"
                      }
                    >
                      {property.name ||
                        `Property ${property.property_id || property.id}`}
                    </Badge>
                  )) || (
                    <span className="text-sm text-muted-foreground">
                      No properties assigned
                    </span>
                  )}
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
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">
                    Automatic Property Detection
                  </p>
                  <p>
                    The system automatically detects your assigned properties
                    from your user profile and session data.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">
                    Smart Property Filtering
                  </p>
                  <p>
                    Jobs are automatically filtered based on your selected
                    property, considering multiple property association methods.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">
                    Comprehensive Reporting
                  </p>
                  <p>
                    Generate detailed reports with statistics, charts, and job
                    details specific to your selected property.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Generated PDF Report component */}
        <JobsReport />
      </div>
    </div>
  );
}
