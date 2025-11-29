'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/app/lib/session.client';
import { useUser } from '@/app/lib/stores/mainStore';
import apiClient from '@/app/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Wrench,
  Search,
  MapPin,
  Calendar,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

interface Machine {
  machine_id: string;
  name: string;
  model?: string;
  manufacturer?: string;
  serial_number?: string;
  location?: string;
  category?: string;
  property?: {
    property_id: string;
    name: string;
  };
  property_name?: string; // API returns this as a string
  installation_date?: string;
  pm_count?: number; // Count of PM records
  last_maintenance?: string; // Last PM date
}

export default function MachinesListPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedPropertyId: selectedProperty } = useUser();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMachines();
    }
  }, [status, selectedProperty, page, pageSize]);

  // Reset to page 1 when property changes
  useEffect(() => {
    setPage(1);
  }, [selectedProperty]);

  const fetchMachines = async () => {
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

      const response = await apiClient.get('/api/v1/machines/', { params });
      
      console.log('Machines API response:', response.data);
      
      let machinesData: Machine[] = [];
      let total = 0;
      
      if (Array.isArray(response.data)) {
        machinesData = response.data;
        total = response.data.length;
      } else if (response.data && 'results' in response.data) {
        machinesData = response.data.results || [];
        total = response.data.count || 0;
      }
      
      // Debug: Log first machine to check property_name
      if (machinesData.length > 0) {
        console.log('First machine data:', machinesData[0]);
        console.log('Property name:', machinesData[0].property_name);
        console.log('Property object:', machinesData[0].property);
      }
      
      setTotalCount(total);

      // Fetch PM count for each machine
      const machinesWithCounts = await Promise.all(
        machinesData.map(async (machine) => {
          try {
            const pmResponse = await apiClient.get('/api/v1/preventive-maintenance/', {
              params: { machine_id: machine.machine_id }
            });
            
            let pmData: any[] = [];
            if (Array.isArray(pmResponse.data)) {
              pmData = pmResponse.data;
            } else if (pmResponse.data && 'results' in pmResponse.data) {
              pmData = pmResponse.data.results || [];
            }
            
            // Find the most recent PM
            const sortedPMs = pmData.sort((a: any, b: any) => 
              new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
            );
            
            return {
              ...machine,
              pm_count: pmData.length,
              last_maintenance: sortedPMs.length > 0 ? sortedPMs[0].scheduled_date : undefined
            };
          } catch (err) {
            console.error(`Error fetching PM data for machine ${machine.machine_id}:`, err);
            return {
              ...machine,
              pm_count: 0,
              last_maintenance: undefined
            };
          }
        })
      );

      setMachines(machinesWithCounts);
    } catch (err: any) {
      console.error('Error fetching machines:', err);
      setError(err.message || 'Failed to load machines');
      setMachines([]);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique categories from machines
  const categories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    machines.forEach((machine) => {
      if (machine.category) {
        uniqueCategories.add(machine.category);
      }
    });
    return Array.from(uniqueCategories).sort();
  }, [machines]);

  const filteredMachines = machines.filter((machine) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      machine.name?.toLowerCase().includes(searchLower) ||
      machine.machine_id?.toLowerCase().includes(searchLower) ||
      machine.location?.toLowerCase().includes(searchLower) ||
      machine.category?.toLowerCase().includes(searchLower);
    
    const matchesCategory = selectedCategory === 'all' || machine.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading machines...</p>
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

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Wrench className="h-8 w-8 text-blue-600" />
              Machines
            </h1>
          </div>
          <p className="text-gray-600 mt-1">
            {totalCount} machine{totalCount !== 1 ? 's' : ''} total
            {(searchTerm || selectedCategory !== 'all') && ` (${filteredMachines.length} filtered)`}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, ID, location, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        </CardContent>
      </Card>

      {/* Machines Grid/List */}
      {filteredMachines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Machines Found</h3>
            <p className="text-gray-600">
              {(searchTerm || selectedCategory !== 'all') ? 'Try adjusting your search or filter criteria' : 'No machines available for this property'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMachines.map((machine) => (
            <Link
              key={machine.machine_id}
              href={`/dashboard/machines/${machine.machine_id}`}
              className="block group"
            >
              <Card className="h-full hover:shadow-lg transition-shadow border-2 hover:border-blue-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Wrench className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {machine.name}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">{machine.machine_id}</p>
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {machine.category && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {machine.category}
                      </Badge>
                    </div>
                  )}

                  {machine.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{machine.location}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-200 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <FileText className="h-4 w-4 text-purple-500" />
                        <span>PM Records</span>
                      </div>
                      <span className="font-semibold text-gray-900">
                        {machine.pm_count || 0}
                      </span>
                    </div>

                    {machine.last_maintenance && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="h-3 w-3" />
                        <span>Last PM: {new Date(machine.last_maintenance).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
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
                      Machine
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PM Records
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Maintenance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredMachines.map((machine) => (
                    <tr
                      key={machine.machine_id}
                      onClick={() => router.push(`/dashboard/machines/${machine.machine_id}`)}
                      className="hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                            <Wrench className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {machine.name}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              {machine.machine_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {machine.category ? (
                          <Badge variant="secondary" className="text-xs">
                            {machine.category}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {machine.location ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span>{machine.location}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-purple-500" />
                          <span className="font-semibold text-gray-900">
                            {machine.pm_count || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {machine.last_maintenance ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>{new Date(machine.last_maintenance).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {machine.property_name || machine.property?.name || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {(!searchTerm && selectedCategory === 'all') && filteredMachines.length > 0 && totalPages > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} machines
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
                    setPage(1); // Reset to first page when changing page size
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

