import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getThisWeekRange, 
  getLastWeekRange, 
  getThisMonthRange, 
  getLastMonthRange,
  getTodayRange,
  getYesterdayRange,
  formatDateRange,
  CalendarUtils
} from '../utils/calendarUtils';

export interface MetricValue {
  current: number;
  previous: number;
  change: number;
  percentageChange: number;
  isPositive: boolean;
  changeLabel: string;
}

export interface MetricsData {
  totalJobs: MetricValue;
  completedJobs: MetricValue;
  pendingJobs: MetricValue;
  revenue: MetricValue;
  efficiency: MetricValue;
  customerSatisfaction: MetricValue;
}

export interface TimeRange {
  current: { start: Date; end: Date };
  previous: { start: Date; end: Date };
  currentLabel: string;
  previousLabel: string;
}

export type TimePeriod = 'today' | 'week' | 'month' | 'quarter' | 'year';

export function useMetrics(period: TimePeriod = 'week') {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);

  // Get time ranges based on period
  const getTimeRanges = useCallback((period: TimePeriod): TimeRange => {
    switch (period) {
      case 'today':
        return {
          current: getTodayRange(),
          previous: getYesterdayRange(),
          currentLabel: 'Today',
          previousLabel: 'Yesterday'
        };
      case 'week':
        return {
          current: getThisWeekRange(),
          previous: getLastWeekRange(),
          currentLabel: 'This Week',
          previousLabel: 'Last Week'
        };
      case 'month':
        return {
          current: getThisMonthRange(),
          previous: getLastMonthRange(),
          currentLabel: 'This Month',
          previousLabel: 'Last Month'
        };
      case 'quarter':
        return {
          current: CalendarUtils.getThisQuarterRange(),
          previous: CalendarUtils.getLastQuarterRange(),
          currentLabel: 'This Quarter',
          previousLabel: 'Last Quarter'
        };
      case 'year':
        return {
          current: CalendarUtils.getThisYearRange(),
          previous: CalendarUtils.getLastYearRange(),
          currentLabel: 'This Year',
          previousLabel: 'Last Year'
        };
      default:
        return {
          current: getThisWeekRange(),
          previous: getLastWeekRange(),
          currentLabel: 'This Week',
          previousLabel: 'Last Week'
        };
    }
  }, []);

  // Calculate metric changes
  const calculateMetricChange = useCallback((current: number, previous: number): MetricValue => {
    const change = current - previous;
    const percentageChange = previous === 0 ? (current > 0 ? 100 : 0) : (change / previous) * 100;
    const isPositive = change >= 0;
    
    return {
      current,
      previous,
      change: Math.abs(change),
      percentageChange: Math.abs(percentageChange),
      isPositive,
      changeLabel: `${isPositive ? '+' : '-'}${Math.round(percentageChange)}%`
    };
  }, []);

  // Mock data generator - replace with real API calls
  const generateMockMetrics = useCallback((currentRange: any, previousRange: any): MetricsData => {
    // Generate realistic mock data
    const baseJobs = Math.floor(Math.random() * 50) + 20; // 20-70 jobs
    const baseRevenue = Math.floor(Math.random() * 5000) + 2000; // $2k-$7k
    const baseEfficiency = Math.floor(Math.random() * 20) + 80; // 80-100%
    const baseSatisfaction = Math.floor(Math.random() * 10) + 90; // 90-100%

    // Add some variation based on time period
    const timeMultiplier = period === 'today' ? 0.3 : period === 'week' ? 1 : period === 'month' ? 4 : 12;
    
    const currentJobs = Math.floor(baseJobs * timeMultiplier);
    const previousJobs = Math.floor(currentJobs * (0.8 + Math.random() * 0.4)); // ±20% variation
    
    const currentRevenue = Math.floor(baseRevenue * timeMultiplier);
    const previousRevenue = Math.floor(currentRevenue * (0.8 + Math.random() * 0.4));
    
    const currentEfficiency = Math.min(100, baseEfficiency + (Math.random() - 0.5) * 10);
    const previousEfficiency = Math.min(100, currentEfficiency + (Math.random() - 0.5) * 10);
    
    const currentSatisfaction = Math.min(100, baseSatisfaction + (Math.random() - 0.5) * 5);
    const previousSatisfaction = Math.min(100, currentSatisfaction + (Math.random() - 0.5) * 5);

    return {
      totalJobs: calculateMetricChange(currentJobs, previousJobs),
      completedJobs: calculateMetricChange(
        Math.floor(currentJobs * 0.7), 
        Math.floor(previousJobs * 0.7)
      ),
      pendingJobs: calculateMetricChange(
        Math.floor(currentJobs * 0.3), 
        Math.floor(previousJobs * 0.3)
      ),
      revenue: calculateMetricChange(currentRevenue, previousRevenue),
      efficiency: calculateMetricChange(currentEfficiency, previousEfficiency),
      customerSatisfaction: calculateMetricChange(currentSatisfaction, previousSatisfaction)
    };
  }, [period, calculateMetricChange]);

  // Fetch metrics data
  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const ranges = getTimeRanges(period);
      setTimeRange(ranges);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Generate mock data - replace with real API call
      const mockMetrics = generateMockMetrics(ranges.current, ranges.previous);
      setMetrics(mockMetrics);

    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, [period, getTimeRanges, generateMockMetrics]);

  // Refresh metrics
  const refreshMetrics = useCallback(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    fetchMetrics();
    
    const interval = setInterval(fetchMetrics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Memoized computed values
  const summary = useMemo(() => {
    if (!metrics) return null;

    const totalChange = Object.values(metrics).reduce((sum, metric) => {
      return sum + (metric.isPositive ? metric.percentageChange : -metric.percentageChange);
    }, 0) / Object.keys(metrics).length;

    return {
      overallTrend: totalChange >= 0 ? 'positive' : 'negative',
      averageChange: Math.abs(totalChange),
      changeLabel: `${totalChange >= 0 ? '+' : '-'}${Math.round(Math.abs(totalChange))}%`
    };
  }, [metrics]);

  // Format time range for display
  const formattedTimeRange = useMemo(() => {
    if (!timeRange) return null;

    return {
      current: formatDateRange(timeRange.current, 'short'),
      previous: formatDateRange(timeRange.previous, 'short'),
      currentLabel: timeRange.currentLabel,
      previousLabel: timeRange.previousLabel
    };
  }, [timeRange]);

  return {
    metrics,
    loading,
    error,
    timeRange: formattedTimeRange,
    summary,
    refreshMetrics,
    period
  };
}

// Specialized hook for jobs metrics
export function useJobsMetrics(period: TimePeriod = 'week') {
  const { metrics, loading, error, timeRange, refreshMetrics } = useMetrics(period);

  const jobsMetrics = useMemo(() => {
    if (!metrics) return null;

    return {
      total: metrics.totalJobs,
      completed: metrics.completedJobs,
      pending: metrics.pendingJobs,
      efficiency: metrics.efficiency
    };
  }, [metrics]);

  return {
    metrics: jobsMetrics,
    loading,
    error,
    timeRange,
    refreshMetrics
  };
}

// Specialized hook for revenue metrics
export function useRevenueMetrics(period: TimePeriod = 'week') {
  const { metrics, loading, error, timeRange, refreshMetrics } = useMetrics(period);

  const revenueMetrics = useMemo(() => {
    if (!metrics) return null;

    return {
      total: metrics.revenue,
      efficiency: metrics.efficiency,
      customerSatisfaction: metrics.customerSatisfaction
    };
  }, [metrics]);

  return {
    metrics: revenueMetrics,
    loading,
    error,
    timeRange,
    refreshMetrics
  };
}
