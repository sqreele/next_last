import {
  Home,
  ClipboardList,
  FileText,
  Plus,
  Users,
  Settings,
  Building2,
  MapPin,
  Package,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type AppNavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  shortName?: string;
};

export const primaryNavigationItems: AppNavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, shortName: 'Home' },
  { name: 'Maintenance Jobs', href: '/dashboard/my-jobs', icon: ClipboardList, shortName: 'Jobs' },
  { name: 'Create Job', href: '/dashboard/create-job', icon: Plus, shortName: 'Create' },
  { name: 'Rooms', href: '/dashboard/rooms/by-topics', icon: Building2, shortName: 'Rooms' },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package, shortName: 'Stock' },
  { name: 'Electricity', href: '/dashboard/utility-consumption', icon: Zap, shortName: 'Power' },
  { name: 'Reports', href: '/dashboard/jobs-report', icon: FileText, shortName: 'Reports' },
];

export const dashboardNavigationItems: AppNavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Maintenance Jobs', href: '/dashboard/my-jobs', icon: ClipboardList },
  { name: 'Create Job', href: '/dashboard/create-job', icon: Plus },
  { name: 'Rooms', href: '/dashboard/rooms/by-topics', icon: Building2 },
  { name: 'Areas', href: '/dashboard/areas', icon: MapPin },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Electricity', href: '/dashboard/utility-consumption', icon: Zap },
  { name: 'Reports', href: '/dashboard/jobs-report', icon: FileText },
  { name: 'Users', href: '/roster', icon: Users },
  { name: 'Settings', href: '/dashboard/profile', icon: Settings },
];
