'use client';

import React from 'react';
import { cn } from '@/app/lib/utils/cn';

interface ResponsiveDebugProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export function ResponsiveDebug({ 
  enabled = process.env.NODE_ENV === 'development', 
  position = 'bottom-right' 
}: ResponsiveDebugProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [deviceInfo, setDeviceInfo] = React.useState({
    width: 0,
    height: 0,
    pixelRatio: 1,
    orientation: 'portrait',
    userAgent: '',
    touchSupport: false,
    breakpoint: 'unknown',
  });

  React.useEffect(() => {
    if (!enabled) return;

    const updateDeviceInfo = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      let breakpoint = 'unknown';
      if (width < 475) breakpoint = 'mobile-xs';
      else if (width < 640) breakpoint = 'mobile';
      else if (width < 768) breakpoint = 'mobile-lg';
      else if (width < 1024) breakpoint = 'tablet';
      else if (width < 1280) breakpoint = 'desktop';
      else if (width < 1536) breakpoint = 'desktop-lg';
      else breakpoint = 'desktop-xl';

      setDeviceInfo({
        width,
        height,
        pixelRatio: window.devicePixelRatio || 1,
        orientation: width > height ? 'landscape' : 'portrait',
        userAgent: navigator.userAgent,
        touchSupport: 'ontouchstart' in window,
        breakpoint,
      });
    };

    updateDeviceInfo();
    window.addEventListener('resize', updateDeviceInfo);
    window.addEventListener('orientationchange', updateDeviceInfo);

    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
    };
  }, [enabled]);

  if (!enabled) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  const getBreakpointColor = (bp: string) => {
    switch (bp) {
      case 'mobile-xs':
      case 'mobile':
      case 'mobile-lg':
        return 'bg-red-500';
      case 'tablet':
        return 'bg-yellow-500';
      case 'desktop':
      case 'desktop-lg':
      case 'desktop-xl':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className={cn(
      'fixed z-[9999] transition-all duration-200',
      positionClasses[position]
    )}>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className={cn(
          'w-12 h-12 rounded-full text-white font-bold text-xs shadow-lg hover:shadow-xl transition-all',
          getBreakpointColor(deviceInfo.breakpoint)
        )}
        title="Responsive Debug Info"
      >
        {deviceInfo.width}
      </button>

      {isVisible && (
        <div className="absolute top-14 right-0 bg-black/90 text-white p-4 rounded-lg shadow-xl min-w-80 text-xs font-mono">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Viewport:</span>
              <span>{deviceInfo.width} × {deviceInfo.height}</span>
            </div>
            <div className="flex justify-between">
              <span>Breakpoint:</span>
              <span className={cn(
                'px-2 py-1 rounded text-white font-semibold',
                getBreakpointColor(deviceInfo.breakpoint)
              )}>
                {deviceInfo.breakpoint}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Pixel Ratio:</span>
              <span>{deviceInfo.pixelRatio}x</span>
            </div>
            <div className="flex justify-between">
              <span>Orientation:</span>
              <span>{deviceInfo.orientation}</span>
            </div>
            <div className="flex justify-between">
              <span>Touch Support:</span>
              <span>{deviceInfo.touchSupport ? '✅' : '❌'}</span>
            </div>
            
            {/* Tailwind Breakpoint Indicators */}
            <div className="pt-2 border-t border-gray-600">
              <div className="text-gray-300 mb-2">Active Breakpoints:</div>
              <div className="grid grid-cols-2 gap-1 text-2xs">
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    deviceInfo.width >= 475 ? 'bg-green-400' : 'bg-gray-600'
                  )}></div>
                  <span>xs (475px+)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    deviceInfo.width >= 640 ? 'bg-green-400' : 'bg-gray-600'
                  )}></div>
                  <span>sm (640px+)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    deviceInfo.width >= 768 ? 'bg-green-400' : 'bg-gray-600'
                  )}></div>
                  <span>md (768px+)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    deviceInfo.width >= 1024 ? 'bg-green-400' : 'bg-gray-600'
                  )}></div>
                  <span>lg (1024px+)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    deviceInfo.width >= 1280 ? 'bg-green-400' : 'bg-gray-600'
                  )}></div>
                  <span>xl (1280px+)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    deviceInfo.width >= 1536 ? 'bg-green-400' : 'bg-gray-600'
                  )}></div>
                  <span>2xl (1536px+)</span>
                </div>
              </div>
            </div>

            {/* Device Detection */}
            <div className="pt-2 border-t border-gray-600">
              <div className="text-gray-300 mb-1">Device Type:</div>
              <div className="text-2xs">
                {(() => {
                  const ua = deviceInfo.userAgent.toLowerCase();
                  if (ua.includes('mobile') || ua.includes('android')) return '📱 Mobile';
                  if (ua.includes('tablet') || ua.includes('ipad')) return '📱 Tablet';
                  return '💻 Desktop';
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Hook for responsive breakpoint detection
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = React.useState<string>('unknown');

  React.useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      
      if (width < 475) setBreakpoint('mobile-xs');
      else if (width < 640) setBreakpoint('mobile');
      else if (width < 768) setBreakpoint('mobile-lg');
      else if (width < 1024) setBreakpoint('tablet');
      else if (width < 1280) setBreakpoint('desktop');
      else if (width < 1536) setBreakpoint('desktop-lg');
      else setBreakpoint('desktop-xl');
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);

    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  return breakpoint;
}

// Hook for device detection
export function useDeviceType() {
  const [deviceType, setDeviceType] = React.useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  React.useEffect(() => {
    const updateDeviceType = () => {
      const width = window.innerWidth;
      const ua = navigator.userAgent.toLowerCase();
      
      if (width <= 767 || ua.includes('mobile') || ua.includes('android')) {
        setDeviceType('mobile');
      } else if (width <= 1023 || ua.includes('tablet') || ua.includes('ipad')) {
        setDeviceType('tablet');
      } else {
        setDeviceType('desktop');
      }
    };

    updateDeviceType();
    window.addEventListener('resize', updateDeviceType);

    return () => window.removeEventListener('resize', updateDeviceType);
  }, []);

  return deviceType;
}

