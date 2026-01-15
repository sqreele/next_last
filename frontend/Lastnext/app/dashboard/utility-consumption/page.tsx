"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useUser } from "@/app/lib/stores/mainStore";
import { useSession } from "@/app/lib/session.client";
import apiClient from "@/app/lib/api-client";
import { Button } from "@/app/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar, Filter } from "lucide-react";

interface UtilityConsumption {
  id: number;
  property_id?: string;
  property_name?: string;
  month: number;
  month_display: string;
  year: number;
  totalkwh?: number;
  onpeakkwh?: number;
  offpeakkwh?: number;
  totalelectricity?: number;
  water?: number;
  nightsale?: number;
  created_at: string;
  updated_at: string;
}

interface UtilityConsumptionResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: UtilityConsumption[];
}

const UtilityConsumptionPage = () => {
  const { selectedPropertyId } = useUser();
  const { data: session } = useSession();
  const [data, setData] = useState<UtilityConsumption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [comparisonYear1, setComparisonYear1] = useState<number>(new Date().getFullYear() - 1);
  const [comparisonYear2, setComparisonYear2] = useState<number>(new Date().getFullYear());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateIsMobile = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  // Fetch utility consumption data - ALWAYS fetch ALL years for comparison
  // Filter is applied client-side for display, but all data is kept for year-over-year comparison
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Always fetch ALL years data (without year/month filter) for comparison dropdowns and year-over-year charts
        const allYearsParams: Record<string, string> = {};
        if (selectedPropertyId) {
          allYearsParams.property_id = selectedPropertyId;
        }
        // DO NOT filter by year or month here - we need all data for comparison

        let allYearsResults: UtilityConsumption[] = [];
        let allYearsUrl: string | null = '/api/v1/utility-consumption/';
        let isFirstPageAllYears = true;

        while (allYearsUrl) {
          const requestParams = isFirstPageAllYears ? allYearsParams : undefined;
          const allYearsResponse: { data: UtilityConsumptionResponse } = await apiClient.get<UtilityConsumptionResponse>(allYearsUrl, {
            params: requestParams,
          });

          if (allYearsResponse.data.results) {
            allYearsResults = [...allYearsResults, ...allYearsResponse.data.results];
          }

          if (allYearsResponse.data.next) {
            if (allYearsResponse.data.next.startsWith('http')) {
              try {
                const urlObj: URL = new URL(allYearsResponse.data.next);
                allYearsUrl = urlObj.pathname + urlObj.search;
              } catch {
                const match: RegExpMatchArray | null = allYearsResponse.data.next.match(/\/api\/v1\/[^?]+(\?.*)?/);
                allYearsUrl = match ? match[0] : null;
              }
            } else {
              allYearsUrl = allYearsResponse.data.next;
            }
            isFirstPageAllYears = false;
          } else {
            allYearsUrl = null;
          }
        }

        // Store ALL years data - filtering will be done client-side in useMemo
        setData(allYearsResults);
      } catch (err: any) {
        console.error('Error fetching utility consumption:', err);
        setError(err.message || 'Failed to fetch utility consumption data');
      } finally {
        setIsLoading(false);
      }
    };

    if (session?.user) {
      fetchData();
    }
  }, [session, selectedPropertyId]); // Removed selectedYear and selectedMonth from dependencies - fetch all data once

  // Get available years from data, plus ensure common years (current year, previous year) are always available
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    // Add years from data
    data.forEach(item => years.add(item.year));
    
    // Always include current year and previous year (for comparison)
    years.add(currentYear);
    years.add(previousYear);
    
    // Also include next year if we're near end of year (for future planning)
    const nextYear = currentYear + 1;
    years.add(nextYear);
    
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  // Filter data by selected year and month (client-side filtering)
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Filter by selected year
      if (item.year !== selectedYear) {
        return false;
      }
      // Filter by selected month if a month is selected
      if (selectedMonth !== null && item.month !== selectedMonth) {
        return false;
      }
      return true;
    });
  }, [data, selectedYear, selectedMonth]);

  // Prepare chart data grouped by month (using filtered data)
  const monthlyData = useMemo(() => {
    const grouped: Record<string, {
      month: string;
      monthNum: number;
      totalkwh: number;
      onpeakkwh: number;
      offpeakkwh: number;
      totalelectricity: number;
      water: number;
      nightsale: number;
      totalkwhPerNightsale: number;
      waterPerNightsale: number;
    }> = {};

    // Helper to safely convert to number
    const toNumber = (value: any): number => {
      if (value === null || value === undefined || value === '') return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    filteredData.forEach(item => {
      const key = `${item.year}-${item.month}`;
      if (!grouped[key]) {
        grouped[key] = {
          month: item.month_display,
          monthNum: item.month,
          totalkwh: 0,
          onpeakkwh: 0,
          offpeakkwh: 0,
          totalelectricity: 0,
          water: 0,
          nightsale: 0,
          totalkwhPerNightsale: 0,
          waterPerNightsale: 0,
        };
      }
      // Sum all values for this month (handles multiple records per month)
      grouped[key].totalkwh += toNumber(item.totalkwh);
      grouped[key].onpeakkwh += toNumber(item.onpeakkwh);
      grouped[key].offpeakkwh += toNumber(item.offpeakkwh);
      grouped[key].totalelectricity += toNumber(item.totalelectricity);
      grouped[key].water += toNumber(item.water);
      grouped[key].nightsale += toNumber(item.nightsale);
    });

    // Calculate ratios: totalkwh / nightsale and water / nightsale for each month
    const result = Object.values(grouped).map(item => ({
      ...item,
      totalkwhPerNightsale: item.nightsale > 0 
        ? item.totalkwh / item.nightsale 
        : 0,
      waterPerNightsale: item.nightsale > 0 
        ? item.water / item.nightsale 
        : 0,
    }));

    return result.sort((a, b) => a.monthNum - b.monthNum);
  }, [filteredData]);

  // Calculate totals - sum all months when "All Months" is selected (using filtered data)
  const totals = useMemo(() => {
    // Convert all values to numbers and sum them
    const sumField = (field: keyof UtilityConsumption): number => {
      return filteredData.reduce((sum, item) => {
        const value = item[field];
        // Handle null, undefined, or string values
        if (value === null || value === undefined || value === '') {
          return sum;
        }
        // Convert to number if it's a string
        const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
        return sum + (isNaN(numValue) ? 0 : numValue);
      }, 0);
    };

    return {
      totalkwh: sumField('totalkwh'),
      onpeakkwh: sumField('onpeakkwh'),
      offpeakkwh: sumField('offpeakkwh'),
      totalelectricity: sumField('totalelectricity'),
      water: sumField('water'),
      nightsale: sumField('nightsale'),
    };
  }, [filteredData]);

  // Prepare comparison data: All Months - Year 1 vs Year 2
  const monthComparisonData = useMemo(() => {
    // Helper to safely convert to number
    const toNumber = (value: any): number => {
      if (value === null || value === undefined || value === '') return 0;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? 0 : num;
    };

    // Sum values for a month's data
    const sumMonthData = (monthData: UtilityConsumption[]) => {
      return {
        totalkwh: monthData.reduce((sum, item) => sum + toNumber(item.totalkwh), 0),
        onpeakkwh: monthData.reduce((sum, item) => sum + toNumber(item.onpeakkwh), 0),
        offpeakkwh: monthData.reduce((sum, item) => sum + toNumber(item.offpeakkwh), 0),
        totalelectricity: monthData.reduce((sum, item) => sum + toNumber(item.totalelectricity), 0),
        water: monthData.reduce((sum, item) => sum + toNumber(item.water), 0),
        nightsale: monthData.reduce((sum, item) => sum + toNumber(item.nightsale), 0),
      };
    };

    // Generate comparison data for all 12 months
    // Use Record type to allow dynamic keys
    const comparisonData: Array<Record<string, string | number>> = [];

    // Process each month (1-12)
    for (let monthNum = 1; monthNum <= 12; monthNum++) {
      const monthName = new Date(2000, monthNum - 1).toLocaleString('default', { month: 'long' });
      
      // Get year 1 data for this month
      const year1MonthData = data.filter(
        item => item.year === comparisonYear1 && item.month === monthNum
      );
      
      // Get year 2 data for this month
      const year2MonthData = data.filter(
        item => item.year === comparisonYear2 && item.month === monthNum
      );

      const year1Data = sumMonthData(year1MonthData);
      const year2Data = sumMonthData(year2MonthData);

      comparisonData.push({
        month: monthName,
        monthNum,
        [`${comparisonYear1}_totalkwh`]: year1Data.totalkwh,
        [`${comparisonYear2}_totalkwh`]: year2Data.totalkwh,
        [`${comparisonYear1}_totalelectricity`]: year1Data.totalelectricity,
        [`${comparisonYear2}_totalelectricity`]: year2Data.totalelectricity,
        [`${comparisonYear1}_water`]: year1Data.water,
        [`${comparisonYear2}_water`]: year2Data.water,
        [`${comparisonYear1}_nightsale`]: year1Data.nightsale,
        [`${comparisonYear2}_nightsale`]: year2Data.nightsale,
      });
    }

    return comparisonData;
  }, [data, comparisonYear1, comparisonYear2]);

  // Format number without leading zeros
  const formatNumber = (num: number): string => {
    if (num === 0) return '0';
    // Convert to number to remove any leading zeros, then format
    const numValue = Number(num);
    if (isNaN(numValue)) return '0';
    
    // Format with 2 decimal places, remove trailing zeros
    let formatted = numValue.toFixed(2);
    // Remove trailing zeros and decimal point if not needed
    formatted = formatted.replace(/\.?0+$/, '');
    
    // Split into integer and decimal parts
    const parts = formatted.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    
    // Add thousand separators to integer part
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Combine with decimal if exists
    return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-gray-500">Loading utility consumption data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2 sm:mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
          Utility Consumption
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Track electricity, water, and night sale consumption
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-4 sm:mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableYears.length > 0 ? (
                  availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))
                ) : (
                  <option value={selectedYear}>{selectedYear}</option>
                )}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Month (Optional)
              </label>
              <select
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Months</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                  <option key={month} value={month}>
                    {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-medium text-gray-600">
              Total kWh
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">
              {formatNumber(totals.totalkwh)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-medium text-gray-600">
              Total Electricity Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">
              ${formatNumber(totals.totalelectricity)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base font-medium text-gray-600">
              Total Water
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">
              {formatNumber(totals.water)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {monthlyData.length > 0 ? (
        <>
          {/* Electricity Consumption Chart - Total kWh, On-Peak, Off-Peak */}
          <Card className="mb-4 sm:mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">
                Electricity Consumption (kWh) by Month
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      angle={isMobile ? -45 : -30}
                      textAnchor="end"
                      height={isMobile ? 80 : 60}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Tooltip 
                      formatter={(value: any) => formatNumber(Number(value))}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="totalkwh" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      name="Total kWh"
                      dot={{ r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 5 : 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="onpeakkwh" 
                      stroke="#82ca9d" 
                      strokeWidth={2}
                      name="On-Peak kWh"
                      dot={{ r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 5 : 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="offpeakkwh" 
                      stroke="#ffc658" 
                      strokeWidth={2}
                      name="Off-Peak kWh"
                      dot={{ r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 5 : 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Electricity Cost Chart */}
          <Card className="mb-4 sm:mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">
                Electricity Cost by Month
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      angle={isMobile ? -45 : -30}
                      textAnchor="end"
                      height={isMobile ? 80 : 60}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Tooltip 
                      formatter={(value: any) => `$${formatNumber(Number(value))}`}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                    />
                    <Line 
                      type="monotone"
                      dataKey="totalelectricity"
                      stroke="#8884d8"
                      strokeWidth={2}
                      name="Total Electricity Cost ($)"
                      dot={{ r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 5 : 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Water and Night Sale Chart */}
          <Card className="mb-4 sm:mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">
                Water & Night Sale by Month
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      angle={isMobile ? -45 : -30}
                      textAnchor="end"
                      height={isMobile ? 80 : 60}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Tooltip 
                      formatter={(value: any) => formatNumber(Number(value))}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                    />
                    <Bar 
                      dataKey="water" 
                      fill="#4CAF50" 
                      name="Water"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="nightsale" 
                      fill="#FF9800" 
                      name="Night Sale"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Combined Ratio Chart: Total kWh / Night Sale + Water / Night Sale */}
          <Card className="mb-4 sm:mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">
                Utility Ratios / Night Sale by Month
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      angle={isMobile ? -45 : -30}
                      textAnchor="end"
                      height={isMobile ? 80 : 60}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <Tooltip 
                      formatter={(value: any) => {
                        const numValue = Number(value);
                        return numValue > 0 ? numValue.toFixed(2) : '0';
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="totalkwhPerNightsale" 
                      stroke="#9C27B0" 
                      strokeWidth={2}
                      name="Total kWh / Night Sale"
                      dot={{ r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 5 : 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="waterPerNightsale" 
                      stroke="#00BCD4" 
                      strokeWidth={2}
                      name="Water / Night Sale"
                      dot={{ r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 5 : 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Year-over-Year Comparison Chart: All Months */}
          {monthComparisonData.length > 0 && (
            <Card className="mb-4 sm:mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg">
                  Year-over-Year Comparison: All Months ({comparisonYear1} vs {comparisonYear2})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Year Selection Dropdowns */}
                <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Compare Year 1
                    </label>
                    <select
                      value={comparisonYear1}
                      onChange={(e) => setComparisonYear1(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableYears.length > 0 ? (
                        availableYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))
                      ) : (
                        <option value={comparisonYear1}>{comparisonYear1}</option>
                      )}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Compare Year 2
                    </label>
                    <select
                      value={comparisonYear2}
                      onChange={(e) => setComparisonYear2(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableYears.length > 0 ? (
                        availableYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))
                      ) : (
                        <option value={comparisonYear2}>{comparisonYear2}</option>
                      )}
                    </select>
                  </div>
                </div>
                
                {/* Total kWh Comparison */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Total kWh</h3>
                  <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                          angle={isMobile ? -45 : -30}
                          textAnchor="end"
                          height={isMobile ? 80 : 60}
                        />
                        <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                        <Tooltip 
                          formatter={(value: any) => formatNumber(Number(value))}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                        />
                        <Bar 
                          dataKey={`${comparisonYear1}_totalkwh`}
                          fill="#8884d8" 
                          name={`${comparisonYear1} Total kWh`}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey={`${comparisonYear2}_totalkwh`}
                          fill="#82ca9d" 
                          name={`${comparisonYear2} Total kWh`}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Electricity Cost Comparison */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Electricity Cost</h3>
                  <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                          angle={isMobile ? -45 : -30}
                          textAnchor="end"
                          height={isMobile ? 80 : 60}
                        />
                        <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                        <Tooltip 
                          formatter={(value: any) => `$${formatNumber(Number(value))}`}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                        />
                        <Bar 
                          dataKey={`${comparisonYear1}_totalelectricity`}
                          fill="#8884d8" 
                          name={`${comparisonYear1} Cost ($)`}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey={`${comparisonYear2}_totalelectricity`}
                          fill="#82ca9d" 
                          name={`${comparisonYear2} Cost ($)`}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Water Comparison */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Water</h3>
                  <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                          angle={isMobile ? -45 : -30}
                          textAnchor="end"
                          height={isMobile ? 80 : 60}
                        />
                        <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                        <Tooltip 
                          formatter={(value: any) => formatNumber(Number(value))}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                        />
                        <Bar 
                          dataKey={`${comparisonYear1}_water`}
                          fill="#4CAF50" 
                          name={`${comparisonYear1} Water`}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey={`${comparisonYear2}_water`}
                          fill="#81C784" 
                          name={`${comparisonYear2} Water`}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Night Sale Comparison */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Night Sale</h3>
                  <div className="h-[300px] sm:h-[350px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                          angle={isMobile ? -45 : -30}
                          textAnchor="end"
                          height={isMobile ? 80 : 60}
                        />
                        <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} />
                        <Tooltip 
                          formatter={(value: any) => formatNumber(Number(value))}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: isMobile ? 10 : 12 }}
                        />
                        <Bar 
                          dataKey={`${comparisonYear1}_nightsale`}
                          fill="#FF9800" 
                          name={`${comparisonYear1} Night Sale`}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey={`${comparisonYear2}_nightsale`}
                          fill="#FFB74D" 
                          name={`${comparisonYear2} Night Sale`}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm sm:text-base">No utility consumption data available for the selected period.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UtilityConsumptionPage;
