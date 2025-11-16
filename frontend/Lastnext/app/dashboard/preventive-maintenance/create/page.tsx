'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PreventiveMaintenanceForm from '@/app/components/preventive/PreventiveMaintenanceForm';
import { PreventiveMaintenance } from '@/app/lib/preventiveMaintenanceModels';
import { useProperties, useUser } from '@/app/lib/stores/mainStore';

// Create page content component that doesn't require context
function CreatePageContent() {
  const router = useRouter();
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submittedData, setSubmittedData] = useState<any>(null);
  const searchParams = useSearchParams();
  const { selectedPropertyId, setSelectedPropertyId } = useUser();
  const { properties } = useProperties();

  const queryMachineId = useMemo(() => searchParams.get('machine_id') ?? undefined, [searchParams]);
  const queryPropertyId = useMemo(() => searchParams.get('property_id'), [searchParams]);

  useEffect(() => {
    if (!queryPropertyId || queryPropertyId === selectedPropertyId) {
      return;
    }

    // Wait until the user's accessible properties are loaded before attempting to sync
    if (!properties || properties.length === 0) {
      return;
    }

    const hasAccessToProperty = properties.some(
      (property) => property.property_id === queryPropertyId
    );

    if (hasAccessToProperty) {
      setSelectedPropertyId(queryPropertyId);
    } else {
      console.warn(
        '[PreventiveMaintenanceCreate] Query property is not in the user property list',
        { queryPropertyId }
      );
    }
  }, [properties, queryPropertyId, selectedPropertyId, setSelectedPropertyId]);

  // Handle successful form submission
  const handleSuccess = (data: PreventiveMaintenance) => {
    // Log the full data structure for debugging
    console.log('Form submitted successfully with data:', JSON.stringify(data));
    
    // Store the data in state for possible use in the UI
    setSubmittedData(data);
    setIsSubmitted(true);
    
    // Redirect after a short delay to show success message
    setTimeout(() => {
      try {
        // Check if pm_id exists, with multiple safety checks
        if (data && typeof data === 'object' && 'pm_id' in data && data.pm_id) {
          const pmId = data.pm_id;
          console.log(`Redirecting to PM details page: ${pmId}`);
          router.push(`/dashboard/preventive-maintenance/${pmId}`);
        } else {
          console.warn('PM ID is undefined or invalid, redirecting to dashboard instead');
          router.push('/dashboard/preventive-maintenance/dashboard');
        }
      } catch (error) {
        console.error('Error during redirect:', error);
        // Fallback to dashboard on any error
        router.push('/dashboard/preventive-maintenance/dashboard');
      }
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-3 sm:py-6 sm:px-4 md:py-8 md:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Preventive Maintenance</h1>
        <Link 
          href="/dashboard/preventive-maintenance" 
          className="inline-flex items-center justify-center bg-gray-100 py-2 px-4 rounded-md text-gray-700 hover:bg-gray-200 text-sm sm:text-base transition-colors min-h-[44px] touch-target"
        >
          Back to List
        </Link>
      </div>

        {isSubmitted ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>Preventive maintenance created successfully! Redirecting...</p>
          {submittedData && submittedData.pm_id && (
            <p className="mt-2 text-sm">
              Record ID: {submittedData.pm_id}
            </p>
          )}
        </div>
        ) : (
          <PreventiveMaintenanceForm
            onSuccessAction={handleSuccess}
            machineId={queryMachineId}
          />
        )}
    </div>
  );
}

// Main page component
export default function CreatePreventiveMaintenancePage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <CreatePageContent />
    </div>
  );
}