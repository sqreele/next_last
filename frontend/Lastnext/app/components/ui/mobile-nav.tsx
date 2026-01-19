'use client';

import React from 'react';
import { Button } from './button';
import { 
  Home, 
  ShoppingCart, 
  LineChart, 
  FileText, 
  Search,
  Bell,
  Filter,
  Plus,
  User,
  Calendar
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavProps {
  className?: string;
}

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, shortName: 'Home' },
  { name: 'My Jobs', href: '/dashboard/myJobs', icon: ShoppingCart, shortName: 'Jobs' },
  { name: 'Create Job', href: '/dashboard/createJob', icon: Plus, shortName: 'Create' },
  { name: 'Analytics', href: '/dashboard/chartdashboard', icon: LineChart, shortName: 'Analytics' },
  { name: 'Profile', href: '/dashboard/profile', icon: User, shortName: 'Profile' },
  { name: 'Roster', href: '/roster', icon: Calendar, shortName: 'Roster' },
];

export function MobileNav({ className }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav 
      className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden safe-area-inset ${className || ''}`}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around px-2 py-2">
        {navigationItems.map((item, index) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className="flex-1"
              tabIndex={0}
            >
              <div
                className={`
                  flex flex-col items-center gap-1 py-2 px-1
                  rounded-lg transition-all duration-200 ease-in-out
                  touch-manipulation relative
                  ${isActive 
                    ? "text-gray-900" 
                    : "text-gray-600 hover:text-gray-900"
                  }
                `}
                aria-label={`Navigate to ${item.name}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Instagram-style active indicator */}
                {isActive && (
                  <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-6 h-0.5 bg-gray-900 rounded-full" />
                )}
                <Icon 
                  className={`w-6 h-6 transition-all duration-200 ${
                    isActive ? "text-gray-900" : "text-gray-600"
                  }`} 
                  aria-hidden="true"
                />
                <span className={`text-xs font-medium ${
                  isActive ? "text-gray-900" : "text-gray-600"
                }`}>
                  {item.shortName}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      
      {/* Safe area spacer */}
      <div className="h-safe-bottom" />
    </nav>
  );
}

export function MobileTopBar({ className }: MobileNavProps) {
  const pathname = usePathname();
  
  // Get page title based on current path
  const getPageTitle = () => {
    if (pathname.includes('/myJobs')) return 'My Jobs';
    if (pathname.includes('/chartdashboard')) return 'Analytics';
    if (pathname.includes('/jobs-report')) return 'Jobs Report';
    if (pathname.includes('/createJob')) return 'Create Job';
    if (pathname.includes('/profile')) return 'Profile';
    if (pathname.includes('/preventive-maintenance')) return 'Maintenance';
    return 'Dashboard';
  };

  return (
    <header 
      className={`sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm tablet:hidden safe-area-inset ${className || ''}`}
      role="banner"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 min-h-touch-target min-w-touch-target touch-manipulation hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-gray-600" aria-hidden="true" />
          </Button>
        </div>
        
        <h1 className="text-lg font-semibold text-gray-900 text-balance truncate max-w-48">
          {getPageTitle()}
        </h1>
        
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 relative min-h-touch-target min-w-touch-target touch-manipulation hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-gray-600" aria-hidden="true" />
            <span 
              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full animate-pulse"
              aria-label="You have new notifications"
            />
          </Button>
        </div>
      </div>
      
      {/* Safe area spacer */}
      <div className="h-safe-top" />
    </header>
  );
}
