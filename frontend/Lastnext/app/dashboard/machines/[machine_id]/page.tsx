'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/app/lib/session.client';
import apiClient from '@/app/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import {
  ArrowLeft,
  Wrench,
  Calendar,
  CheckCircle2,
  Clock,
  Users,
  Building,
  MapPin,
  FileText,
  History,
  Loader2,
  AlertCircle,
  QrCode,
  Download,
  Printer,
  AlertTriangle,
  XCircle,
  FilePlus2,
  Hash
} from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/app/lib/stores/mainStore';
import HeaderPropertyList from '@/app/components/jobs/HeaderPropertyList';
import dynamic from 'next/dynamic';

// Dynamically import QRCode to avoid SSR issues
const QRCode = dynamic(
  () => import('react-qr-code').then((mod: any) => mod.default || mod),
  {
    ssr: false,
    loading: () => (
      <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    ),
  }
) as React.ComponentType<{
  value: string;
  size?: number;
  level?: string;
  fgColor?: string;
  bgColor?: string;
}>;

interface Machine {
  id: number;
  machine_id: string;
  name: string;
  brand?: string;
  model?: string;
  manufacturer?: string;
  serial_number?: string;
  description?: string;
  location?: string;
  category?: string;
  status?: string;
  property: {
    property_id: string;
    name: string;
  };
  installation_date?: string;
  last_maintenance_date?: string;
  warranty_expiry?: string;
  notes?: string;
  preventive_maintenances?: PMHistory[];
  created_at?: string;
  updated_at?: string;
}

interface PMHistory {
  pm_id: string;
  pmtitle: string;
  scheduled_date: string;
  completed_date?: string;
  status: string;
  frequency: string;
  notes?: string;
  procedure_template_name?: string;
  created_by_details?: {
    id: number;
    username: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  };
}

const getUserDisplayName = (userDetails?: {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}) => {
  if (!userDetails) return 'Unassigned';
  return userDetails.full_name || 
         [userDetails.first_name, userDetails.last_name].filter(Boolean).join(' ').trim() || 
         userDetails.username;
};

export default function MachineDetailPage({ params }: { params: Promise<{ machine_id: string }> }) {
  const unwrappedParams = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedPropertyId: selectedProperty } = useUser();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [pmHistory, setPMHistory] = useState<PMHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const qrCodeRef = useRef<HTMLDivElement>(null);

  // Verify equipment location against selected property
  const verifyMachineProperty = (): { matches: boolean; message: string } => {
    if (!selectedProperty || !machine) {
      return { matches: true, message: 'No property selected or machine not loaded' };
    }
    
    const machinePropertyId = machine.property?.property_id;
    const matches = machinePropertyId === selectedProperty;
    
    if (matches) {
      return { matches: true, message: `Equipment is verified to be at ${machine.property?.name || 'selected property'}` };
    } else {
      return { 
        matches: false, 
        message: `Equipment is located at ${machine.property?.name || 'different property'}, not the selected property` 
      };
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMachineDetails();
    }
  }, [status, unwrappedParams.machine_id]);

  const fetchMachineDetails = async () => {
    setLoading(true);
    setLoadingHistory(true);
    setError(null);
    try {
      const response = await apiClient.get(`/api/v1/machines/${unwrappedParams.machine_id}/`);
      console.log('Machine details:', response.data);
      setMachine(response.data);
      
      // Extract PM history from the machine data
      if (response.data.preventive_maintenances) {
        const historyData = response.data.preventive_maintenances;
        console.log('🔍 [MACHINE] PM History from machine data:', historyData);
        console.log('🔍 [MACHINE] Sample PM record:', historyData[0]);
        // Sort by scheduled date (most recent first)
        historyData.sort((a: PMHistory, b: PMHistory) => 
          new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
        );
        setPMHistory(historyData);
      } else {
        // Fallback: fetch PM history separately
        fetchPMHistory();
        return;
      }
      setLoadingHistory(false);
    } catch (err: any) {
      console.error('Error fetching machine details:', err);
      setError(err.message || 'Failed to load machine details');
      setLoadingHistory(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchPMHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await apiClient.get('/api/v1/preventive-maintenance/', {
        params: {
          machine_id: unwrappedParams.machine_id,
          page_size: 100
        }
      });

      console.log('🔍 [MACHINE] Fallback PM History response:', response.data);

      let historyData: PMHistory[] = [];
      if (Array.isArray(response.data)) {
        historyData = response.data;
      } else if (response.data && 'results' in response.data) {
        historyData = response.data.results || [];
      }

      console.log('🔍 [MACHINE] Fallback PM History count:', historyData.length);
      if (historyData[0]) {
        console.log('🔍 [MACHINE] Fallback sample record:', historyData[0]);
      }

      // Sort by scheduled date (most recent first)
      historyData.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

      setPMHistory(historyData);
    } catch (err: any) {
      console.error('Error fetching PM history:', err);
      // Don't set error, just leave history empty
      setPMHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Generate machine URL for QR code
  const getMachineUrl = () => {
    if (typeof window !== 'undefined' && machine?.machine_id) {
      return `${window.location.origin}/dashboard/machines/${machine.machine_id}`;
    }
    return '';
  };

  // Download QR code as PNG
  const downloadQRCode = async () => {
    if (!qrCodeRef.current || !machine) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Get SVG element
      const svgElement = qrCodeRef.current.querySelector('svg');
      if (!svgElement) return;

      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create image from SVG
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        // Convert to blob and download
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `machine-${machine.machine_id}-qr-code.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
          URL.revokeObjectURL(svgUrl);
        });
      };
      img.src = svgUrl;
    } catch (error) {
      console.error('Error downloading QR code:', error);
    }
  };

  // Print QR code
  const printQRCode = () => {
    if (!qrCodeRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const qrContent = qrCodeRef.current.innerHTML;
    printWindow.document.write(`
      <html>
        <head>
          <title>Machine QR Code - ${machine?.machine_id}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: Arial, sans-serif;
            }
            h1 {
              margin-bottom: 20px;
              color: #333;
            }
            .qr-container {
              background: white;
              padding: 20px;
              border-radius: 8px;
            }
            .machine-info {
              margin-top: 20px;
              text-align: center;
              color: #666;
            }
          </style>
        </head>
        <body>
          <h1>Machine QR Code</h1>
          <div class="qr-container">
            ${qrContent}
          </div>
          <div class="machine-info">
            <p><strong>Machine ID:</strong> ${machine?.machine_id}</p>
            <p><strong>Name:</strong> ${machine?.name}</p>
            <p><strong>URL:</strong> ${getMachineUrl()}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading machine details...</p>
        </div>
      </div>
    );
  }

  if (error || !machine) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <p className="text-red-800 font-semibold">{error || 'Machine not found'}</p>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/machines">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Machines
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const propertyVerification = verifyMachineProperty();
  const createPreventiveLink = machine
    ? `/dashboard/preventive-maintenance/create?machine_id=${encodeURIComponent(machine.machine_id)}${
        machine.property?.property_id ? `&property_id=${encodeURIComponent(machine.property.property_id)}` : ''
      }`
    : '/dashboard/preventive-maintenance/create';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/machines">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Wrench className="h-6 w-6 text-blue-600" />
                </div>
                {machine.name}
              </h1>
              <HeaderPropertyList />
            </div>
            <p className="text-gray-600 mt-1 font-mono text-sm">ID: {machine.machine_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button asChild size="sm">
            <Link href={createPreventiveLink}>
              <FilePlus2 className="h-4 w-4 mr-2" />
              Create Preventive Maintenance
            </Link>
          </Button>
        </div>
      </div>

      {/* Property Verification Alert */}
      {selectedProperty && machine && (
        <Card className={propertyVerification.matches ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {propertyVerification.matches ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${propertyVerification.matches ? 'text-green-900' : 'text-orange-900'}`}>
                  Location Verification
                </h3>
                <p className={`text-sm ${propertyVerification.matches ? 'text-green-800' : 'text-orange-800'}`}>
                  {propertyVerification.message}
                </p>
                {!propertyVerification.matches && (
                  <p className="text-xs text-orange-700 mt-2">
                    This equipment belongs to a different property. Please verify the location before performing maintenance.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* QR Code Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Machine QR Code
          </CardTitle>
          <CardDescription>
            Scan this QR code to quickly access this machine's details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div 
              ref={qrCodeRef}
              className="bg-white p-4 rounded-lg border-2 border-gray-200 flex-shrink-0"
              style={{ display: 'inline-block' }}
            >
              {machine?.machine_id && getMachineUrl() ? (
                <QRCode
                  value={getMachineUrl()}
                  size={200}
                  level="H"
                  fgColor="#1f2937"
                  bgColor="#ffffff"
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Machine Information</p>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><span className="font-medium">ID:</span> {machine.machine_id}</p>
                  <p><span className="font-medium">Name:</span> {machine.name}</p>
                  {machine.location && (
                    <p><span className="font-medium">Location:</span> {machine.location}</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Quick Access URL</p>
                <p className="text-xs text-gray-500 break-all font-mono bg-gray-50 p-2 rounded">
                  {getMachineUrl()}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={downloadQRCode}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download QR Code
                </Button>
                <Button
                  onClick={printQRCode}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print QR Code
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Machine Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Machine Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {machine.description && (
            <div className="pb-4">
              <p className="text-sm text-gray-600 mb-2">Description</p>
              <p className="text-gray-900">{machine.description}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {machine.category && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Category</p>
                <Badge variant="secondary" className="text-sm">{machine.category}</Badge>
              </div>
            )}

            {machine.brand && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Brand</p>
                <p className="font-medium text-gray-900">{machine.brand}</p>
              </div>
            )}

            {machine.status && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <Badge className={
                  machine.status === 'active' ? 'bg-green-100 text-green-800' :
                  machine.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                  machine.status === 'repair' ? 'bg-orange-100 text-orange-800' :
                  machine.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                  'bg-red-100 text-red-800'
                }>
                  {machine.status.toUpperCase()}
                </Badge>
              </div>
            )}

            {machine.serial_number && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Serial Number</p>
                <p className="font-medium text-gray-900 font-mono">{machine.serial_number}</p>
              </div>
            )}

            {machine.location && (
              <div>
                <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Location
                </p>
                <p className="font-medium text-gray-900">{machine.location}</p>
              </div>
            )}

            {machine.property && (
              <div>
                <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  <Building className="h-4 w-4" />
                  Property
                </p>
                <p className="font-medium text-gray-900">{machine.property.name}</p>
              </div>
            )}

            {machine.installation_date && (
              <div>
                <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Installation Date
                </p>
                <p className="font-medium text-gray-900">{new Date(machine.installation_date).toLocaleDateString()}</p>
              </div>
            )}

            {machine.last_maintenance_date && (
              <div>
                <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Last Maintenance
                </p>
                <p className="font-medium text-gray-900">{new Date(machine.last_maintenance_date).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PM History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Preventive Maintenance History
          </CardTitle>
          <CardDescription>
            {pmHistory.length} maintenance record{pmHistory.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="ml-3 text-gray-600">Loading maintenance history...</p>
            </div>
          ) : pmHistory.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium mb-2">No maintenance history found</p>
              <p className="text-sm text-gray-500">This machine has no preventive maintenance records yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pmHistory.map((record) => (
                <div key={record.pm_id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Main Info */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link 
                              href={`/dashboard/preventive-maintenance/${record.pm_id}`}
                              className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors block"
                            >
                              {record.pmtitle || 'Untitled Maintenance'}
                            </Link>
                            {record.procedure_template_name && (
                              <p className="text-sm text-gray-600 mt-1">
                                Template: {record.procedure_template_name}
                              </p>
                            )}
                          </div>
                          <Badge className={getStatusColor(record.status)}>
                            {record.status ? record.status.replace('_', ' ').toUpperCase() : 'SCHEDULED'}
                          </Badge>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {record.pm_id && (
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4 text-gray-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-gray-500">PM ID</p>
                                <p className="font-mono text-sm text-gray-900">
                                  {record.pm_id}
                                </p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-gray-500">Scheduled</p>
                              <p className="font-medium text-gray-900">
                                {new Date(record.scheduled_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          {record.completed_date && (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-gray-500">Completed</p>
                                <p className="font-medium text-green-700">
                                  {new Date(record.completed_date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          )}

                          {record.created_by_details && (
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-purple-500 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-gray-500">Created By</p>
                                <p className="font-medium text-gray-900">
                                  {getUserDisplayName(record.created_by_details)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                      {record.notes && (
                        <div className="pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">Notes:</p>
                          <p className="text-sm text-gray-700">{record.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      {(machine.created_at || machine.updated_at) && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
              {machine.created_at && (
                <div>
                  <p>Created: {new Date(machine.created_at).toLocaleString()}</p>
                </div>
              )}
              {machine.updated_at && (
                <div>
                  <p>Updated: {new Date(machine.updated_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

