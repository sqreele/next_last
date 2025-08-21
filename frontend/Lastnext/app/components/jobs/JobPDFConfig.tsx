// app/components/jobs/JobPDFConfig.tsx
'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Separator } from '@/app/components/ui/separator';
import { FileText, Image, BarChart3, Settings, Download } from 'lucide-react';

interface JobPDFConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: JobPDFConfig) => void;
  jobCount: number;
  selectedProperty?: string | null;
  propertyName?: string;
}

export interface JobPDFConfig {
  includeDetails: boolean;
  includeImages: boolean;
  includeStatistics: boolean;
  includeCharts: boolean;
  reportTitle: string;
  pageSize: 'A4' | 'LETTER' | 'LEGAL';
  orientation: 'portrait' | 'landscape';
  includeFooter: boolean;
  includePageNumbers: boolean;
  groupBy: 'none' | 'status' | 'priority' | 'assigned_to' | 'location';
  sortBy: 'created_date' | 'updated_date' | 'priority' | 'status' | 'title';
  sortOrder: 'asc' | 'desc';
  maxJobsPerPage: number;
  customStyling: boolean;
  watermark: boolean;
  password: string;
  compression: 'low' | 'medium' | 'high';
}

const defaultConfig: JobPDFConfig = {
  includeDetails: true,
  includeImages: true,
  includeStatistics: true,
  includeCharts: false,
  reportTitle: 'Jobs Report',
  pageSize: 'A4',
  orientation: 'portrait',
  includeFooter: true,
  includePageNumbers: true,
  groupBy: 'none',
  sortBy: 'created_date',
  sortOrder: 'desc',
  maxJobsPerPage: 6,
  customStyling: false,
  watermark: false,
  password: '',
  compression: 'medium',
};

export default function JobPDFConfig({ 
  isOpen, 
  onClose, 
  onGenerate, 
  jobCount, 
  selectedProperty, 
  propertyName 
}: JobPDFConfigProps) {
  const [config, setConfig] = useState<JobPDFConfig>(defaultConfig);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleConfigChange = (key: keyof JobPDFConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerate(config);
      onClose();
    } catch (error) {
      console.error('PDF generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(defaultConfig);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Configure Job PDF Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" />
              <h3 className="text-lg font-semibold">Basic Settings</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reportTitle">Report Title</Label>
                <Input
                  id="reportTitle"
                  value={config.reportTitle}
                  onChange={(e) => handleConfigChange('reportTitle', e.target.value)}
                  placeholder="Enter report title"
                />
              </div>
              
              <div>
                <Label htmlFor="pageSize">Page Size</Label>
                <Select value={config.pageSize} onValueChange={(value: any) => handleConfigChange('pageSize', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="LETTER">Letter</SelectItem>
                    <SelectItem value="LEGAL">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="orientation">Orientation</Label>
                <Select value={config.orientation} onValueChange={(value: any) => handleConfigChange('orientation', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="maxJobsPerPage">Jobs per Page</Label>
                <Select value={config.maxJobsPerPage.toString()} onValueChange={(value) => handleConfigChange('maxJobsPerPage', parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Content Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-green-600" />
              <h3 className="text-lg font-semibold">Content Options</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeDetails"
                  checked={config.includeDetails}
                  onCheckedChange={(checked) => handleConfigChange('includeDetails', checked)}
                />
                <Label htmlFor="includeDetails">Include Detailed Information</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeImages"
                  checked={config.includeImages}
                  onCheckedChange={(checked) => handleConfigChange('includeImages', checked)}
                />
                <Label htmlFor="includeImages">Include Job Images</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeStatistics"
                  checked={config.includeStatistics}
                  onCheckedChange={(checked) => handleConfigChange('includeStatistics', checked)}
                />
                <Label htmlFor="includeStatistics">Include Statistics</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeCharts"
                  checked={config.includeCharts}
                  onCheckedChange={(checked) => handleConfigChange('includeCharts', checked)}
                />
                <Label htmlFor="includeCharts">Include Charts</Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Organization Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              <h3 className="text-lg font-semibold">Organization</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="groupBy">Group By</Label>
                <Select value={config.groupBy} onValueChange={(value: any) => handleConfigChange('groupBy', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Grouping</SelectItem>
                    <SelectItem value="status">By Status</SelectItem>
                    <SelectItem value="priority">By Priority</SelectItem>
                    <SelectItem value="assigned_to">By Assigned To</SelectItem>
                    <SelectItem value="location">By Location</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="sortBy">Sort By</Label>
                <Select value={config.sortBy} onValueChange={(value: any) => handleConfigChange('sortBy', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_date">Created Date</SelectItem>
                    <SelectItem value="updated_date">Updated Date</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Select value={config.sortOrder} onValueChange={(value: any) => handleConfigChange('sortOrder', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Advanced Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-orange-600" />
              <h3 className="text-lg font-semibold">Advanced Options</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeFooter"
                  checked={config.includeFooter}
                  onCheckedChange={(checked) => handleConfigChange('includeFooter', checked)}
                />
                <Label htmlFor="includeFooter">Include Footer</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includePageNumbers"
                  checked={config.includePageNumbers}
                  onCheckedChange={(checked) => handleConfigChange('includePageNumbers', checked)}
                />
                <Label htmlFor="includePageNumbers">Include Page Numbers</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="customStyling"
                  checked={config.customStyling}
                  onCheckedChange={(checked) => handleConfigChange('customStyling', checked)}
                />
                <Label htmlFor="customStyling">Custom Styling</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="watermark"
                  checked={config.watermark}
                  onCheckedChange={(checked) => handleConfigChange('watermark', checked)}
                />
                <Label htmlFor="watermark">Add Watermark</Label>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="compression">Compression Level</Label>
                <Select value={config.compression} onValueChange={(value: any) => handleConfigChange('compression', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (Better Quality)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="high">High (Smaller File)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="password">Password Protection (Optional)</Label>
                <Input
                  id="password"
                  type="password"
                  value={config.password}
                  onChange={(e) => handleConfigChange('password', e.target.value)}
                  placeholder="Leave empty for no protection"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Report Summary</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• {jobCount} jobs will be included</p>
              <p>• {config.includeImages ? 'With' : 'Without'} images</p>
              <p>• {config.includeStatistics ? 'With' : 'Without'} statistics</p>
              <p>• {config.includeDetails ? 'Detailed' : 'Basic'} information</p>
              <p>• {config.pageSize} page size, {config.orientation} orientation</p>
              {config.groupBy !== 'none' && <p>• Grouped by {config.groupBy}</p>}
              {config.password && <p>• Password protected</p>}
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetToDefaults}>
              Reset to Defaults
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isGenerating ? 'Generating...' : 'Generate PDF'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
