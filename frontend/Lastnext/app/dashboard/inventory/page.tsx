'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/app/lib/session.client';
import { useUser } from '@/app/lib/stores/mainStore';
import apiClient from '@/app/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Package,
  Search,
  MapPin,
  Loader2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Filter,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingCart,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';

interface InventoryItem {
  id: number;
  item_id: string;
  name: string;
  description?: string;
  category: string;
  category_display?: string;
  quantity: number;
  min_quantity: number;
  max_quantity?: number;
  unit: string;
  unit_price?: number;
  location?: string;
  supplier?: string;
  supplier_contact?: string;
  status: string;
  status_display?: string;
  property_id?: string;
  property_name?: string;
  room_id?: string;
  room_name?: string;
  job_id?: string;
  job_description?: string;
  pm_id?: string;
  pm_title?: string;
  last_job_by_user?: {
    job_id: string;
    description: string;
    full_description: string;
  } | null;
  last_pm_by_user?: {
    pm_id: string;
    title: string;
    full_title: string;
  } | null;
  image_url?: string;
  last_restocked?: string;
  expiry_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800 border-green-200',
  low_stock: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  out_of_stock: 'bg-red-100 text-red-800 border-red-200',
  reserved: 'bg-blue-100 text-blue-800 border-blue-200',
  maintenance: 'bg-gray-100 text-gray-800 border-gray-200',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  tools: '🔧',
  parts: '⚙️',
  supplies: '📦',
  equipment: '🛠️',
  consumables: '🧴',
  safety: '🦺',
  other: '📋',
};

export default function InventoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedPropertyId: selectedProperty } = useUser();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [lowStockOnly, setLowStockOnly] = useState<boolean>(false);
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>('all');
  const [selectedPmFilter, setSelectedPmFilter] = useState<string>('all');
  const [rooms, setRooms] = useState<Array<{room_id: string; roomname: string}>>([]);
  const [jobsForFilter, setJobsForFilter] = useState<Array<{job_id: string; description: string}>>([]);
  const [pmsForFilter, setPmsForFilter] = useState<Array<{pm_id: string; pmtitle: string}>>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [showUseDialog, setShowUseDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [useQuantity, setUseQuantity] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedPmId, setSelectedPmId] = useState<string>('');
  const [userJobs, setUserJobs] = useState<Array<{job_id: string; description: string}>>([]);
  const [userPMs, setUserPMs] = useState<Array<{pm_id: string; pmtitle: string}>>([]);
  const [loadingJobsPMs, setLoadingJobsPMs] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchInventory();
    }
  }, [status, selectedProperty, page, pageSize, selectedCategory, selectedStatus, selectedRoom, lowStockOnly, selectedJobFilter, selectedPmFilter, searchTerm]);

  // Fetch rooms, jobs, and PMs for filters when property changes or on load
  useEffect(() => {
    const fetchFilterOptions = async () => {
      if (status !== 'authenticated') return;
      
      try {
        // Fetch rooms for the selected property
        const roomParams: any = { page_size: 100 };
        if (selectedProperty) {
          roomParams.property_id = selectedProperty;
        }
        const roomsResponse = await apiClient.get('/api/v1/rooms/', { params: roomParams });
        const roomsData = Array.isArray(roomsResponse.data) 
          ? roomsResponse.data 
          : (roomsResponse.data?.results || []);
        setRooms(roomsData.map((room: any) => ({
          room_id: room.room_id,
          roomname: room.roomname || room.room_id
        })));

        // Fetch jobs for filter
        const jobsResponse = await apiClient.get('/api/v1/jobs/', {
          params: { page_size: 100, ordering: '-updated_at' }
        });
        const jobsData = Array.isArray(jobsResponse.data) 
          ? jobsResponse.data 
          : (jobsResponse.data?.results || []);
        setJobsForFilter(jobsData.map((job: any) => ({
          job_id: job.job_id,
          description: job.description || ''
        })));

        // Fetch PMs for filter
        const pmResponse = await apiClient.get('/api/v1/preventive-maintenance/', {
          params: { page_size: 100, ordering: '-updated_at' }
        });
        const pmData = Array.isArray(pmResponse.data)
          ? pmResponse.data
          : (pmResponse.data?.results || []);
        setPmsForFilter(pmData.map((pm: any) => ({
          pm_id: pm.pm_id,
          pmtitle: pm.pmtitle || ''
        })));
      } catch (err: any) {
        console.error('Error fetching filter options:', err);
      }
    };

    fetchFilterOptions();
  }, [status, selectedProperty]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedProperty, selectedCategory, selectedStatus, selectedRoom, lowStockOnly, selectedJobFilter, selectedPmFilter, searchTerm]);

  // Fetch user's jobs and PMs when use dialog opens
  useEffect(() => {
    const fetchUserJobsAndPMs = async () => {
      if (!showUseDialog || status !== 'authenticated') return;
      
      setLoadingJobsPMs(true);
      try {
        // Fetch user's recent jobs
        const jobsResponse = await apiClient.get('/api/v1/jobs/my_jobs/', {
          params: { page_size: 50, ordering: '-updated_at' }
        });
        const jobsData = Array.isArray(jobsResponse.data) 
          ? jobsResponse.data 
          : (jobsResponse.data?.results || []);
        setUserJobs(jobsData.map((job: any) => ({
          job_id: job.job_id,
          description: job.description || ''
        })));

        // Fetch user's PMs (assigned to or created by user)
        const pmResponse = await apiClient.get('/api/v1/preventive-maintenance/', {
          params: { page_size: 50, ordering: '-updated_at' }
        });
        const pmData = Array.isArray(pmResponse.data)
          ? pmResponse.data
          : (pmResponse.data?.results || []);
        setUserPMs(pmData.map((pm: any) => ({
          pm_id: pm.pm_id,
          pmtitle: pm.pmtitle || ''
        })));

        // Pre-select last used job/PM if available
        if (selectedItem) {
          if (selectedItem.last_job_by_user) {
            setSelectedJobId(selectedItem.last_job_by_user.job_id);
          }
          if (selectedItem.last_pm_by_user) {
            setSelectedPmId(selectedItem.last_pm_by_user.pm_id);
          }
        }
      } catch (err: any) {
        console.error('Error fetching jobs/PMs:', err);
      } finally {
        setLoadingJobsPMs(false);
      }
    };

    fetchUserJobsAndPMs();
  }, [showUseDialog, status, selectedItem]);

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        page: page,
        page_size: pageSize
      };
      if (selectedProperty) {
        params.property_id = selectedProperty;
      }
      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (selectedStatus !== 'all') {
        params.status = selectedStatus;
      }
      if (selectedRoom !== 'all') {
        params.room_id = selectedRoom;
      }
      if (lowStockOnly) {
        params.low_stock = 'true';
      }
      if (selectedJobFilter !== 'all') {
        params.job_id = selectedJobFilter;
      }
      if (selectedPmFilter !== 'all') {
        params.pm_id = selectedPmFilter;
      }
      // Send search term to backend for proper pagination
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await apiClient.get('/api/v1/inventory/', { params });
      
      let inventoryData: InventoryItem[] = [];
      let total = 0;
      let pages = 1;
      
      if (Array.isArray(response.data)) {
        inventoryData = response.data;
        total = response.data.length;
        pages = Math.ceil(total / pageSize);
      } else if (response.data && 'results' in response.data) {
        inventoryData = response.data.results || [];
        total = response.data.count || 0;
        pages = response.data.total_pages || Math.ceil(total / (response.data.page_size || pageSize));
      }
      
      setTotalCount(total);
      setTotalPages(pages);
      setInventory(inventoryData);
    } catch (err: any) {
      console.error('Error fetching inventory:', err);
      setError(err.message || 'Failed to load inventory');
      setInventory([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  // No need for client-side filtering - backend handles it via search param
  // Keep filteredInventory for backward compatibility but use inventory directly
  const filteredInventory = inventory;

  const handleRestock = async () => {
    if (!selectedItem || !restockQuantity) return;
    
    try {
      await apiClient.post(`/api/v1/inventory/${selectedItem.item_id}/restock/`, {
        quantity: parseInt(restockQuantity)
      });
      setShowRestockDialog(false);
      setRestockQuantity('');
      setSelectedItem(null);
      fetchInventory();
    } catch (err: any) {
      console.error('Error restocking:', err);
      alert(err.response?.data?.error || 'Failed to restock item');
    }
  };

  const handleUse = async () => {
    if (!selectedItem || !useQuantity) return;
    
    try {
      const payload: any = {
        quantity: parseInt(useQuantity)
      };
      
      // Add job_id or pm_id if selected
      if (selectedJobId) {
        payload.job_id = selectedJobId;
      }
      if (selectedPmId) {
        payload.pm_id = selectedPmId;
      }
      
      await apiClient.post(`/api/v1/inventory/${selectedItem.item_id}/use/`, payload);
      setShowUseDialog(false);
      setUseQuantity('');
      setSelectedJobId('');
      setSelectedPmId('');
      setSelectedItem(null);
      fetchInventory();
    } catch (err: any) {
      console.error('Error using item:', err);
      alert(err.response?.data?.error || 'Failed to use item');
    }
  };

  const getStatusBadge = (status: string) => {
    const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 border-gray-200';
    const statusText = status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return (
      <Badge className={colorClass}>
        {status === 'available' && <CheckCircle2 className="h-3 w-3 mr-1" />}
        {status === 'low_stock' && <AlertTriangle className="h-3 w-3 mr-1" />}
        {status === 'out_of_stock' && <XCircle className="h-3 w-3 mr-1" />}
        {status === 'reserved' && <Clock className="h-3 w-3 mr-1" />}
        {statusText}
      </Badge>
    );
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lowStockCount = inventory.filter(item => item.status === 'low_stock' || item.status === 'out_of_stock').length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-600" />
              Inventory Management
            </h1>
          </div>
          <p className="text-gray-600 mt-1">
            {totalCount} item{totalCount !== 1 ? 's' : ''} total
            {lowStockCount > 0 && (
              <span className="ml-2 text-yellow-600 font-semibold">
                ({lowStockCount} low/out of stock)
              </span>
            )}
            {(searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all' || selectedRoom !== 'all' || lowStockOnly || selectedJobFilter !== 'all' || selectedPmFilter !== 'all') && ` (${filteredInventory.length} filtered)`}
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Inventory Item</DialogTitle>
              <DialogDescription>
                Create a new inventory item for tracking
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Item Name *</Label>
                  <Input id="name" placeholder="Enter item name" />
                </div>
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tools">Tools</SelectItem>
                      <SelectItem value="parts">Parts</SelectItem>
                      <SelectItem value="supplies">Supplies</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="consumables">Consumables</SelectItem>
                      <SelectItem value="safety">Safety Equipment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Enter description" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="quantity">Initial Quantity *</Label>
                  <Input id="quantity" type="number" defaultValue="0" />
                </div>
                <div>
                  <Label htmlFor="min_quantity">Min Quantity</Label>
                  <Input id="min_quantity" type="number" defaultValue="0" />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input id="unit" defaultValue="pcs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" placeholder="Storage location" />
                </div>
                <div>
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input id="supplier" placeholder="Supplier name" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={() => {
                // TODO: Implement add functionality
                setShowAddDialog(false);
              }}>Add Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* First Row: Search and View Toggle */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by name, ID, location, supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* View Toggle */}
              <div className="flex items-center gap-2 border rounded-md p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-9 px-3"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-9 px-3"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Second Row: All Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Filter className="h-5 w-5 text-gray-400" />
              
              {/* Category Filter */}
              <Select value={selectedCategory} onValueChange={(value) => {
                setSelectedCategory(value);
                setPage(1);
              }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="tools">Tools</SelectItem>
                  <SelectItem value="parts">Parts</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="consumables">Consumables</SelectItem>
                  <SelectItem value="safety">Safety Equipment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={selectedStatus} onValueChange={(value) => {
                setSelectedStatus(value);
                setPage(1);
              }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="maintenance">Under Maintenance</SelectItem>
                </SelectContent>
              </Select>

              {/* Room Filter */}
              <Select value={selectedRoom} onValueChange={(value) => {
                setSelectedRoom(value);
                setPage(1);
              }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Rooms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rooms</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.room_id} value={room.room_id}>
                      {room.roomname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Job Filter */}
              <Select value={selectedJobFilter} onValueChange={(value) => {
                setSelectedJobFilter(value);
                setPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs</SelectItem>
                  {jobsForFilter.map((job) => (
                    <SelectItem key={job.job_id} value={job.job_id}>
                      {job.job_id} - {job.description?.substring(0, 30) || 'No desc'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* PM Filter */}
              <Select value={selectedPmFilter} onValueChange={(value) => {
                setSelectedPmFilter(value);
                setPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All PMs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pmsForFilter.map((pm) => (
                    <SelectItem key={pm.pm_id} value={pm.pm_id}>
                      {pm.pm_id} - {pm.pmtitle?.substring(0, 30) || 'No title'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Low Stock Toggle */}
              <Button
                variant={lowStockOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setLowStockOnly(!lowStockOnly);
                  setPage(1);
                }}
                className={`gap-2 ${lowStockOnly ? 'bg-yellow-600 hover:bg-yellow-700' : ''}`}
              >
                <AlertTriangle className="h-4 w-4" />
                Low Stock Only
              </Button>

              {/* Clear Filters */}
              {(selectedCategory !== 'all' || selectedStatus !== 'all' || selectedRoom !== 'all' || lowStockOnly || selectedJobFilter !== 'all' || selectedPmFilter !== 'all' || searchTerm) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedStatus('all');
                    setSelectedRoom('all');
                    setLowStockOnly(false);
                    setSelectedJobFilter('all');
                    setSelectedPmFilter('all');
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Grid/List */}
      {filteredInventory.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Inventory Items Found</h3>
            <p className="text-gray-600">
              {(searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all' || selectedRoom !== 'all' || lowStockOnly || selectedJobFilter !== 'all' || selectedPmFilter !== 'all') 
                ? 'Try adjusting your search or filter criteria' 
                : 'No inventory items available for this property'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInventory.map((item) => (
            <Card key={item.id} className="h-full hover:shadow-lg transition-shadow border-2 hover:border-blue-300">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {item.image_url ? (
                      <div className="flex-shrink-0">
                        <img 
                          src={item.image_url} 
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-lg border-2 border-gray-200"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (target.nextElementSibling) {
                              (target.nextElementSibling as HTMLElement).style.display = 'flex';
                            }
                          }}
                        />
                        <div className="p-2 bg-blue-100 rounded-lg text-2xl hidden">
                          {CATEGORY_ICONS[item.category] || '📋'}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0 text-2xl">
                        {CATEGORY_ICONS[item.category] || '📋'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.name}
                      </h3>
                      <p className="text-xs text-gray-500 font-mono">{item.item_id}</p>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  {getStatusBadge(item.status)}
                  {item.category_display && (
                    <Badge variant="secondary" className="text-xs">
                      {item.category_display}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Quantity:</span>
                    <span className="text-lg font-bold text-gray-900">
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                  {item.min_quantity > 0 && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Min:</span>
                      <span>{item.min_quantity} {item.unit}</span>
                    </div>
                  )}
                </div>

                {item.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{item.location}</span>
                  </div>
                )}

                {item.room_name && (
                  <div className="text-xs text-gray-500">
                    Room: {item.room_name}
                  </div>
                )}

                {item.last_job_by_user && (
                  <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                    <span className="font-semibold">Last Job:</span> {item.last_job_by_user.job_id} - {item.last_job_by_user.description}
                  </div>
                )}

                {item.last_pm_by_user && (
                  <div className="text-xs text-purple-600 bg-purple-50 p-2 rounded">
                    <span className="font-semibold">Last PM:</span> {item.last_pm_by_user.pm_id} - {item.last_pm_by_user.title}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-200 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedItem(item);
                      setShowRestockDialog(true);
                    }}
                  >
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    Restock
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedItem(item);
                      setShowUseDialog(true);
                    }}
                    disabled={item.quantity === 0}
                  >
                    Use
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Job/PM
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredInventory.map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <>
                              <img 
                                src={item.image_url} 
                                alt={item.name}
                                className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  if (target.nextElementSibling) {
                                    (target.nextElementSibling as HTMLElement).style.display = 'block';
                                  }
                                }}
                              />
                              <div className="text-2xl hidden">{CATEGORY_ICONS[item.category] || '📋'}</div>
                            </>
                          ) : (
                            <div className="text-2xl">{CATEGORY_ICONS[item.category] || '📋'}</div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {item.name}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              {item.item_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary" className="text-xs">
                          {item.category_display || item.category}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <span className="font-semibold text-gray-900">
                            {item.quantity}
                          </span>
                          <span className="text-gray-500 ml-1">{item.unit}</span>
                          {item.min_quantity > 0 && (
                            <div className="text-xs text-gray-400">
                              Min: {item.min_quantity}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {item.location ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span>{item.location}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        {item.last_job_by_user && (
                          <div className="text-blue-600 mb-1">
                            <span className="font-semibold">Job:</span> {item.last_job_by_user.job_id}
                            <div className="text-gray-500 truncate max-w-xs" title={item.last_job_by_user.full_description}>
                              {item.last_job_by_user.description}
                            </div>
                          </div>
                        )}
                        {item.last_pm_by_user && (
                          <div className="text-purple-600">
                            <span className="font-semibold">PM:</span> {item.last_pm_by_user.pm_id}
                            <div className="text-gray-500 truncate max-w-xs" title={item.last_pm_by_user.full_title}>
                              {item.last_pm_by_user.title}
                            </div>
                          </div>
                        )}
                        {!item.last_job_by_user && !item.last_pm_by_user && (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowRestockDialog(true);
                            }}
                          >
                            Restock
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowUseDialog(true);
                            }}
                            disabled={item.quantity === 0}
                          >
                            Use
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Restock Dialog */}
      <Dialog open={showRestockDialog} onOpenChange={setShowRestockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock Item</DialogTitle>
            <DialogDescription>
              Add quantity to {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="restock-quantity">Quantity to Add</Label>
              <Input
                id="restock-quantity"
                type="number"
                min="1"
                value={restockQuantity}
                onChange={(e) => setRestockQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            {selectedItem && (
              <div className="text-sm text-gray-600">
                Current: {selectedItem.quantity} {selectedItem.unit}
                {restockQuantity && (
                  <span className="ml-2 font-semibold">
                    → {selectedItem.quantity + parseInt(restockQuantity) || 0} {selectedItem.unit}
                  </span>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRestockDialog(false);
              setRestockQuantity('');
              setSelectedItem(null);
            }}>Cancel</Button>
            <Button onClick={handleRestock} disabled={!restockQuantity || parseInt(restockQuantity) <= 0}>
              Restock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use Dialog */}
      <Dialog open={showUseDialog} onOpenChange={(open) => {
        setShowUseDialog(open);
        if (!open) {
          setUseQuantity('');
          setSelectedJobId('');
          setSelectedPmId('');
          setSelectedItem(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Item</DialogTitle>
            <DialogDescription>
              Subtract quantity from {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="use-quantity">Quantity to Use</Label>
              <Input
                id="use-quantity"
                type="number"
                min="1"
                max={selectedItem?.quantity}
                value={useQuantity}
                onChange={(e) => setUseQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            {selectedItem && (
              <div className="text-sm text-gray-600">
                Current: {selectedItem.quantity} {selectedItem.unit}
                {useQuantity && (
                  <span className="ml-2 font-semibold">
                    → {Math.max(0, selectedItem.quantity - (parseInt(useQuantity) || 0))} {selectedItem.unit}
                  </span>
                )}
              </div>
            )}
            
            {/* Job Selection */}
            <div>
              <Label htmlFor="use-job">Link to Job (Optional)</Label>
              {loadingJobsPMs ? (
                <div className="text-sm text-gray-500 py-2">Loading jobs...</div>
              ) : (
                <Select 
                  value={selectedJobId || undefined} 
                  onValueChange={(value) => setSelectedJobId(value || '')}
                >
                  <SelectTrigger id="use-job">
                    <SelectValue placeholder="Select a job (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {userJobs.length > 0 ? (
                      userJobs.map((job) => (
                        <SelectItem key={job.job_id} value={job.job_id}>
                          {job.job_id} - {job.description?.substring(0, 50) || 'No description'}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-jobs" disabled>
                        No jobs available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
              {selectedItem?.last_job_by_user && !selectedJobId && (
                <div className="text-xs text-blue-600 mt-1">
                  Last used: {selectedItem.last_job_by_user.job_id}
                </div>
              )}
            </div>

            {/* PM Selection */}
            <div>
              <Label htmlFor="use-pm">Link to Preventive Maintenance (Optional)</Label>
              {loadingJobsPMs ? (
                <div className="text-sm text-gray-500 py-2">Loading PMs...</div>
              ) : (
                <Select 
                  value={selectedPmId || undefined} 
                  onValueChange={(value) => setSelectedPmId(value || '')}
                >
                  <SelectTrigger id="use-pm">
                    <SelectValue placeholder="Select a PM (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {userPMs.length > 0 ? (
                      userPMs.map((pm) => (
                        <SelectItem key={pm.pm_id} value={pm.pm_id}>
                          {pm.pm_id} - {pm.pmtitle?.substring(0, 50) || 'No title'}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-pms" disabled>
                        No PMs available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
              {selectedItem?.last_pm_by_user && !selectedPmId && (
                <div className="text-xs text-purple-600 mt-1">
                  Last used: {selectedItem.last_pm_by_user.pm_id}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 pt-2 border-t">
              Note: You can link this inventory usage to a job or PM to track what it was used for.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUseDialog(false);
              setUseQuantity('');
              setSelectedJobId('');
              setSelectedPmId('');
              setSelectedItem(null);
            }}>Cancel</Button>
            <Button onClick={handleUse} disabled={!useQuantity || parseInt(useQuantity) <= 0 || (selectedItem ? parseInt(useQuantity) > selectedItem.quantity : false)}>
              Use
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {filteredInventory.length > 0 && totalPages > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} items
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className="min-w-[2.5rem]"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Per page:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={48}>48</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

