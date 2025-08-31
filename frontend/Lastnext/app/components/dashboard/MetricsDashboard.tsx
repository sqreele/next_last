import React, { useState } from 'react';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  BarChart3,
  Clock,
  DollarSign,
  Users,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  MetricCard, 
  JobsMetricCard, 
  RevenueMetricCard, 
  PercentageMetricCard 
} from '../ui/MetricCard';
import { useMetrics, useJobsMetrics, useRevenueMetrics, TimePeriod } from '../../lib/hooks/useMetrics';
import { CalendarUtils } from '../../lib/utils/calendarUtils';

export function MetricsDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('week');
  
  const { metrics, loading, error, timeRange, summary, refreshMetrics } = useMetrics(selectedPeriod);
  const { metrics: jobsMetrics } = useJobsMetrics(selectedPeriod);
  const { metrics: revenueMetrics } = useRevenueMetrics(selectedPeriod);

  const periodOptions: { value: TimePeriod; label: string; icon: React.ReactNode }[] = [
    { value: 'today', label: 'Today', icon: <Clock className="w-4 h-4" /> },
    { value: 'week', label: 'This Week', icon: <Calendar className="w-4 h-4" /> },
    { value: 'month', label: 'This Month', icon: <BarChart3 className="w-4 h-4" /> },
    { value: 'quarter', label: 'This Quarter', icon: <TrendingUp className="w-4 h-4" /> },
    { value: 'year', label: 'This Year', icon: <BarChart3 className="w-4 h-4" /> }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="text-lg font-medium text-gray-600">Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
              <h2 className="text-xl font-semibold text-gray-900">Error Loading Metrics</h2>
              <p className="text-gray-600">{error}</p>
              <Button onClick={refreshMetrics}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!metrics || !timeRange) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No metrics data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with period selector and refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Metrics</h1>
          <p className="text-gray-600">
            {timeRange.currentLabel}: {timeRange.current} • 
            {timeRange.previousLabel}: {timeRange.previous}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshMetrics}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {periodOptions.map((option) => (
          <Button
            key={option.value}
            variant={selectedPeriod === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedPeriod(option.value)}
            className="flex items-center space-x-2"
          >
            {option.icon}
            <span>{option.label}</span>
          </Button>
        ))}
      </div>

      {/* Overall summary */}
      {summary && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">Overall Performance</h3>
                <p className="text-sm text-blue-700">
                  Average change across all metrics
                </p>
              </div>
              <Badge 
                variant={summary.overallTrend === 'positive' ? 'default' : 'destructive'}
                className="text-lg px-4 py-2"
              >
                {summary.changeLabel}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span>Jobs Overview</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <JobsMetricCard
            title="Total Jobs"
            value={metrics.totalJobs.current}
            change={{
              value: Math.round(metrics.totalJobs.percentageChange),
              period: "last week",
              isPositive: metrics.totalJobs.isPositive
            }}
            icon={<BarChart3 className="w-5 h-5" />}
            description="Total jobs in the system"
          />
          
          <JobsMetricCard
            title="Completed Jobs"
            value={metrics.completedJobs.current}
            change={{
              value: Math.round(metrics.completedJobs.percentageChange),
              period: "last week",
              isPositive: metrics.completedJobs.isPositive
            }}
            icon={<CheckCircle className="w-5 h-5" />}
            description="Successfully completed jobs"
          />
          
          <JobsMetricCard
            title="Pending Jobs"
            value={metrics.pendingJobs.current}
            change={{
              value: Math.round(metrics.pendingJobs.percentageChange),
              period: "last week",
              isPositive: metrics.pendingJobs.isPositive
            }}
            icon={<Clock className="w-5 h-5" />}
            description="Jobs awaiting completion"
          />
          
          <PercentageMetricCard
            title="Efficiency Rate"
            value={Math.round(metrics.efficiency.current)}
            change={{
              value: Math.round(metrics.efficiency.percentageChange),
              period: "last week",
              isPositive: metrics.efficiency.isPositive
            }}
            icon={<TrendingUp className="w-5 h-5" />}
            description="Overall system efficiency"
          />
        </div>
      </div>

      {/* Revenue & Performance Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          <span>Revenue & Performance</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <RevenueMetricCard
            title="Total Revenue"
            value={metrics.revenue.current}
            change={{
              value: Math.round(metrics.revenue.percentageChange),
              period: "last week",
              isPositive: metrics.revenue.isPositive
            }}
            icon={<DollarSign className="w-5 h-5" />}
            description="Total revenue generated"
          />
          
          <PercentageMetricCard
            title="Customer Satisfaction"
            value={Math.round(metrics.customerSatisfaction.current)}
            change={{
              value: Math.round(metrics.customerSatisfaction.percentageChange),
              period: "last week",
              isPositive: metrics.customerSatisfaction.isPositive
            }}
            icon={<Users className="w-5 h-5" />}
            description="Customer satisfaction score"
          />
          
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>Time Period Info</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Current Period:</span>
                  <span className="font-medium">{timeRange.current}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Previous Period:</span>
                  <span className="font-medium">{timeRange.previous}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Business Days:</span>
                  <span className="font-medium">
                    {CalendarUtils.getBusinessDaysInRange({
                      start: new Date(timeRange.current.split(' - ')[0]),
                      end: new Date(timeRange.current.split(' - ')[1] || timeRange.current)
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Calendar utilities demo */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Calendar Utilities Demo</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Current Date Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Year:</span>
                <span>{CalendarUtils.getCurrentYear()}</span>
              </div>
              <div className="flex justify-between">
                <span>Month:</span>
                <span>{CalendarUtils.getCurrentMonth() + 1}</span>
              </div>
              <div className="flex justify-between">
                <span>Week:</span>
                <span>{CalendarUtils.getCurrentWeek()}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">This Week Range</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Start:</span>
                <span>{CalendarUtils.formatDate(CalendarUtils.getThisWeekRange().start, 'short')}</span>
              </div>
              <div className="flex justify-between">
                <span>End:</span>
                <span>{CalendarUtils.formatDate(CalendarUtils.getThisWeekRange().end, 'short')}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Last Week Range</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Start:</span>
                <span>{CalendarUtils.formatDate(CalendarUtils.getLastWeekRange().start, 'short')}</span>
              </div>
              <div className="flex justify-between">
                <span>End:</span>
                <span>{CalendarUtils.formatDate(CalendarUtils.getLastWeekRange().end, 'short')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
