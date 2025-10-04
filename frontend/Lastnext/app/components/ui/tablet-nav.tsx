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
  Menu,
  X,
  Package2
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from './sheet';

interface TabletNavProps {
  className?: string;
}

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'My Jobs', href: '/dashboard/myJobs', icon: ShoppingCart },
  { name: 'Analytics', href: '/dashboard/chartdashboard', icon: LineChart },
  { name: 'Jobs Report', href: '/dashboard/jobs-report', icon: FileText },
  { name: 'Rooms by Topic', href: '/dashboard/rooms/by-topics', icon: Filter },
  { name: 'Create Job', href: '/dashboard/createJob', icon: Plus },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
];

export function TabletNav({ className }: TabletNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <nav className={`tablet:flex desktop:hidden items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm ${className || ''}`}>
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Package2 className="h-8 w-8 text-blue-600" />
          <span className="font-bold text-xl text-gray-800">PCMS.live</span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {/* Quick Actions */}
        <div className="hidden tablet:flex items-center gap-2">
          <Button variant="ghost" size="sm" className="p-2">
            <Search className="w-5 h-5 text-gray-600" />
          </Button>
          <Button variant="ghost" size="sm" className="p-2 relative">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </Button>
        </div>

        {/* Navigation Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="tablet:flex desktop:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80">
            <SheetTitle className="text-lg font-semibold mb-6">Navigation</SheetTitle>
            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all
                      ${isActive
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

export function TabletGridLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tablet:grid tablet:grid-cols-12 tablet:gap-6 desktop:block">
      {children}
    </div>
  );
}

export function TabletCard({ 
  children, 
  className = "",
  colSpan = "tablet:col-span-6"
}: { 
  children: React.ReactNode;
  className?: string;
  colSpan?: string;
}) {
  return (
    <div className={`
      bg-white rounded-xl shadow-sm border border-gray-200 p-6
      hover:shadow-md transition-shadow duration-200
      ${colSpan} ${className}
    `}>
      {children}
    </div>
  );
}

