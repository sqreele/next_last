'use client';

import React from 'react';
import { Button } from './button';
import { 
  Home, 
  ShoppingCart, 
  LineChart, 
  FileText, 
  Search,
  Bell
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavProps {
  className?: string;
}

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'My Jobs', href: '/dashboard/myJobs', icon: ShoppingCart },
  { name: 'Analytics', href: '/dashboard/chartdashboard', icon: LineChart },
  { name: 'orthe', href: '/dashboard/jobs-report', icon: FileText },
];

export function MobileNav({ className }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg md:hidden ${className || ''}`}>
      <div className="flex items-center justify-around px-2 py-2">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant="ghost"
                size="sm"
                className={`flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-xl transition-all hover:bg-gray-50 hover:text-blue-600 ${
                  isActive 
                    ? "text-blue-600 bg-blue-50" 
                    : "text-gray-600"
                }`}
              >
                <Icon className={`w-5 h-5 ${
                  isActive ? "text-blue-600" : "text-gray-500"
                }`} />
                <span className={`text-xs font-medium ${
                  isActive ? "text-blue-600" : "text-gray-600"
                }`}>
                  {item.name}
                </span>
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function MobileTopBar({ className }: MobileNavProps) {
  return (
    <div className={`sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm md:hidden ${className || ''}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="p-2">
            <Search className="w-5 h-5 text-gray-600" />
          </Button>
        </div>
        
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="p-2 relative">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </Button>
        </div>
      </div>
    </div>
  );
}
