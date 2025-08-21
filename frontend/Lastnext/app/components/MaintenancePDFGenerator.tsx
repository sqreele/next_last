'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Filter,
  Settings,
  Calendar,
  Building,
  CheckCircle,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface PDFGeneratorProps {
  onGenerate?: (url: string) => void;
}

interface FilterOptions {
  type: 'detailed' | 'compact';
  status: string;
  frequency: string;
  dateFrom: string;
  dateTo: string;
  topicId: string;
  propertyId: string;
  title: string;
}

const MaintenancePDFGenerator: React.FC<PDFGeneratorProps> = ({ onGenerate }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    type: 'detailed',
    status: 'all',
    frequency: 'all',
    dateFrom: '',
    dateTo: '',
    topicId: '',
    propertyId: '',
    title: 'Maintenance Report'
  });

  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    
    try {
      // Build query string
      const params = new URLSearchParams();
      
      if (filters.type) params.append('type', filters.type);
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.frequency && filters.frequency !== 'all') params.append('frequency', filters.frequency);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);
      if (filters.topicId) params.append('topic_id', filters.topicId);
      if (filters.propertyId) params.append('property_id', filters.propertyId);
      if (filters.title) params.append('title', filters.title);

      // Get auth token (you'll need to implement this based on your auth system)
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch(`/api/v1/maintenance/report/pdf/?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to generate PDF: ${response.statusText}`);
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `maintenance_report_${filters.type}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      
      // Call callback if provided
      if (onGenerate) {
        onGenerate(url);
      }
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-orange-600" />;
      case 'overdue':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Maintenance PDF Report</h2>
            <p className="text-gray-600">Generate clean and compact maintenance reports</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Filters Section */}
      {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Report Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Report Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="detailed">Detailed Report</option>
                <option value="compact">Compact Report</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            {/* Frequency Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frequency
              </label>
              <select
                value={filters.frequency}
                onChange={(e) => handleFilterChange('frequency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Frequencies</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date From
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date To
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Custom Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Report Title
              </label>
              <input
                type="text"
                value={filters.title}
                onChange={(e) => handleFilterChange('title', e.target.value)}
                placeholder="Enter custom title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Report Type Info */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-start space-x-3">
          <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">
              {filters.type === 'detailed' ? 'Detailed Report' : 'Compact Report'}
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              {filters.type === 'detailed' 
                ? 'Comprehensive report with detailed task information, individual sections, and professional layout.'
                : 'High-density table format with essential information for quick reference and overview.'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex justify-center">
        <button
          onClick={generatePDF}
          disabled={isGenerating}
          className="flex items-center space-x-3 px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Generating PDF...</span>
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              <span>Generate PDF Report</span>
            </>
          )}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => {
            setFilters({
              ...filters,
              type: 'compact',
              status: 'pending',
              title: 'Pending Maintenance Report'
            });
            generatePDF();
          }}
          className="flex items-center justify-center space-x-2 p-3 text-sm font-medium text-orange-700 bg-orange-100 rounded-md hover:bg-orange-200 transition-colors"
        >
          <Clock className="h-4 w-4" />
          <span>Quick: Pending Tasks</span>
        </button>

        <button
          onClick={() => {
            setFilters({
              ...filters,
              type: 'detailed',
              status: 'completed',
              title: 'Completed Maintenance Report'
            });
            generatePDF();
          }}
          className="flex items-center justify-center space-x-2 p-3 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
        >
          <CheckCircle className="h-4 w-4" />
          <span>Quick: Completed Tasks</span>
        </button>

        <button
          onClick={() => {
            setFilters({
              ...filters,
              type: 'compact',
              title: 'Monthly Overview Report'
            });
            generatePDF();
          }}
          className="flex items-center justify-center space-x-2 p-3 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
        >
          <Calendar className="h-4 w-4" />
          <span>Quick: Monthly Overview</span>
        </button>
      </div>
    </div>
  );
};

export default MaintenancePDFGenerator;
