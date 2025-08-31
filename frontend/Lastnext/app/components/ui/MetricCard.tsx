import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import { cn } from '@/app/lib/utils/cn';

export interface MetricData {
  title: string;
  value: string | number;
  change?: {
    value: number;
    period: string;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  format?: 'number' | 'currency' | 'percentage' | 'text';
  precision?: number;
}

interface MetricCardProps {
  data: MetricData;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function MetricCard({ 
  data, 
  className, 
  variant = 'default',
  size = 'md'
}: MetricCardProps) {
  const formatValue = (value: string | number, format: string, precision: number = 0): string => {
    if (typeof value === 'string') return value;
    
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        }).format(value);
      case 'percentage':
        return `${value.toFixed(precision)}%`;
      case 'number':
        return new Intl.NumberFormat('en-US', {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        }).format(value);
      default:
        return value.toString();
    }
  };

  const getChangeIcon = (change?: MetricData['change']) => {
    if (!change) return null;
    
    if (change.isPositive) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
  };

  const getChangeColor = (change?: MetricData['change']) => {
    if (!change) return 'text-gray-500';
    return change.isPositive ? 'text-green-600' : 'text-red-600';
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'danger':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'p-4';
      case 'lg':
        return 'p-6';
      default:
        return 'p-5';
    }
  };

  return (
    <Card className={cn(
      'transition-all duration-200 hover:shadow-md',
      getVariantStyles(),
      className
    )}>
      <CardHeader className={cn('pb-3', getSizeStyles())}>
        <div className="flex items-center justify-between">
          <CardTitle className={cn(
            'text-sm font-medium text-gray-600',
            size === 'lg' && 'text-base',
            size === 'sm' && 'text-xs'
          )}>
            {data.title}
          </CardTitle>
          {data.icon && (
            <div className="text-gray-400">
              {data.icon}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className={cn('pt-0', getSizeStyles())}>
        <div className="space-y-2">
          {/* Main Value */}
          <div className="flex items-baseline space-x-2">
            <span className={cn(
              'font-bold text-gray-900',
              size === 'lg' && 'text-3xl',
              size === 'md' && 'text-2xl',
              size === 'sm' && 'text-xl'
            )}>
              {formatValue(data.value, data.format || 'text', data.precision)}
            </span>
            
            {/* Change Badge */}
            {data.change && (
              <Badge 
                variant={data.change.isPositive ? 'default' : 'destructive'}
                className={cn(
                  'flex items-center space-x-1',
                  size === 'sm' && 'text-xs px-2 py-1',
                  size === 'lg' && 'text-sm px-3 py-1'
                )}
              >
                {getChangeIcon(data.change)}
                <span className={cn(
                  'font-medium',
                  getChangeColor(data.change)
                )}>
                  {data.change.isPositive ? '+' : ''}{data.change.value}%
                </span>
              </Badge>
            )}
          </div>
          
          {/* Description and Period */}
          <div className="flex items-center justify-between">
            {data.description && (
              <p className={cn(
                'text-gray-600',
                size === 'lg' && 'text-sm',
                size === 'md' && 'text-sm',
                size === 'sm' && 'text-xs'
              )}>
                {data.description}
              </p>
            )}
            
            {data.change && (
              <span className={cn(
                'text-gray-500',
                size === 'lg' && 'text-sm',
                size === 'md' && 'text-xs',
                size === 'sm' && 'text-xs'
              )}>
                vs {data.change.period}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Specialized metric cards for common use cases
export function JobsMetricCard({ 
  title, 
  value, 
  change, 
  icon, 
  description,
  className 
}: {
  title: string;
  value: number;
  change?: { value: number; period: string; isPositive: boolean };
  icon?: React.ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <MetricCard
      data={{
        title,
        value,
        change,
        icon,
        description,
        format: 'number',
        precision: 0
      }}
      className={className}
      variant={change?.isPositive ? 'success' : 'default'}
    />
  );
}

export function RevenueMetricCard({ 
  title, 
  value, 
  change, 
  icon, 
  description,
  className 
}: {
  title: string;
  value: number;
  change?: { value: number; period: string; isPositive: boolean };
  icon?: React.ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <MetricCard
      data={{
        title,
        value,
        change,
        icon,
        description,
        format: 'currency',
        precision: 0
      }}
      className={className}
      variant={change?.isPositive ? 'success' : 'default'}
    />
  );
}

export function PercentageMetricCard({ 
  title, 
  value, 
  change, 
  icon, 
  description,
  className 
}: {
  title: string;
  value: number;
  change?: { value: number; period: string; isPositive: boolean };
  icon?: React.ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <MetricCard
      data={{
        title,
        value,
        change,
        icon,
        description,
        format: 'percentage',
        precision: 1
      }}
      className={className}
      variant={change?.isPositive ? 'success' : 'default'}
    />
  );
}
