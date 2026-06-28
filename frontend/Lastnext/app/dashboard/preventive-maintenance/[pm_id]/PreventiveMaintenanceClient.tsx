// app/dashboard/preventive-maintenance/[pm_id]/PreventiveMaintenanceClient.tsx

'use client';
import { preventiveMaintenanceService, setPreventiveMaintenanceServiceToken } from '@/app/lib/PreventiveMaintenanceService';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from "@/app/lib/session.client";
import { useMinLoaderTime } from '@/app/lib/hooks/useMinLoaderTime';
import { 
  PreventiveMaintenance, 
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
  Settings,
  Building,
  Camera,
  ArrowUpRight,
  CheckCircle,
  Clock,
  User
} from 'lucide-react';
import { fixImageUrl } from '@/app/lib/utils/image-utils';
import { fetchImageAsDataURL } from '@/app/lib/imageUtils';
import { MaintenanceImage } from '@/app/components/ui/UniversalImage';
import { getDisplayName, getUserEmail } from '@/app/lib/utils/display-name';
import { StatusBadge } from '@/app/components/StatusBadge';

interface PreventiveMaintenanceClientProps {
  maintenanceData: PreventiveMaintenance;
}

export default function PreventiveMaintenanceClient({ maintenanceData }: PreventiveMaintenanceClientProps) {
  const { data: session } = useSession();  
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageAlt, setCurrentImageAlt] = useState<string>('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfImageDataUrls, setPdfImageDataUrls] = useState<Record<string, string>>({});
  const { recordLoaderShown, clearLoadingAfterMinTime } = useMinLoaderTime(setIsLoading);
  
  useEffect(() => {
    const accessToken = session?.user?.accessToken;
    if (accessToken) {
      setPreventiveMaintenanceServiceToken(accessToken);
    }
  }, [session?.user?.accessToken]);


  // ฟังก์ชันสำหรับการยืนยันการลบ
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this maintenance record?')) {
      return;
    }
  
    recordLoaderShown();
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
      clearLoadingAfterMinTime();
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
      // Validate that completion date is within 15 days before or after scheduled date
      const scheduledDate = maintenanceData.scheduled_date ? new Date(maintenanceData.scheduled_date) : null;
      const completedDate = new Date();
      
      if (scheduledDate) {
        const daysDiff = Math.floor((completedDate.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff < -15 || daysDiff > 15) {
          const scheduledDateStr = scheduledDate.toLocaleDateString();
          const completedDateStr = completedDate.toLocaleDateString();
          const proceed = window.confirm(
            `This task is outside the recommended 15-day window.\n\n` +
              `Scheduled: ${scheduledDateStr}\n` +
              `Completion: ${completedDateStr}\n` +
              `Difference: ${Math.abs(daysDiff)} days\n\n` +
              `Do you still want to mark it complete?`
          );

          if (!proceed) {
            setIsCompleting(false);
            return;
          }
        }
      }

      const response = await preventiveMaintenanceService.completePreventiveMaintenance(
        maintenanceData.pm_id,
        {
          completed_date: completedDate.toISOString()
        }
      );

      if (response.success) {
        // Get the updated data from response
        const updatedData = response.data;
        const nextScheduledDate = updatedData?.scheduled_date || updatedData?.next_due_date;
        
        // Show success message with next scheduled date
        if (nextScheduledDate) {
          const nextDate = new Date(nextScheduledDate);
          const formattedDate = nextDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          // Show success message
          alert(`✅ Maintenance task completed successfully!\n\nNext scheduled maintenance: ${formattedDate}`);
        } else {
          alert('✅ Maintenance task completed successfully!');
        }
        
        router.refresh();
      } else {
        throw new Error(response.message || 'Failed to complete maintenance record');
      }
    } catch (err: any) {
      console.error('Error completing maintenance:', err);
      setError(err.message || 'An error occurred while marking as complete');
    } finally {
      setIsCompleting(false);
    }
  };

  // Image URL functions
  const getBeforeImageUrl = (): string | null => {
    if (maintenanceData.before_image_url) {
      const fixedUrl = fixImageUrl(maintenanceData.before_image_url);
      return fixedUrl;
    }
    return null;
  };

  const getAfterImageUrl = (): string | null => {
    if (maintenanceData.after_image_url) {
      const fixedUrl = fixImageUrl(maintenanceData.after_image_url);
      return fixedUrl;
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

  const waitForPdfImages = async (root: HTMLElement) => {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 6000);
          const done = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          image.onload = done;
          image.onerror = done;
        });
      }),
    );
  };

  const preparePdfImages = async () => {
    const machineImageUrls = machinesWithImages
      .map(({ imageUrl }) => imageUrl)
      .filter((url): url is string => !!url);

    const imageUrls = Array.from(
      new Set([beforeImageUrl, afterImageUrl, ...machineImageUrls].filter((url): url is string => !!url)),
    );

    if (imageUrls.length === 0) return;

    const convertedEntries = await Promise.all(
      imageUrls.map(async (url) => {
        if (pdfImageDataUrls[url]) {
          return [url, pdfImageDataUrls[url]] as const;
        }

        try {
          const dataUrl = await fetchImageAsDataURL(url, {
            retries: 1,
            timeout: 10000,
            useProxy: url.startsWith('http'),
            maxSize: 1200,
            quality: 0.82,
          });
          return [url, dataUrl] as const;
        } catch (error) {
          console.warn('[PM PDF] Failed to prepare image for PDF:', url, error);
          return null;
        }
      }),
    );

    const nextDataUrls = convertedEntries.reduce<Record<string, string>>((acc, entry) => {
      if (entry) {
        acc[entry[0]] = entry[1];
      }
      return acc;
    }, {});

    if (Object.keys(nextDataUrls).length > 0) {
      setPdfImageDataUrls((current) => ({ ...current, ...nextDataUrls }));
    }
  };

  const getPdfImageSrc = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return '';
    return pdfImageDataUrls[imageUrl] || imageUrl;
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setError(null);

    const pdfContent = document.getElementById('pdf-content');
    if (!pdfContent) {
      setError('PDF content not found.');
      setIsExportingPdf(false);
      return;
    }

    const originalDisplay = pdfContent.style.display;
    const originalPosition = pdfContent.style.position;
    const originalLeft = pdfContent.style.left;
    const originalTop = pdfContent.style.top;
    const originalZIndex = pdfContent.style.zIndex;

    try {
      pdfContent.style.display = 'block';
      pdfContent.style.position = 'fixed';
      pdfContent.style.left = '-99999px';
      pdfContent.style.top = '0';
      pdfContent.style.zIndex = '-1';

      await preparePdfImages();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await waitForPdfImages(pdfContent);

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      const canvas = await html2canvas(pdfContent, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const targetWidth = pageWidth - margin * 2;
      const targetHeight = pageHeight - margin * 2;
      const pxPerMm = canvas.width / targetWidth;
      const pageCanvasHeight = Math.floor(targetHeight * pxPerMm);

      let pageIndex = 0;
      let yOffset = 0;

      while (yOffset < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - yOffset);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext('2d');
        if (!context) {
          throw new Error('Failed to create canvas context for PDF export.');
        }

        context.drawImage(
          canvas,
          0,
          yOffset,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );

        const imageData = pageCanvas.toDataURL('image/png');
        const renderedHeight = (sliceHeight * targetWidth) / canvas.width;

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(imageData, 'PNG', margin, margin, targetWidth, renderedHeight);
        yOffset += sliceHeight;
        pageIndex += 1;
      }

      const generatedDate = new Date().toISOString().slice(0, 10);
      pdf.save(`preventive-maintenance-${maintenanceData.pm_id}-${generatedDate}.pdf`);
    } catch (err: any) {
      console.error('Error exporting PDF:', err);
      setError(err?.message || 'Failed to export PDF.');
    } finally {
      pdfContent.style.display = originalDisplay;
      pdfContent.style.position = originalPosition;
      pdfContent.style.left = originalLeft;
      pdfContent.style.top = originalTop;
      pdfContent.style.zIndex = originalZIndex;
      setIsExportingPdf(false);
    }
  };

  // Debug: Log the full maintenance data structure

  const beforeImageUrl = getBeforeImageUrl();
  const afterImageUrl = getAfterImageUrl();
  
  const assignedUserInfo = useMemo(() => {
    if (maintenanceData.assigned_to_name || maintenanceData.technician_name) {
      return {
        display: maintenanceData.assigned_to_name || maintenanceData.technician_name || 'Unknown Technician',
        email: getUserEmail(maintenanceData.assigned_to_details || maintenanceData.assigned_to),
      };
    }

    if (maintenanceData.assigned_to_details) {
      const details = maintenanceData.assigned_to_details;
      return {
        display: getDisplayName(details, 'Unknown Technician'),
        email: details.email,
      };
    }

    const assignee = maintenanceData.assigned_to as any;
    if (assignee && typeof assignee === 'object') {
      return {
        display: getDisplayName(assignee, 'Unknown Technician'),
        email: assignee.email,
      };
    }

    if (typeof maintenanceData.assigned_to === 'number' || typeof maintenanceData.assigned_to === 'string') {
      return {
        display: getDisplayName(maintenanceData.assigned_to, 'Unknown Technician'),
        email: undefined,
      };
    }

    return null;
  }, [maintenanceData.assigned_to, maintenanceData.assigned_to_details, maintenanceData.assigned_to_name, maintenanceData.technician_name]);
  
  // Debug logging in useEffect to avoid hydration issues
  useEffect(() => {
    if (!assignedUserInfo) {
      console.warn('⚠️ [CLIENT] No assigned user info found. Check if assigned_to or assigned_to_details is populated in API response.');
    }
  }, [maintenanceData, beforeImageUrl, afterImageUrl, assignedUserInfo]);
  
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
  
  // Status functions - use useState/useEffect to avoid hydration issues with Date.now()
  // Initialize with a safe default that won't cause hydration mismatch
  const [taskStatus, setTaskStatus] = useState<'completed' | 'pending' | 'overdue'>('pending');

  // Calculate status only on client side to avoid hydration issues
  useEffect(() => {
    if (maintenanceData.completed_date) {
      setTaskStatus('completed');
      return;
    }

    const scheduledDate = new Date(maintenanceData.scheduled_date);
    const now = new Date();
    const overdue = scheduledDate < now;
    
    if (determinePMStatus) {
      const status = determinePMStatus(maintenanceData);
      setTaskStatus(status as 'completed' | 'pending' | 'overdue');
    } else {
      setTaskStatus(overdue ? 'overdue' : 'pending');
    }
  }, [maintenanceData.completed_date, maintenanceData.scheduled_date, maintenanceData]);

  const getTaskStatus = taskStatus;
    
  // Render machine list
  const renderMachines = () => {
    // More robust check for empty machines
    const machines = maintenanceData.machines;
    const machinesList = Array.isArray(machines) ? machines : null;
    const hasMachines = !!machinesList && machinesList.length > 0;
    
    // Debug logging to help diagnose machine assignment issues
    
    if (!machinesList || machinesList.length === 0) {
      return (
        <div className="text-center py-8">
          <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No machines assigned</p>
          <p className="text-gray-400 text-sm mb-4">
            This maintenance task is not associated with any specific machines. 
            Machines are optional but help track which equipment this maintenance applies to.
          </p>
          <Link
            href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Settings className="h-4 w-4" />
            Add Machines to This Task
          </Link>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {machinesList.map((machine, index) => {
          const machineId = typeof machine === 'object' ? machine.machine_id : machine;
          const machineName = typeof machine === 'object' ? machine.name : null;
          const machineImageUrl = typeof machine === 'object' ? getMachineImageUrl(machine) : null;
          
          return (
            <div 
              key={index} 
              className="bg-gradient-to-r from-slate-50 to-gray-50 p-4 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                {machineImageUrl ? (
                  <button
                    type="button"
                    onClick={() => openImageModal(machineImageUrl, `${machineName || 'Machine'} image`)}
                    className="group relative h-20 w-20 flex-none overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Open image for ${machineName || machineId || 'machine'}`}
                  >
                    <img
                      src={machineImageUrl}
                      alt={machineName ? `${machineName} machine` : 'Machine'}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/20 group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ) : (
                  <div className="grid h-20 w-20 flex-none place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-100">
                    <Wrench className="h-7 w-7 text-gray-400" />
                  </div>
                )}
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

  const getMachineImageUrl = (machine: NonNullable<PreventiveMaintenance['machines']>[number]): string | null => {
    const rawImageUrl = machine.image_url || machine.image;
    return rawImageUrl ? fixImageUrl(rawImageUrl) : null;
  };

  const machinesWithImages = useMemo(() => {
    if (!maintenanceData.machines || !Array.isArray(maintenanceData.machines)) return [];

    return maintenanceData.machines
      .filter((machine) => getMachineImageUrl(machine))
      .map((machine) => ({
        machine,
        imageUrl: getMachineImageUrl(machine),
      }));
  }, [maintenanceData.machines]);

  // getTopicsString function removed - topics no longer displayed
  // const getTopicsString = () => {
  //   const topics = maintenanceData.topics;
  //   if (!topics || topics.length === 0) return 'No topics';
  //   
  //   if (typeof topics[0] === 'object' && 'title' in topics[0]) {
  //     return (topics as any[]).map(topic => topic.title).join(', ');
  //   }
  //   
  //   // Handle case where topics are numbers (IDs)
  //   return (topics as unknown as number[]).join(', ');
  // };

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
              <StatusBadge status={taskStatus} />
              
            </div>
          </div>
          
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
            
            {/* Always show Task Template card - with link if exists, or message if not */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${(maintenanceData.procedure_template_id || maintenanceData.procedure_template) ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  <Settings className={`h-5 w-5 ${(maintenanceData.procedure_template_id || maintenanceData.procedure_template) ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">Maintenance Task Template</p>
                  {(maintenanceData.procedure_template_id || maintenanceData.procedure_template) ? (
                    <>
                      <Link 
                        href={`/dashboard/maintenance-tasks/${maintenanceData.procedure_template_id || maintenanceData.procedure_template}`}
                        className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono"
                      >
                        {maintenanceData.procedure_template_id || maintenanceData.procedure_template}
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                      {maintenanceData.procedure_template_name && (
                        <p className="text-xs text-gray-600 mt-1 truncate">
                          {maintenanceData.procedure_template_name}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 italic">No template linked</p>
                      <p className="text-xs text-gray-400 mt-1">
                        <Link href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`} className="text-blue-600 hover:underline">
                          Edit this record
                        </Link> to link a task template
                      </p>
                    </>
                  )}
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
              
              {assignedUserInfo && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-sky-100 rounded-lg">
                      <User className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Assigned To</p>
                      <p className="text-lg font-semibold text-gray-900">{assignedUserInfo.display}</p>
                      {assignedUserInfo.email && (
                        <p className="text-xs text-gray-500 mt-1">{assignedUserInfo.email}</p>
                      )}
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
            
            {(maintenanceData.completed_date || taskStatus === 'completed') && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Completed</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {maintenanceData.completed_date ? formatDate(maintenanceData.completed_date) : 'Completion date not set'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {(maintenanceData.procedure_template_id || maintenanceData.procedure_template) && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <FileText className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-500">Task Template</p>
                    <Link 
                      href={`/dashboard/maintenance-tasks/${maintenanceData.procedure_template_id || maintenanceData.procedure_template}`}
                      className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      {maintenanceData.procedure_template_name || 'Task Template'}
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      ID: {maintenanceData.procedure_template_id || maintenanceData.procedure_template}
                    </p>
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
              {/* Frequency - HIDDEN (defaults to monthly, managed via task template) */}
              {false && (
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
              )}

              {/* Topics - HIDDEN (topics removed from system) */}
              {false && (
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <FileText className="h-5 w-5 text-indigo-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Maintenance Topics</h4>
                </div>
                <div className="bg-white/60 p-4 rounded-xl">
                  {maintenanceData.topics?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {maintenanceData.topics?.map((topic, index) => {
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
              )}
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
                    <img
                      src={beforeImageUrl || ''}
                      alt="Before Maintenance"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      style={{ width: '100%', height: '100%' }}
                      onLoad={() => {
                        if (process.env.NODE_ENV === 'development') {
                        }
                      }}
                      onError={(e) => {
                        console.error('❌ Before image failed to load');
                        console.error('   URL:', beforeImageUrl);
                        console.error('   Original URL:', maintenanceData.before_image_url);
                        console.error('   Error event:', e);
                      }}
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
                    <img
                      src={afterImageUrl || ''}
                      alt="After Maintenance"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      style={{ width: '100%', height: '100%' }}
                      onLoad={() => {
                        if (process.env.NODE_ENV === 'development') {
                        }
                      }}
                      onError={(e) => {
                        console.error('❌ After image failed to load');
                        console.error('   URL:', afterImageUrl);
                        console.error('   Original URL:', maintenanceData.after_image_url);
                        console.error('   Error event:', e);
                      }}
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
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className={`pcms-btn pcms-btn-primary flex items-center justify-center gap-2 px-6 py-3 ${
                  isExportingPdf ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Download className="h-4 w-4" />
                {isExportingPdf ? 'Generating PDF report...' : 'Generate PDF'}
              </button>

              {!maintenanceData.completed_date && (
                <button
                  onClick={handleMarkComplete}
                  disabled={isCompleting}
                  className={`pcms-btn pcms-btn-success flex items-center gap-2 px-6 py-3 ${
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
      <div id="pdf-content" className="hidden print:block">
        {/* A4 Paper Container */}
        <div className="a4-page bg-white mx-auto" style={{ width: '210mm', minHeight: '297mm', padding: '12mm', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="header text-center mb-4 border-b-2 border-gray-300 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Maintenance Record Report</h1>
          <p className="text-gray-600">Generated on {formatCurrentDateTime()}</p>
          <div className="flex justify-center items-center mt-2 text-xs text-gray-500">
            <Building className="h-4 w-4 mr-2" />
            Facility Management System
          </div>
        </div>

        {/* Maintenance Details */}
        <div className="maintenance-item border border-gray-300 rounded-lg p-4 mb-4 text-sm">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {maintenanceData.pmtitle || 'Maintenance Task'}
              </h2>
              <p className="text-sm text-gray-600">ID: {maintenanceData.pm_id}</p>
            </div>
            <StatusBadge status={getTaskStatus} />
          </div>

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

          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div>
              <span className="font-medium text-gray-600">Scheduled:</span>
              <p>{formatDate(maintenanceData.scheduled_date)}</p>
            </div>
            {/* Frequency removed from display - defaults to monthly */}
            {/* Topics removed from display */}
            <div>
              <span className="font-medium text-gray-600">Next Due:</span>
              <p>{maintenanceData.next_due_date ? formatDate(maintenanceData.next_due_date) : 'N/A'}</p>
            </div>
          </div>

          <div className="mb-4">
            <span className="font-medium text-gray-600">Machines:</span>
            <p className="text-gray-700 mt-1">{getMachinesString()}</p>
          </div>

          {machinesWithImages.length > 0 && (
            <div className="mb-4">
              <span className="font-medium text-gray-600">Equipment Images:</span>
              <div className="pdf-image-grid grid grid-cols-2 gap-3 mt-2">
                {machinesWithImages.map(({ machine, imageUrl }, index) => (
                  <div key={`${machine.machine_id || index}-pdf-equipment-image`} className="pdf-image-card rounded-lg border border-gray-300 p-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      {machine.name || machine.machine_id || `Equipment ${index + 1}`}
                    </p>
                    {imageUrl && (
                      <img
                        src={getPdfImageSrc(imageUrl)}
                        alt={`${machine.name || machine.machine_id || 'Equipment'} image`}
                        className="pdf-equipment-image w-full h-32 object-contain rounded-md border border-gray-200"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {maintenanceData.property_id && (
            <div className="mb-4">
              <span className="font-medium text-gray-600">Property ID:</span>
              <p className="text-gray-700 mt-1">{maintenanceData.property_id}</p>
            </div>
          )}

          {assignedUserInfo && (
            <div className="mb-4">
              <span className="font-medium text-gray-600">Assigned To:</span>
              <p className="text-gray-700 mt-1">
                {assignedUserInfo.display}
                {assignedUserInfo.email && ` (${assignedUserInfo.email})`}
              </p>
            </div>
          )}

          {maintenanceData.completed_date && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <span className="font-medium text-green-600">
                Completed on: {formatDate(maintenanceData.completed_date)}
              </span>
            </div>
          )}

          {(beforeImageUrl || afterImageUrl) && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <h3 className="font-medium text-gray-700 mb-3 flex items-center">
                <Camera className="h-4 w-4 mr-2" />
                Maintenance Images
              </h3>
              <div className="pdf-image-grid grid grid-cols-2 gap-3">
                {beforeImageUrl && (
                  <div>
                    <span className="text-sm font-medium text-gray-600 block mb-2">Before:</span>
                    <img
                      src={getPdfImageSrc(beforeImageUrl)}
                      alt="Before maintenance" 
                      className="pdf-maintenance-image w-full h-40 object-contain rounded-lg border border-gray-300"
                    />
                    <div className="hidden w-full h-48 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
                      <span className="text-gray-500 text-sm">Before image unavailable</span>
                    </div>
                  </div>
                )}
                {afterImageUrl && (
                  <div>
                    <span className="text-sm font-medium text-gray-600 block mb-2">After:</span>
                    <img
                      src={getPdfImageSrc(afterImageUrl)}
                      alt="After maintenance" 
                      className="pdf-maintenance-image w-full h-40 object-contain rounded-lg border border-gray-300"
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
        <div className="mt-4 pt-4 border-t-2 border-gray-300 text-center">
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

        #pdf-content .a4-page {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm;
          box-sizing: border-box;
          color: #111827;
        }

        #pdf-content .maintenance-item {
          page-break-inside: avoid;
        }

        #pdf-content .pdf-image-grid {
          align-items: start;
        }

        #pdf-content .pdf-image-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        #pdf-content .pdf-equipment-image,
        #pdf-content .pdf-maintenance-image {
          background: #ffffff;
          display: block;
        }
        
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
            padding: 12mm !important;
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
