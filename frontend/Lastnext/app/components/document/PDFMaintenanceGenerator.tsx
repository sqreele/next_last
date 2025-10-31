'use client';
// PDFMaintenanceGenerator.tsx

/// <reference types="react" />
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  FileText, 
  Download, 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Filter,
  Printer,
  Building,
  Settings,
  Camera,
  ArrowLeft
} from 'lucide-react';
import { 
  PreventiveMaintenance, 
  MachineDetails,
  Topic,
  determinePMStatus,
  getImageUrl,
  getMachinesString,
  getLocationString,
  itemMatchesMachine
} from '@/app/lib/preventiveMaintenanceModels';
import { getProductionImageUrl } from '@/app/lib/utils/pdfImageUtils';
import { usePreventiveMaintenanceStore } from '@/app/lib/stores/usePreventiveMaintenanceStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar as DatePickerCalendar } from '@/app/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { cn } from '@/app/lib/utils/cn';
import { useToast } from '@/app/components/ui/use-toast';
import { useSession } from '@/app/lib/session.client';
import { fixImageUrl } from '@/app/lib/utils/image-utils';

interface InitialFilters {
  status: string;
  frequency: string;
  search: string;
  startDate: string;
  endDate: string;
  machineId: string;
  page: number;
  pageSize: number;
  topic?: string;
}

interface PDFMaintenanceGeneratorProps {
  initialFilters?: InitialFilters;
}

interface MachineOption {
  id: string;
  label: string;
}

const PDFMaintenanceGenerator: React.FC<PDFMaintenanceGeneratorProps> = ({ initialFilters }) => {
  const router = useRouter();
  
  // Get maintenance data from Zustand store
  const maintenanceItems = usePreventiveMaintenanceStore(state => state.maintenanceItems);
  const maintenanceData = maintenanceItems || [];
  
  // Mock function since it's not available in the store
  const fetchMaintenanceItems = useCallback(async (params?: any) => {
    console.log('fetchMaintenanceItems called with params:', params);
    // This would need to be implemented in the store
  }, []);
  
  // Mock topics since they're not available in the store
  const topics: any[] = [];
  
  // Store fetchMaintenanceItems in a ref to avoid infinite loops
  const fetchMaintenanceItemsRef = useRef(fetchMaintenanceItems);
  fetchMaintenanceItemsRef.current = fetchMaintenanceItems;
  
  // Debug: Log maintenance data to see image URLs
  useEffect(() => {
    if (maintenanceData.length > 0) {
      console.log('PDF Debug - Maintenance data received:', maintenanceData.map(item => ({
        id: item.id,
        pm_id: item.pm_id,
        pmtitle: item.pmtitle,
        job_description: item.job_description,
        procedure: item.procedure,
        notes: item.notes,
        before_image_url: item.before_image_url,
        after_image_url: item.after_image_url,
        hasBeforeImage: !!item.before_image_url,
        hasAfterImage: !!item.after_image_url
      })));
      
      // Log first item in detail to see all available fields
      if (maintenanceData.length > 0) {
        console.log('PDF Debug - First maintenance item structure:', maintenanceData[0]);
        console.log('PDF Debug - Available fields:', Object.keys(maintenanceData[0]));
        
        // Check if critical fields are missing
        const criticalFields: (keyof PreventiveMaintenance)[] = ['pmtitle', 'procedure', 'notes', 'job_description'];
        const missingFields = criticalFields.filter(field => !maintenanceData[0]?.[field]);
        if (missingFields.length > 0) {
          console.warn('PDF Debug - Missing critical fields:', missingFields);
        }
        
        // Check data types
        criticalFields.forEach(field => {
          const value = maintenanceData[0]?.[field];
          if (value !== undefined) {
            console.log(`PDF Debug - Field "${String(field)}" type:`, typeof value, 'value:', value);
          }
        });
      }
    } else {
      console.log('PDF Debug - No maintenance data received');
    }
  }, [maintenanceData]);
  
  // Initialize filters with URL parameters or defaults
  const [filterStatus, setFilterStatus] = useState(initialFilters?.status || 'all');
  const [filterFrequency, setFilterFrequency] = useState(initialFilters?.frequency || 'all');
  const [filterMachine, setFilterMachine] = useState(initialFilters?.machineId || 'all');
  const [dateRange, setDateRange] = useState({ 
    start: initialFilters?.startDate || '', 
    end: initialFilters?.endDate || '' 
  });
  const [searchTerm, setSearchTerm] = useState(initialFilters?.search || '');
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [imageDataUrls, setImageDataUrls] = useState<{[key: string]: string}>({});
  const printRef = useRef(null);
  const [filterTopic, setFilterTopic] = useState(initialFilters?.topic || 'all');

  // Helper functions
  const getTaskStatus = useCallback((item: PreventiveMaintenance) => {
    return determinePMStatus(item);
  }, []);

  const getTopicsString = useCallback((topics: Topic[] | number[] | null | undefined) => {
    if (!topics || topics.length === 0) return 'No topics';
    
    if (typeof topics[0] === 'object' && 'title' in topics[0]) {
      return (topics as Topic[]).map(topic => topic.title).join(', ');
    }
    
    return (topics as number[]).join(', ');
  }, []);

  // Helper function to get safe image URL for PDF compatibility
  const getSafeImageUrl = useCallback(async (imageUrl: string | null | undefined): Promise<string | undefined> => {
    if (!imageUrl) return undefined;
    
    console.log('PDF Debug - Processing image URL:', imageUrl);
    
    let fullUrl: string | null = null;

    // Prefer relative media path when possible
    const tryRelative = (url: string): string => {
      const fixed = fixImageUrl(url);
      return fixed || url;
    };
    
    // If it's already absolute, normalize scheme and host
    if (imageUrl.startsWith('http')) {
      try {
        const parsed = new URL(imageUrl);
        // Force https for our domain to avoid mixed-content
        if (parsed.hostname.endsWith('pcms.live')) {
          parsed.protocol = 'https:';
        }
        fullUrl = parsed.toString();
      } catch {
        fullUrl = imageUrl;
      }
    } else {
      // Use the unified image resolution function for all other cases
      fullUrl = getProductionImageUrl(imageUrl);
    }
    
    if (!fullUrl) return undefined;

    // Final normalization for our domain
    try {
      const parsed = new URL(fullUrl);
      if (parsed.hostname.endsWith('pcms.live')) {
        parsed.protocol = 'https:';
        fullUrl = parsed.toString();
      }
    } catch {}
    
    // HEAD check to ensure accessibility
    try {
      const response = await fetch(fullUrl, { method: 'HEAD', mode: 'no-cors' as RequestMode });
      // With no-cors, ok may be false, but resource can still be fetched by <img>
      console.log('PDF Debug - Image URL HEAD attempted:', fullUrl, 'ok:', (response as any)?.ok);
    } catch (error) {
      console.warn('PDF Debug - Error checking image URL (continuing):', fullUrl, error);
    }
    
    return fullUrl;
  }, []);

  // ✅ Updated getUniqueMachines function to provide better options
  const getUniqueMachines = useMemo((): MachineOption[] => {
    const machineOptions: MachineOption[] = [];
    const seen = new Set<string>();
    
    maintenanceData.forEach(item => {
      if (item.machines && Array.isArray(item.machines)) {
        item.machines.forEach((machine: any) => {
          if (typeof machine === 'object' && machine !== null) {
            // Add machine_id option with name as label
            if (machine.machine_id && !seen.has(machine.machine_id)) {
              seen.add(machine.machine_id);
              machineOptions.push({
                id: machine.machine_id,
                label: `${machine.name} (${machine.machine_id})`
              });
            }
          }
        });
      }
    });
    
    return machineOptions.sort((a, b) => a.label.localeCompare(b.label));
  }, [maintenanceData]);

  // ✅ Updated client-side filtering with improved machine handling
  const filteredData = useMemo(() => {
    return maintenanceData.filter((item: PreventiveMaintenance) => {
      const actualStatus = getTaskStatus(item);
      const statusMatch = filterStatus === 'all' || actualStatus === filterStatus;
      const frequencyMatch = filterFrequency === 'all' || item.frequency === filterFrequency;
      
      // ✅ Use improved itemMatchesMachine function
      const machineMatch = itemMatchesMachine(item, filterMachine);
      
      // Debug logging for machine filtering
      if (filterMachine !== 'all' && process.env.NODE_ENV === 'development') {
        console.log(`🔍 Filtering item ${item.pm_id} with machine filter "${filterMachine}":`, {
          matches: machineMatch,
          item_machines: item.machines?.map((m: any) => ({ id: m.machine_id, name: m.name })),
          filter: filterMachine
        });
      }
      
      const searchMatch = !searchTerm || 
        item.pmtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.pm_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getMachinesString(item.machines).toLowerCase().includes(searchTerm.toLowerCase());
      
      let dateMatch = true;
      if (dateRange.start && dateRange.end) {
        const itemDate = new Date(item.scheduled_date);
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        dateMatch = itemDate >= startDate && itemDate <= endDate;
      }
      
      const completedMatch = includeCompleted || actualStatus !== 'completed';
      
      const topicMatch = filterTopic === 'all' || (item.topics && item.topics.some((t: any) => t.id === filterTopic));
      
      return statusMatch && frequencyMatch && machineMatch && dateMatch && completedMatch && searchMatch && topicMatch;
    });
  }, [
    maintenanceData, 
    filterStatus, 
    filterFrequency, 
    filterMachine, 
    searchTerm, 
    dateRange.start, 
    dateRange.end, 
    includeCompleted, 
    filterTopic
  ]);

  // ✅ Test machine filtering function
  const testMachineFiltering = useCallback(() => {
    console.log('🧪 Testing machine filtering...');
    
    const testFilters = ['M258B868202', 'M251594E2C3', 'M25ECAF24CF', 'FCU240', 'The Elevelator  No. 1'];
    
    testFilters.forEach(filter => {
      const matches = maintenanceData.filter(item => itemMatchesMachine(item, filter));
      console.log(`Filter "${filter}": ${matches.length} matches`);
      matches.forEach(item => {
        console.log(`  - ${item.pm_id}: ${item.machines?.map((m: any) => `${m.name} (${m.machine_id})`).join(', ')}`);
      });
    });
  }, [maintenanceData]);

  // Debug function to troubleshoot image issues
  const debugImages = useCallback(() => {
    console.log('🔍 Debugging images...');
    console.log('Filtered data length:', filteredData.length);
    
    filteredData.forEach((item, index) => {
      console.log(`Item ${index}:`, {
        id: item.id,
        before_image_url: item.before_image_url,
        after_image_url: item.after_image_url,
        hasBeforeImage: !!item.before_image_url,
        hasAfterImage: !!item.after_image_url,
        imageDataUrls: {
          before: imageDataUrls[`before_${item.pm_id || item.id}`],
          after: imageDataUrls[`after_${item.pm_id || item.id}`]
        }
      });
    });
    
    console.log('All imageDataUrls:', imageDataUrls);
  }, [filteredData.length, imageDataUrls]);

  // Convert image URL to base64 with proper proxy handling
  const convertImageToBase64 = useCallback(async (imageUrl: string): Promise<string> => {
    try {
      console.log('PDF Debug - Converting image to base64:', imageUrl);
      
      // Create a canvas to convert the image
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          try {
            console.log('PDF Debug - Image loaded for conversion:', {
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              src: img.src
            });
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const dataURL = canvas.toDataURL('image/jpeg', 0.8);
              console.log('PDF Debug - Image converted successfully to base64, length:', dataURL.length);
              resolve(dataURL);
            } else {
              console.error('PDF Debug - Could not get canvas context');
              resolve(imageUrl);
            }
          } catch (error) {
            console.error('PDF Debug - Error drawing image to canvas:', error);
            resolve(imageUrl);
          }
        };
        
        img.onerror = (error) => {
          console.error('PDF Debug - Error loading image for conversion:', error);
          console.error('PDF Debug - Failed image URL:', imageUrl);
          resolve(imageUrl); // Fallback to original URL
        };
        
        // Set source after event listeners
        console.log('PDF Debug - Setting image source for conversion:', imageUrl);
        img.src = imageUrl;
      });
    } catch (error) {
      console.error('PDF Debug - Error in convertImageToBase64:', error);
      return imageUrl;
    }
  }, []);

  // Convert images to base64 when includeImages changes
  const imageConversionRef = useRef(false);
  
  useEffect(() => {
    // Prevent infinite loops by tracking if conversion is already in progress
    if (imageConversionRef.current) {
      return;
    }
    
    const convertImages = async () => {
      if (!includeImages || filteredData.length === 0) {
        setImageDataUrls({});
        return;
      }
      
      imageConversionRef.current = true;
      console.log('Starting image conversion...');
      const newImageDataUrls: {[key: string]: string} = {};
      
      try {
        for (const item of filteredData) {
          if (item.before_image_url) {
            const safeUrl = await getSafeImageUrl(item.before_image_url);
            if (safeUrl) {
              const key = item.pm_id || String(item.id);
              console.log('Converting before image for item:', key);
              newImageDataUrls[`before_${key}`] = await convertImageToBase64(safeUrl);
            }
          }
          
          if (item.after_image_url) {
            const safeUrl = await getSafeImageUrl(item.after_image_url);
            if (safeUrl) {
              const key = item.pm_id || String(item.id);
              console.log('Converting after image for item:', key);
              newImageDataUrls[`after_${key}`] = await convertImageToBase64(safeUrl);
            }
          }
        }
        
        console.log('Image conversion completed. Total images:', Object.keys(newImageDataUrls).length);
        setImageDataUrls(newImageDataUrls);
      } catch (error) {
        console.error('Error converting images:', error);
        setImageDataUrls({});
      } finally {
        imageConversionRef.current = false;
      }
    };

    convertImages();
  }, [includeImages, filteredData.length]); // Only depend on length, not the entire array

  // Test filtering when data changes
  useEffect(() => {
    if (maintenanceData.length > 0 && process.env.NODE_ENV === 'development') {
      testMachineFiltering();
    }
  }, [maintenanceData, testMachineFiltering]);

  // Fetch data with initial filters when component mounts
  useEffect(() => {
    const loadData = async () => {
      if (initialFilters) {
        await fetchMaintenanceItemsRef.current({
          status: initialFilters.status,
          frequency: initialFilters.frequency,
          search: initialFilters.search,
          start_date: initialFilters.startDate,
          end_date: initialFilters.endDate,
          machine_id: initialFilters.machineId,
          page: initialFilters.page,
          page_size: initialFilters.pageSize
        });
      }
      setIsLoading(false);
    };
    
    loadData();
  }, [initialFilters]);

  // Format date for display
  const formatDate = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  // Get status color
  const getStatusColor = useCallback((item: PreventiveMaintenance) => {
    const status = getTaskStatus(item);
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'pending': return 'text-yellow-600';
      case 'overdue': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }, [getTaskStatus]);

  // Get frequency color
  const getFrequencyColor = useCallback((frequency: string) => {
    switch (frequency) {
      case 'daily': return 'text-blue-600';
      case 'weekly': return 'text-green-600';
      case 'monthly': return 'text-yellow-600';
      case 'quarterly': return 'text-orange-600';
      case 'yearly': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }, []);

  // Enhanced PDF generation with better centering and image handling
  const generatePDF = useCallback(async () => {
    const element = document.getElementById('pdf-content');
    if (!element) {
      console.error('PDF content element not found');
      return;
    }

    try {
      setIsGeneratingPDF(true);
      console.log('Starting PDF generation...');

      // Wait for images to load if they're included
      if (includeImages) {
        console.log('PDF Debug - Waiting for images to load...');
        const images = element.querySelectorAll('img');
        console.log('PDF Debug - Found images in DOM:', images.length);
        
        // Log all image details
        Array.from(images).forEach((img, index) => {
          console.log(`PDF Debug - Image ${index}:`, {
            src: img.src,
            alt: img.alt,
            width: img.width,
            height: img.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            complete: img.complete,
            display: img.style.display,
            visible: img.offsetParent !== null,
            parentElement: img.parentElement?.tagName
          });
        });
        
        await Promise.all(Array.from(images).map((img, index) => {
          return new Promise((resolve) => {
            if (img.complete && img.naturalHeight !== 0) {
              console.log(`PDF Debug - Image ${index} already loaded:`, img.src.substring(0, 50) + '...');
              resolve(img);
            } else {
              console.log(`PDF Debug - Waiting for image ${index} to load:`, img.src.substring(0, 50) + '...');
              
              const onLoad = () => {
                console.log(`PDF Debug - Image ${index} loaded successfully`);
                resolve(img);
              };
              
              const onError = (error: Event) => {
                console.error(`PDF Debug - Image ${index} failed to load:`, error);
                console.error(`PDF Debug - Failed image src:`, img.src);
                resolve(img);
              };
              
              img.addEventListener('load', onLoad);
              img.addEventListener('error', onError);
              
              // Timeout after 10 seconds
              setTimeout(() => {
                console.warn(`PDF Debug - Image ${index} load timeout`);
                resolve(img);
              }, 10000);
            }
          });
        }));
        
        // Additional wait for rendering
        console.log('PDF Debug - Additional 2 second wait for rendering...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('PDF Debug - Images not included in PDF generation');
      }

      console.log('Capturing content with html2canvas...');
      
      // Get the actual content dimensions
      const elementWidth = element.scrollWidth;
      const elementHeight = element.scrollHeight;
      
      console.log('Element dimensions:', elementWidth, 'x', elementHeight);

      // Capture with html2canvas
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: elementWidth,
        height: elementHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: elementWidth,
        windowHeight: elementHeight,
        imageTimeout: 30000,
        removeContainer: true,
        foreignObjectRendering: false,
      });

      console.log('Canvas created, dimensions:', canvas.width, 'x', canvas.height);

      // Create PDF with proper centering
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // A4 dimensions in mm
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 10; // 10mm margin on all sides
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = pdfHeight - (margin * 2);
      
      // Calculate scaling to fit content within margins
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Scale to fit width while maintaining aspect ratio
      const scale = contentWidth / (imgWidth * 0.264583); // Convert pixels to mm
      const scaledWidth = contentWidth;
      const scaledHeight = (imgHeight * 0.264583) * scale;
      
      console.log('PDF scaling:', scale, 'Scaled dimensions:', scaledWidth, 'x', scaledHeight);
      
      let position = margin; // Start with top margin
      let remainingHeight = scaledHeight;

      // Add first page with centered content
      pdf.addImage(imgData, 'PNG', margin, position, scaledWidth, scaledHeight);
      remainingHeight -= contentHeight;

      // Add additional pages if content is longer than one page
      while (remainingHeight > 0) {
        position = -(scaledHeight - remainingHeight) + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, scaledWidth, scaledHeight);
        remainingHeight -= contentHeight;
      }

      // Save the PDF
      const fileName = `preventive-maintenance-report-${new Date().toISOString().split('T')[0]}.pdf`;
      console.log('Saving PDF:', fileName);
      pdf.save(fileName);

      console.log('PDF generation completed successfully');

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [includeImages]);

  // Download as HTML file
  const downloadHTML = useCallback(() => {
    const htmlContent = document.getElementById('pdf-content')?.outerHTML;
    if (!htmlContent) return;
    
    const fullHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Preventive Maintenance List</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.6; 
            background: #ffffff;
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #ccc; 
            padding-bottom: 20px; 
          }
          .summary { 
            margin-bottom: 30px; 
            background: #f9f9f9; 
            padding: 15px; 
            border-radius: 8px; 
          }
          .maintenance-item { 
            margin-bottom: 20px; 
            border: 1px solid #ddd; 
            padding: 15px; 
            border-radius: 8px; 
            page-break-inside: avoid; 
          }
          .text-green-600 { color: #16a34a; }
          .text-yellow-600 { color: #ca8a04; }
          .text-red-600 { color: #dc2626; }
          .text-blue-600 { color: #2563eb; }
          .text-orange-600 { color: #ea580c; }
          .text-gray-600 { color: #4b5563; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px; 
            page-break-inside: avoid; 
          }
          th, td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
            font-size: 12px; 
          }
          th { 
            background-color: #f2f2f2; 
            font-weight: bold; 
          }
          .grid { display: grid; gap: 16px; }
          .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
          .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
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
          .mt-1 { margin-top: 4px; }
          .mt-3 { margin-top: 12px; }
          .mt-4 { margin-top: 16px; }
          .pt-3 { padding-top: 12px; }
          .border-t { border-top: 1px solid #e5e7eb; }
          .capitalize { text-transform: capitalize; }
          .text-center { text-align: center; }
          img { 
            max-width: 100%; 
            height: auto; 
            border-radius: 8px; 
            border: 1px solid #ddd; 
            display: block;
            margin: 0 auto;
          }
          .image-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 16px; 
          }
          @media print {
            body { margin: 0; font-size: 12px; }
            .no-print { display: none !important; }
            .maintenance-item { page-break-inside: avoid; }
            img { max-height: 150px; }
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
    a.download = `preventive-maintenance-list-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading maintenance data...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Controls Section - Hidden in print */}
      <div className="no-print bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <Link
                href="/dashboard/preventive-maintenance"
                className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to List
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <FileText className="h-6 w-6 mr-2 text-blue-600" />
                Generate Maintenance PDF Report
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
            {process.env.NODE_ENV === 'development' && (
              <>
                <button
                  onClick={debugImages}
                  className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  title="Debug image issues in console"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Debug Images
                </button>
                <button
                  onClick={() => {
                    console.log('🔄 Manually refreshing maintenance data...');
                    fetchMaintenanceItemsRef.current();
                  }}
                  className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  title="Manually refresh maintenance data"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Data
                </button>
                <button
                  onClick={async () => {
                    console.log('🧪 Testing API directly...');
                    try {
                      const response = await fetch('/api/preventive-maintenance/');
                      const data = await response.json();
                      console.log('🧪 Direct API response:', data);
                      
                      if (data.results && data.results.length > 0) {
                        console.log('🧪 First item from API:', data.results[0]);
                        console.log('🧪 Available fields:', Object.keys(data.results[0]));
                      }
                    } catch (error) {
                      console.error('🧪 API test failed:', error);
                    }
                  }}
                  className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  title="Test API directly"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Test API
                </button>
              </>
            )}
            <button
              onClick={generatePDF}
              disabled={isGeneratingPDF}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPDF ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating PDF...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" />
                  Generate PDF
                </>
              )}
            </button>
            <button
              onClick={downloadHTML}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="h-4 w-4 mr-2" />
              Download HTML
            </button>
            </div>
          </div>

          {/* Show applied filters */}
          {initialFilters && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Applied Filters from Main Page:</h3>
              <div className="text-sm text-blue-800 space-y-1">
                {initialFilters.status && <div>Status: <span className="font-medium capitalize">{initialFilters.status}</span></div>}
                {initialFilters.frequency && <div>Frequency: <span className="font-medium capitalize">{initialFilters.frequency}</span></div>}
                {initialFilters.machineId && <div>Machine: <span className="font-medium">{initialFilters.machineId}</span></div>}
                {initialFilters.search && <div>Search: <span className="font-medium">"{initialFilters.search}"</span></div>}
                {initialFilters.startDate && <div>Start Date: <span className="font-medium">{initialFilters.startDate}</span></div>}
                {initialFilters.endDate && <div>End Date: <span className="font-medium">{initialFilters.endDate}</span></div>}
              </div>
            </div>
          )}

          {/* Additional Filters for PDF */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override Status Filter</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override Frequency Filter</label>
            <select
              value={filterFrequency}
              onChange={(e) => setFilterFrequency(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Frequencies</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          {/* ✅ Updated machine filter dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override Machine Filter</label>
            <select
              value={filterMachine}
              onChange={(e) => {
                console.log('Machine filter changed to:', e.target.value);
                setFilterMachine(e.target.value);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Machines</option>
              {getUniqueMachines.map(machine => (
                <option key={machine.id} value={machine.id}>
                  {machine.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Override End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filter by Topic */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Topic</label>
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Topics</option>
            {topics.map((topic: any) => (
              <option key={topic.id} value={topic.id}>{topic.title}</option>
            ))}
          </select>
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 mr-2"
            />
            Include Completed Tasks
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 mr-2"
            />
            Include Detailed Descriptions
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(e) => setIncludeImages(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 mr-2"
            />
            Include Before/After Images
          </label>
        </div>

        {/* Data Status */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Data Status:</strong> Found {maintenanceData.length} total maintenance records, 
            showing {filteredData.length} after filters
            {maintenanceData.length === 0 && " - No data available. Make sure maintenance records are loaded."}
            {includeImages && Object.keys(imageDataUrls).length > 0 && (
              <span className="block mt-1">
            <strong>Images:</strong> {Object.keys(imageDataUrls).length} images converted to base64
             </span>
           )}
         </p>
       </div>

       {/* ✅ Debug Info Section - Only show in development */}
       {process.env.NODE_ENV === 'development' && (
         <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
           <h4 className="font-medium text-yellow-900 mb-2">🧪 Debug Info:</h4>
           <div className="text-sm text-yellow-800 space-y-1">
             <div>Total items: {maintenanceData.length}</div>
             <div>Filtered items: {filteredData.length}</div>
             <div>Machine filter: {filterMachine}</div>
             <div>Available machines: {getUniqueMachines.length}</div>
             
             {/* Data Field Validation */}
             {filteredData.length > 0 && (
               <div className="mt-3">
                 <h5 className="font-medium mb-2">Data Field Validation:</h5>
                 <div className="grid grid-cols-2 gap-2 text-xs">
                   <div>
                     <strong>Items with pmtitle:</strong> {filteredData.filter(item => item.pmtitle).length}
                   </div>
                   <div>
                     <strong>Items with job_description:</strong> {filteredData.filter(item => item.job_description).length}
                   </div>
                   <div>
                     <strong>Items with procedure:</strong> {filteredData.filter(item => item.procedure).length}
                   </div>
                   <div>
                     <strong>Items with notes:</strong> {filteredData.filter(item => item.notes).length}
                   </div>
                 </div>
                 
                 {/* Show sample data for first item */}
                 {filteredData.length > 0 && (
                   <details className="mt-2">
                     <summary className="cursor-pointer font-medium">Sample Data (First Item)</summary>
                     <div className="ml-4 mt-1 text-xs bg-white p-2 rounded border">
                       <div><strong>pm_id:</strong> {filteredData[0].pm_id}</div>
                       <div><strong>pmtitle:</strong> {filteredData[0].pmtitle || 'null'}</div>
                       <div><strong>job_description:</strong> {filteredData[0].job_description || 'null'}</div>
                       <div><strong>procedure:</strong> {filteredData[0].procedure || 'null'}</div>
                       <div><strong>notes:</strong> {filteredData[0].notes || 'null'}</div>
                     </div>
                   </details>
                 )}
                 
                 {/* Raw Data Structure Debug */}
                 {filteredData.length > 0 && (
                   <details className="mt-2">
                     <summary className="cursor-pointer font-medium">Raw Data Structure (First Item)</summary>
                     <div className="ml-4 mt-1 text-xs bg-white p-2 rounded border max-h-40 overflow-y-auto">
                       <pre>{JSON.stringify(filteredData[0], null, 2)}</pre>
                     </div>
                   </details>
                 )}
               </div>
             )}
             
             {filterMachine !== 'all' && (
               <div className="mt-2">
                 <div className="font-medium">Items matching machine filter "{filterMachine}":</div>
                 {maintenanceData.filter(item => itemMatchesMachine(item, filterMachine)).map((item, index) => (
                   <div key={item.pm_id || `debug-item-${index}`} className="ml-4 text-xs">
                     {item.pm_id}: {item.machines?.map((m: any) => `${m.name} (${m.machine_id})`).join(', ')}
                   </div>
                 ))}
               </div>
             )}
             <details className="mt-2">
               <summary className="cursor-pointer font-medium">Available Machine Options</summary>
               <div className="ml-4 mt-1 text-xs">
                 {getUniqueMachines.map(machine => (
                   <div key={machine.id}>{machine.id} → {machine.label}</div>
                 ))}
               </div>
             </details>
           </div>
         </div>
       )}
     </div>

      {/* PDF Content - Fixed width and centering */}
      <div className="flex justify-center p-6">
        <div 
          id="pdf-content" 
          ref={printRef} 
          className="bg-white shadow-lg"
          style={{ 
            width: '794px', // A4 width in pixels at 96 DPI
            maxWidth: '100%',
            padding: '40px',
            fontFamily: 'Arial, sans-serif',
            lineHeight: '1.6',
            color: '#000000',
            minHeight: '1123px' // A4 height in pixels at 96 DPI
          }}
        >
       {/* Header */}
       <div className="text-center mb-8 border-b-2 border-gray-300 pb-6">
         <h1 className="text-3xl font-bold text-gray-900 mb-2">Preventive Maintenance Report</h1>
         <p className="text-gray-600">Generated on {new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</p>
        <div className="flex justify-center items-center mt-4 text-sm text-gray-500">
          <Building className="h-4 w-4 mr-2" />
          Facility Management System
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="mb-8 bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Settings className="h-5 w-5 mr-2" />
          Summary Statistics
        </h2>
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <div className="text-center">
           <div className="text-2xl font-bold text-blue-600">{filteredData.length}</div>
           <div className="text-sm text-gray-600">Total Tasks</div>
         </div>
         <div className="text-center">
           <div className="text-2xl font-bold text-green-600">
             {filteredData.filter(item => getTaskStatus(item) === 'completed').length}
           </div>
           <div className="text-sm text-gray-600">Completed</div>
         </div>
         <div className="text-center">
           <div className="text-2xl font-bold text-yellow-600">
             {filteredData.filter(item => getTaskStatus(item) === 'pending').length}
           </div>
           <div className="text-sm text-gray-600">Pending</div>
         </div>
         <div className="text-center">
           <div className="text-2xl font-bold text-red-600">
             {filteredData.filter(item => getTaskStatus(item) === 'overdue').length}
           </div>
           <div className="text-sm text-gray-600">Overdue</div>
         </div>
       </div>
     </div>

     {/* Maintenance Tasks Table */}
          {filteredData.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Maintenance Tasks Summary
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">ID</th>
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Title</th>
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Date</th>
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Status</th>
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Frequency</th>
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Machines</th>
                      <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item, index) => (
                      <tr key={item.pm_id || `item-${index}`} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2 py-2 font-mono">{item.pm_id}</td>
                        <td className="border border-gray-300 px-2 py-2 font-medium max-w-xs truncate" title={item.pmtitle || item.job_description || 'No title'}>
                          {item.pmtitle || item.job_description || 'No title'}
                        </td>
                        <td className="border border-gray-300 px-2 py-2">{formatDate(item.scheduled_date)}</td>
                        <td className={`border border-gray-300 px-2 py-2 font-medium ${getStatusColor(item)}`}>
                          <span className="capitalize">{getTaskStatus(item)}</span>
                        </td>
                        <td className={`border border-gray-300 px-2 py-2 font-medium ${getFrequencyColor(item.frequency)}`}>
                          <span className="capitalize">{item.frequency}</span>
                        </td>
                        <td className="border border-gray-300 px-2 py-2 max-w-xs truncate" title={getMachinesString(item.machines)}>
                          {getMachinesString(item.machines)}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 max-w-xs truncate" title={getLocationString(item)}>
                          {getLocationString(item)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed View Section */}
          {includeDetails && filteredData.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <AlertCircle className="h-5 w-5 mr-2" />
                Detailed Task Information
              </h2>
              
              {filteredData.map((item, index) => (
                <div key={item.pm_id || `item-${index}`} className="mb-6 border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {item.pmtitle || item.job_description || 'No title'} ({item.pm_id})
                      </h3>
                      <div className="space-y-1 text-sm">
                        <div><strong>Scheduled Date:</strong> {formatDate(item.scheduled_date)}</div>
                        <div><strong>Status:</strong> <span className={`font-medium ${getStatusColor(item)} capitalize`}>{getTaskStatus(item)}</span></div>
                        <div><strong>Frequency:</strong> <span className={`font-medium ${getFrequencyColor(item.frequency)} capitalize`}>{item.frequency}</span></div>
                      </div>
                    </div>
                    <div>
                      <div className="space-y-1 text-sm">
                        <div><strong>Machines:</strong> {getMachinesString(item.machines)}</div>
                        <div><strong>Topics:</strong> {getTopicsString(item.topics)}</div>
                        <div><strong>Location:</strong> {getLocationString(item)}</div>
                      </div>
                    </div>
                  </div>
             
                  {/* Procedure and Job Description Section */}
                  {(item.procedure || item.job_description) && (
                    <div className="border-t border-gray-200 pt-3 mb-3">
                      {item.procedure && (
                        <div className="mb-3">
                          <h4 className="font-medium text-gray-900 mb-2">Procedure:</h4>
                          <p className="text-sm text-gray-700 bg-white p-3 rounded border">{item.procedure}</p>
                        </div>
                      )}
                      {item.job_description && (
                        <div className="mb-3">
                          <h4 className="font-medium text-gray-900 mb-2">Job Description:</h4>
                          <p className="text-sm text-gray-700 bg-white p-3 rounded border">{item.job_description}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {item.notes && (
                    <div className="border-t border-gray-200 pt-3">
                      <h4 className="font-medium text-gray-900 mb-2">Notes:</h4>
                      <p className="text-sm text-gray-700">{item.notes}</p>
                    </div>
                  )}

                  {(() => {
               console.log('PDF Debug - Image section for item:', {
                 id: item.id,
                 pm_id: item.pm_id,
                 before_image_url: item.before_image_url,
                 after_image_url: item.after_image_url,
                 includeImages: includeImages,
                 hasBeforeImage: !!item.before_image_url,
                 hasAfterImage: !!item.after_image_url
               });
               
               if (!includeImages) {
                 console.log('PDF Debug - Images disabled by includeImages setting');
                 return null;
               }
               
               if (!item.before_image_url && !item.after_image_url) {
                 console.log('PDF Debug - No image URLs found for this item');
                 return null;
               }
               
                  return (
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <h4 className="font-medium text-gray-900 mb-3">Images:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {item.before_image_url && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Before:</p>
                            <div className="relative">
                              <img 
                                src={imageDataUrls[`before_${item.pm_id || item.id}`] || fixImageUrl(item.before_image_url || '') || item.before_image_url || ''} 
                                alt="Before maintenance"
                                className="w-full h-auto rounded border border-gray-300"
                                style={{ 
                                  maxHeight: '250px', 
                                  objectFit: 'contain',
                                  display: 'block',
                                  margin: '0 auto',
                                  backgroundColor: '#f9f9f9'
                                }}
                                crossOrigin="anonymous"
                                loading="lazy"
                                onLoad={(e) => {
                                  console.log('PDF Debug - Before image loaded successfully for item:', item.id);
                                  console.log('PDF Debug - Image source:', e.currentTarget.src);
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                                onError={(e) => {
                                  console.error('PDF Debug - Before image failed to load for item:', item.id);
                                  console.error('PDF Debug - Failed URL:', e.currentTarget.src);
                                  console.error('PDF Debug - Error details:', e);
                                  // Show placeholder instead of hiding
                                  const img = e.currentTarget;
                                  img.style.display = 'none';
                                  const placeholder = document.createElement('div');
                                  placeholder.className = 'w-full h-48 bg-gray-200 rounded border border-gray-300 flex items-center justify-center';
                                  placeholder.innerHTML = `
                                    <div class="text-center text-gray-500">
                                      <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                      </svg>
                                      <p class="text-sm">Image not available</p>
                                    </div>
                                  `;
                                  img.parentNode?.insertBefore(placeholder, img.nextSibling);
                                }}
                              />
                            </div>
                          </div>
                        )}
                        {item.after_image_url && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">After:</p>
                            <div className="relative">
                              <img 
                                src={imageDataUrls[`after_${item.pm_id || item.id}`] || fixImageUrl(item.after_image_url || '') || item.after_image_url || ''} 
                                alt="After maintenance"
                                className="w-full h-auto rounded border border-gray-300"
                                style={{ 
                                  maxHeight: '250px', 
                                  objectFit: 'contain',
                                  display: 'block',
                                  margin: '0 auto',
                                  backgroundColor: '#f9f9f9'
                                }}
                                crossOrigin="anonymous"
                                loading="lazy"
                                onLoad={(e) => {
                                  console.log('PDF Debug - After image loaded successfully for item:', item.id);
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                                onError={(e) => {
                                  console.error('PDF Debug - After image failed to load for item:', item.id);
                                  console.error('PDF Debug - Failed URL:', e.currentTarget.src);
                                  // Show placeholder instead of hiding
                                  const img = e.currentTarget;
                                  img.style.display = 'none';
                                  const placeholder = document.createElement('div');
                                  placeholder.className = 'w-full h-48 bg-gray-200 rounded border border-gray-300 flex items-center justify-center';
                                  placeholder.innerHTML = `
                                    <div class="text-center text-gray-500">
                                      <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                      </svg>
                                      <p class="text-sm">Image not available</p>
                                    </div>
                                  `;
                                  img.parentNode?.insertBefore(placeholder, img.nextSibling);
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-300 pt-4 text-center text-sm text-gray-500">
            <p>This report was automatically generated by the Facility Management System</p>
            <p>© 2025 - Confidential and Proprietary Information</p>
          </div>
        </div>
      </div>

      {/* No data message */}
      {filteredData.length === 0 && (
        <div className="no-print text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No maintenance tasks found</h3>
          <p className="text-gray-600">
            {maintenanceData.length === 0 
              ? "No maintenance data is available. Please ensure maintenance records are loaded."
              : "Try adjusting your filters to see more results."
            }
          </p>
        </div>
      )}
    </div>
    </div>
  );
};

export default PDFMaintenanceGenerator;
