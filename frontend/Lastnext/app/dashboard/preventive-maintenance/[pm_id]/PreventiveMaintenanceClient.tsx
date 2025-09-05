// app/dashboard/preventive-maintenance/[pm_id]/PreventiveMaintenanceClient.tsx

'use client';
import { preventiveMaintenanceService } from '@/app/lib/PreventiveMaintenanceService';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from "@/app/lib/session.client";
import { 
  PreventiveMaintenance, 
  getImageUrl,
  determinePMStatus 
} from '@/app/lib/preventiveMaintenanceModels';
import { 
  AlertCircle, 
  Calendar, 
  Clipboard, 
  Wrench, 
  X, 
  ZoomIn,
  FileText,
  Download,
  Printer,
  Settings,
  Building,
  Camera,
  ArrowUpRight,
  CheckCircle,
  Clock
} from 'lucide-react';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { MaintenanceImage } from '@/app/components/ui/UniversalImage';

interface PreventiveMaintenanceClientProps {
  maintenanceData: PreventiveMaintenance;
}

export default function PreventiveMaintenanceClient({ maintenanceData }: PreventiveMaintenanceClientProps) {
  const { data: session, status } = useSession();  
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageAlt, setCurrentImageAlt] = useState<string>('');
  const [isCompleting, setIsCompleting] = useState(false);
  
  // PDF Generation States
  const [showPDFOptions, setShowPDFOptions] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [imageLoadStatus, setImageLoadStatus] = useState<{before: boolean, after: boolean}>({before: false, after: false});
  const printRef = useRef(null);

  // ฟังก์ชันสำหรับการยืนยันการลบ
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this maintenance record?')) {
      return;
    }
  
    setIsLoading(true);
    setError(null);
  
    try {
      const response = await preventiveMaintenanceService.deletePreventiveMaintenance(maintenanceData.pm_id);
  
      if (response.success) {
        router.push('/dashboard/preventive-maintenance');
        router.refresh();
      } else {
        throw new Error(response.message || 'Failed to delete maintenance record');
      }
    } catch (err: any) {
      console.error('Error deleting maintenance:', err);
      setError(err.message || 'An error occurred while deleting');
    } finally {
      setIsLoading(false);
    }
  }
  
  // Function to mark maintenance as complete
  const handleMarkComplete = async () => {
    if (!window.confirm('Mark this maintenance task as completed?')) {
      return;
    }

    setIsCompleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/preventive-maintenance/${maintenanceData.pm_id}/complete/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          completed_date: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to complete maintenance record');
      }

      router.refresh();
    } catch (err: any) {
      console.error('Error completing maintenance:', err);
      setError(err.message || 'An error occurred while marking as complete');
    } finally {
      setIsCompleting(false);
    }
  };

  // PDF Generation Functions
  const convertImageToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Failed to convert image to base64:', error);
      return url; // Fallback to original URL
    }
  };

  const generatePDF = async () => {
    // Convert images to base64 for better PDF compatibility
    if (includeImages) {
      const pdfContent = document.getElementById('pdf-content');
      if (pdfContent) {
        const images = pdfContent.querySelectorAll('img');
        for (const img of images) {
          try {
            const base64 = await convertImageToBase64(img.src);
            img.src = base64;
          } catch (error) {
            console.warn('Failed to convert image:', error);
          }
        }
      }
    }

    // Preload images before printing to ensure they appear in PDF
    const preloadImages = async () => {
      const imagePromises: Promise<void>[] = [];
      
      if (includeImages) {
        if (beforeImageUrl) {
          imagePromises.push(
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Continue even if image fails
              img.src = beforeImageUrl;
            })
          );
        }
        
        if (afterImageUrl) {
          imagePromises.push(
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Continue even if image fails
              img.src = afterImageUrl;
            })
          );
        }
      }
      
      await Promise.all(imagePromises);
    };

    // Wait for images to load, then print
    await preloadImages();
    
    // Small delay to ensure images are rendered
    setTimeout(() => {
      window.print();
    }, 1000); // Increased delay for better image loading
  };

  const downloadHTML = () => {
    const htmlContent = document.getElementById('pdf-content')?.outerHTML;
    if (!htmlContent) return;
    
    const fullHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Maintenance Record - ${maintenanceData.pm_id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ccc; padding-bottom: 20px; }
          .maintenance-item { margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 8px; page-break-inside: avoid; }
          .text-green-600 { color: #16a34a; }
          .text-yellow-600 { color: #ca8a04; }
          .text-red-600 { color: #dc2626; }
          .text-blue-600 { color: #2563eb; }
          .text-gray-600 { color: #4b5563; }
          .grid { display: grid; gap: 16px; }
          .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
          .font-medium { font-weight: 500; }
          .font-semibold { font-weight: 600; }
          .font-bold { font-weight: bold; }
          .text-sm { font-size: 14px; }
          .text-lg { font-size: 18px; }
          .text-xl { font-size: 20px; }
          .text-2xl { font-size: 24px; }
          .text-3xl { font-size: 30px; }
          .mb-2 { margin-bottom: 8px; }
          .mb-3 { margin-bottom: 12px; }
          .mb-4 { margin-bottom: 16px; }
          .mt-3 { margin-top: 12px; }
          .pt-3 { padding-top: 12px; }
          .border-t { border-top: 1px solid #e5e7eb; }
          .capitalize { text-transform: capitalize; }
          .text-center { text-align: center; }
          .hidden { display: none; }
          img { 
            max-width: 100%; 
            max-height: 300px; 
            height: auto; 
            border-radius: 8px; 
            border: 1px solid #ddd; 
            display: block;
            margin: 0 auto;
            background: white;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
          @media print {
            body { margin: 0; font-size: 12px; }
            .maintenance-item { page-break-inside: avoid; }
            img { 
              max-height: 250px !important; 
              page-break-inside: avoid;
              -webkit-print-color-adjust: exact;
              color-adjust: exact;
            }
          }
          @media screen and (max-width: 768px) {
            .grid-cols-2 { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    
    const blob = new Blob([fullHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maintenance-record-${maintenanceData.pm_id}-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Image URL functions
  const getBeforeImageUrl = (): string | null => {
    if (maintenanceData.before_image_url) {
      return fixImageUrl(maintenanceData.before_image_url);
    }
    return null;
  };

  const getAfterImageUrl = (): string | null => {
    if (maintenanceData.after_image_url) {
      return fixImageUrl(maintenanceData.after_image_url);
    }
    return null;
  };

  // Open image in modal
  const openImageModal = (imageUrl: string | null, altText: string) => {
    if (!imageUrl) return;
    setCurrentImage(imageUrl);
    setCurrentImageAlt(altText);
    setIsImageModalOpen(true);
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false);
    setCurrentImage(null);
  };

  const beforeImageUrl = getBeforeImageUrl();
  const afterImageUrl = getAfterImageUrl();
  
  // Helper function to format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      // Use a completely locale-independent format to avoid hydration issues
      const year = date.getFullYear();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const month = monthNames[date.getMonth()];
      const day = date.getDate();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      
      return `${month} ${day}, ${year} at ${displayHours}:${displayMinutes} ${ampm}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  // Helper function to format current date/time for reports (locale-independent)
  const formatCurrentDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = monthNames[now.getMonth()];
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    
    return `${month} ${day}, ${year} at ${displayHours}:${displayMinutes} ${ampm}`;
  };

  // Helper function to format current date for reports (locale-independent)
  const formatCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[now.getMonth()];
    const day = now.getDate();
    
    return `${month} ${day}, ${year}`;
  };
  
  // Status functions
  const getTaskStatus = () => {
    return determinePMStatus ? determinePMStatus(maintenanceData) : 
           (maintenanceData.completed_date ? 'completed' : 
            (new Date(maintenanceData.scheduled_date) < new Date() ? 'overdue' : 'pending'));
  };

  const isOverdue = !maintenanceData.completed_date && 
    new Date(maintenanceData.scheduled_date) < new Date();
    
  const getStatusText = () => {
    if (maintenanceData.completed_date) {
      return { text: 'Completed', color: 'bg-green-100 text-green-800' };
    } else if (isOverdue) {
      return { text: 'Overdue', color: 'bg-red-100 text-red-800' };
    } else {
      return { text: 'Scheduled', color: 'bg-yellow-100 text-yellow-800' };
    }
  };
  
  const statusInfo = getStatusText();

  // Get status color for PDF
  const getStatusColor = () => {
    const status = getTaskStatus();
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'pending': return 'text-yellow-600';
      case 'overdue': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Render machine list
  const renderMachines = () => {
    if (!maintenanceData.machines || maintenanceData.machines.length === 0) {
      return (
        <div className="text-center py-8">
          <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No machines assigned</p>
          <p className="text-gray-400 text-sm">This maintenance task is not associated with any specific machines</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {maintenanceData.machines.map((machine, index) => {
          const machineId = typeof machine === 'object' ? machine.machine_id : machine;
          const machineName = typeof machine === 'object' ? machine.name : null;
          
          return (
            <div 
              key={index} 
              className="bg-gradient-to-r from-slate-50 to-gray-50 p-4 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Wrench className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {machineName || 'Unnamed Machine'}
                  </p>
                  <p className="text-sm text-gray-600 font-mono">{machineId}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const getMachinesString = () => {
    if (!maintenanceData.machines || maintenanceData.machines.length === 0) {
      return 'No machines assigned';
    }
    
    return maintenanceData.machines.map(machine => {
      if (typeof machine === 'string') {
        return machine;
      }
      const machineWithLocation = machine as any;
      const name = machine.name || machine.machine_id;
      const location = machineWithLocation.location ? ` (${machineWithLocation.location})` : '';
      return `${name}${location}`;
    }).join(', ');
  };

  const getTopicsString = () => {
    const topics = maintenanceData.topics;
    if (!topics || topics.length === 0) return 'No topics';
    
    if (typeof topics[0] === 'object' && 'title' in topics[0]) {
      return (topics as any[]).map(topic => topic.title).join(', ');
    }
    
    // Handle case where topics are numbers (IDs)
    return (topics as unknown as number[]).join(', ');
  };

  return (
    <>
      <div className="bg-white shadow-xl rounded-2xl border border-gray-100 overflow-hidden">
        {/* Modern Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-8 py-6 border-b border-gray-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Wrench className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Maintenance Details</h2>
                <p className="text-gray-600 mt-1">ID: {maintenanceData.pm_id}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold shadow-sm ${statusInfo.color}`}>
                {statusInfo.text}
              </span>
              
              {/* Modern PDF Generation Button */}
              <button
                onClick={() => setShowPDFOptions(!showPDFOptions)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-xl hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium transition-all duration-200 shadow-sm border border-gray-200 hover:shadow-md"
              >
                <FileText className="h-4 w-4" />
                Export PDF
              </button>
            </div>
          </div>

          {/* Modern PDF Options Panel */}
          {showPDFOptions && (
            <div className="no-print mb-6 bg-white rounded-xl p-6 border border-gray-200 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-blue-600" />
                  Export Options
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={generatePDF}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </button>
                  <button
                    onClick={downloadHTML}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeDetails}
                    onChange={(e) => setIncludeDetails(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 mr-3 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-gray-700">Include Detailed Information</span>
                </label>
                <label className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeImages}
                    onChange={(e) => setIncludeImages(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 mr-3 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-gray-700">Include Before/After Images</span>
                </label>
              </div>
            </div>
          )}
          
          {/* Modern Metadata Cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clipboard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Maintenance ID</p>
                  <p className="text-lg font-semibold text-gray-900">{maintenanceData.pm_id}</p>
                </div>
              </div>
            </div>
            
            {maintenanceData.property_id && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Building className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Property ID</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {Array.isArray(maintenanceData.property_id)
                        ? maintenanceData.property_id.join(', ')
                        : maintenanceData.property_id}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Scheduled</p>
                  <p className="text-lg font-semibold text-gray-900">{formatDate(maintenanceData.scheduled_date)}</p>
                </div>
              </div>
            </div>
            
            {maintenanceData.completed_date && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Completed</p>
                    <p className="text-lg font-semibold text-gray-900">{formatDate(maintenanceData.completed_date)}</p>
                  </div>
                </div>
              </div>
            )}
            
            {maintenanceData.next_due_date && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Next Due</p>
                    <p className="text-lg font-semibold text-gray-900">{formatDate(maintenanceData.next_due_date)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Modern Maintenance Details Section */}
        <div className="px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Maintenance Title */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Maintenance Title</h4>
                </div>
                <p className="text-xl font-medium text-gray-800 leading-relaxed">
                  {maintenanceData.pmtitle || 'No title provided'}
                </p>
              </div>

              {/* Maintenance Procedure */}
              {maintenanceData.procedure && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Clipboard className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900">Procedure</h4>
                  </div>
                  <div className="bg-white/60 p-4 rounded-xl">
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{maintenanceData.procedure}</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {maintenanceData.notes && (
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-6 rounded-2xl border border-purple-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <FileText className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900">Notes</h4>
                  </div>
                  <div className="bg-white/60 p-4 rounded-xl">
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{maintenanceData.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Frequency */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Frequency</h4>
                </div>
                <div className="bg-white/60 p-4 rounded-xl">
                  <p className="text-2xl font-bold text-gray-800 capitalize">
                    {maintenanceData.frequency}
                    {maintenanceData.frequency === 'custom' && maintenanceData.custom_days && (
                      <span className="block text-lg font-normal text-gray-600 mt-1">
                        Every {maintenanceData.custom_days} days
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Topics */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <FileText className="h-5 w-5 text-indigo-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Maintenance Topics</h4>
                </div>
                <div className="bg-white/60 p-4 rounded-xl">
                  {maintenanceData.topics && maintenanceData.topics.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {maintenanceData.topics.map((topic, index) => {
                        const topicTitle = typeof topic === 'object' && 'title' in topic ? topic.title : `Topic ${topic}`;
                        return (
                          <span 
                            key={index} 
                            className="inline-flex items-center px-3 py-2 bg-indigo-100 text-indigo-800 text-sm font-medium rounded-lg"
                          >
                            {topicTitle}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No topics assigned</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modern Machines Section */}
        <div className="px-8 py-6 border-t border-gray-100">
          <div className="bg-gradient-to-br from-gray-50 to-slate-50 p-6 rounded-2xl border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Wrench className="h-6 w-6 text-gray-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Associated Machines</h3>
            </div>
            <div className="bg-white/80 p-4 rounded-xl">
              {renderMachines()}
            </div>
          </div>
        </div>
        
        {/* Modern Images Section */}
        <div className="px-8 py-6 border-t border-gray-100">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-2xl border border-amber-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Camera className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Maintenance Images</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {beforeImageUrl ? (
                <div className="bg-white/80 p-4 rounded-xl">
                  <div className="text-gray-700 font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Before Maintenance
                  </div>
                  <div 
                    className="relative w-full h-56 bg-gray-100 rounded-xl overflow-hidden cursor-pointer group shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={() => openImageModal(beforeImageUrl, 'Before Maintenance')}
                  >
                    <MaintenanceImage
                      src={beforeImageUrl}
                      alt="Before Maintenance"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      fill
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-all duration-300">
                      <div className="opacity-0 group-hover:opacity-100 bg-white bg-opacity-90 rounded-full p-3 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                        <ZoomIn className="h-6 w-6 text-gray-800" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 p-4 rounded-xl">
                  <div className="text-gray-700 font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Before Maintenance
                  </div>
                  <div className="flex items-center justify-center w-full h-56 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <Camera className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 font-medium">No before image</p>
                    </div>
                  </div>
                </div>
              )}

              {afterImageUrl ? (
                <div className="bg-white/80 p-4 rounded-xl">
                  <div className="text-gray-700 font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    After Maintenance
                  </div>
                  <div 
                    className="relative w-full h-56 bg-gray-100 rounded-xl overflow-hidden cursor-pointer group shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={() => openImageModal(afterImageUrl, 'After Maintenance')}
                  >
                    <MaintenanceImage
                      src={afterImageUrl}
                      alt="After Maintenance"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      fill
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-all duration-300">
                      <div className="opacity-0 group-hover:opacity-100 bg-white bg-opacity-90 rounded-full p-3 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                        <ZoomIn className="h-6 w-6 text-gray-800" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 p-4 rounded-xl">
                  <div className="text-gray-700 font-medium mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    After Maintenance
                  </div>
                  <div className="flex items-center justify-center w-full h-56 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <Camera className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 font-medium">No after image</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modern Action Buttons */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <Link
              href="/dashboard/preventive-maintenance"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-center font-medium border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <ArrowUpRight className="h-4 w-4 rotate-180" />
              Back to List
            </Link>

            <div className="flex flex-col sm:flex-row gap-3">
              {!maintenanceData.completed_date && (
                <button
                  onClick={handleMarkComplete}
                  disabled={isCompleting}
                  className={`flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 font-medium shadow-lg hover:shadow-xl transition-all duration-200 ${
                    isCompleting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />
                  {isCompleting ? 'Completing...' : 'Mark Complete'}
                </button>
              )}
              
              <Link
                href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-center font-medium shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Settings className="h-4 w-4" />
                Edit
              </Link>
              
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className={`flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:from-red-600 hover:to-rose-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 font-medium shadow-lg hover:shadow-xl transition-all duration-200 ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <X className="h-4 w-4" />
                {isLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* A4 PDF Content (Hidden on screen, visible when printing) */}
      <div id="pdf-content" ref={printRef} className="hidden print:block">
        {/* A4 Paper Container */}
        <div className="a4-page bg-white mx-auto" style={{ width: '210mm', minHeight: '297mm', padding: '20mm', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="header text-center mb-8 border-b-2 border-gray-300 pb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Maintenance Record Report</h1>
          <p className="text-gray-600">Generated on {formatCurrentDateTime()}</p>
          <div className="flex justify-center items-center mt-4 text-sm text-gray-500">
            <Building className="h-4 w-4 mr-2" />
            Facility Management System
          </div>
        </div>

        {/* Maintenance Details */}
        <div className="maintenance-item border border-gray-300 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                {maintenanceData.pmtitle || 'Maintenance Task'}
              </h2>
              <p className="text-sm text-gray-600">ID: {maintenanceData.pm_id}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
              {getTaskStatus().toUpperCase()}
            </span>
          </div>

          {includeDetails && (
            <>
              {(maintenanceData as any).job_description && (
                <div className="mb-4">
                  <span className="font-medium text-gray-600">Description:</span>
                  <p className="text-gray-700 mt-1">{(maintenanceData as any).job_description}</p>
                </div>
              )}

              {maintenanceData.notes && (
                <div className="mb-4">
                  <span className="font-medium text-gray-600">Notes:</span>
                  <p className="text-gray-700 mt-1">{maintenanceData.notes}</p>
                </div>
              )}

              {maintenanceData.procedure && (
                <div className="mb-4">
                  <span className="font-medium text-gray-600">Procedure:</span>
                  <p className="text-gray-700 mt-1 whitespace-pre-wrap">{maintenanceData.procedure}</p>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <span className="font-medium text-gray-600">Scheduled:</span>
              <p>{formatDate(maintenanceData.scheduled_date)}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Frequency:</span>
              <p className="capitalize">{maintenanceData.frequency}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Topics:</span>
              <p>{getTopicsString()}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Next Due:</span>
              <p>{maintenanceData.next_due_date ? formatDate(maintenanceData.next_due_date) : 'N/A'}</p>
            </div>
          </div>

          <div className="mb-4">
            <span className="font-medium text-gray-600">Machines:</span>
            <p className="text-gray-700 mt-1">{getMachinesString()}</p>
          </div>

          {maintenanceData.property_id && (
            <div className="mb-4">
              <span className="font-medium text-gray-600">Property ID:</span>
              <p className="text-gray-700 mt-1">{maintenanceData.property_id}</p>
            </div>
          )}

          {maintenanceData.completed_date && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <span className="font-medium text-green-600">
                Completed on: {formatDate(maintenanceData.completed_date)}
              </span>
            </div>
          )}

          {includeImages && (beforeImageUrl || afterImageUrl) && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="font-medium text-gray-700 mb-4 flex items-center">
                <Camera className="h-4 w-4 mr-2" />
                Maintenance Images
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {beforeImageUrl && (
                  <div>
                    <span className="text-sm font-medium text-gray-600 block mb-2">Before:</span>
                    <MaintenanceImage 
                      src={beforeImageUrl} 
                      alt="Before maintenance" 
                      className="w-full max-h-64 object-contain rounded-lg border border-gray-300"
                      width={400}
                      height={256}
                      fallbackSrc="/placeholder-maintenance.jpg"
                      showFallback={true}
                    />
                    <div className="hidden w-full h-48 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
                      <span className="text-gray-500 text-sm">Before image unavailable</span>
                    </div>
                  </div>
                )}
                {afterImageUrl && (
                  <div>
                    <span className="text-sm font-medium text-gray-600 block mb-2">After:</span>
                    <MaintenanceImage 
                      src={afterImageUrl} 
                      alt="After maintenance" 
                      className="w-full max-h-64 object-contain rounded-lg border border-gray-300"
                      width={400}
                      height={256}
                      fallbackSrc="/placeholder-maintenance.jpg"
                      showFallback={true}
                    />
                    <div className="hidden w-full h-48 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
                      <span className="text-gray-500 text-sm">After image unavailable</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t-2 border-gray-300 text-center">
          <div className="grid grid-cols-3 gap-4 text-xs text-gray-600">
            <div className="text-left">
              <p><strong>Report Generated:</strong></p>
              <p>{formatCurrentDate()}</p>
            </div>
            <div className="text-center">
              <p><strong>Maintenance ID:</strong></p>
              <p className="font-mono">{maintenanceData.pm_id}</p>
            </div>
            <div className="text-right">
              <p><strong>Page:</strong></p>
              <p>1 of 1</p>
            </div>
          </div>
          <div className="mt-4 text-center text-gray-500">
            <p className="text-sm">This report was automatically generated by the Facility Management System</p>
            <p className="text-xs mt-1">© 2025 - Confidential and Proprietary Information</p>
          </div>
        </div>
        </div>
      </div>

      {/* Image modal */}
      {isImageModalOpen && currentImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={closeImageModal}
        >
          <div className="relative max-w-4xl max-h-screen w-full h-full flex items-center justify-center">
            <button 
              className="absolute top-4 right-4 bg-white rounded-full p-2 z-10 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                closeImageModal();
              }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div onClick={(e) => e.stopPropagation()}>
              <MaintenanceImage 
                src={currentImage} 
                alt={currentImageAlt}
                className="max-w-full max-h-full object-contain"
                width={800}
                height={600}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }
          #pdf-content {
            display: block !important;
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          
          /* A4 Paper Styling */
          .a4-page {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 20mm !important;
            margin: 0 auto !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
          }
          
          /* Typography for print */
          h1 { font-size: 24pt !important; }
          h2 { font-size: 18pt !important; }
          h3 { font-size: 14pt !important; }
          p { font-size: 10pt !important; line-height: 1.4 !important; }
          .text-sm { font-size: 9pt !important; }
          .text-xs { font-size: 8pt !important; }
          
          /* Images for print */
          img {
            max-height: 120mm !important;
            max-width: 80mm !important;
            page-break-inside: avoid;
            display: block !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            border: 1px solid #ccc !important;
          }
          
          /* Grid layout for print */
          .grid { display: block !important; }
          .grid-cols-2 > * { 
            display: block !important; 
            margin-bottom: 10mm !important;
            page-break-inside: avoid;
          }
          
          /* Borders and spacing for print */
          .border, .border-2 { border: 1px solid #000 !important; }
          .rounded-lg, .rounded-xl, .rounded-2xl { border-radius: 0 !important; }
          .shadow-lg, .shadow-xl { box-shadow: none !important; }
          
          /* Background colors for print */
          .bg-gray-50, .bg-blue-100, .bg-green-100, .bg-purple-100, .bg-indigo-100, .bg-orange-100, .bg-amber-100 {
            background: white !important;
            border: 1px solid #000 !important;
          }
          
          /* Status colors for print */
          .bg-green-100 { background: #f0f9ff !important; }
          .bg-red-100 { background: #fef2f2 !important; }
          .bg-yellow-100 { background: #fffbeb !important; }
          
          /* Page breaks */
          .maintenance-item, .a4-page > div {
            page-break-inside: avoid;
          }
          
          /* Hide screen-only elements */
          .hidden {
            display: none !important;
          }
        }
        
        @media screen {
          #pdf-content {
            display: none;
          }
        }
        
        /* A4 Page styling for screen preview */
        .a4-page {
          background: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
        }
        
        /* Ensure images load properly */
        #pdf-content img {
          background: white;
        }
      `}</style>
    </>
  );
}