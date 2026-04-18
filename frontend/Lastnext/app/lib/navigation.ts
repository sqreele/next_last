import {
  Home,
  ShoppingCart,
  LineChart,
  FileText,
  Filter,
  Plus,
  User,
  Calendar,
  Settings,
  Wrench,
  Package,
  Zap,
  Activity,
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
  { name: 'My Jobs', href: '/dashboard/my-jobs', icon: ShoppingCart, shortName: 'Jobs' },
  { name: 'Create Job', href: '/dashboard/create-job', icon: Plus, shortName: 'Create' },
  { name: 'Analytics', href: '/dashboard/chartdashboard', icon: LineChart, shortName: 'Analytics' },
  { name: 'Jobs Report', href: '/dashboard/jobs-report', icon: FileText, shortName: 'Reports' },
  { name: 'Rooms by Topic', href: '/dashboard/rooms/by-topics', icon: Filter, shortName: 'Rooms' },
  { name: 'Topic Mismatch', href: '/dashboard/rooms/topic-mismatch', icon: Filter, shortName: 'Mismatch' },
  { name: 'Profile', href: '/dashboard/profile', icon: User, shortName: 'Profile' },
  { name: 'Roster', href: '/roster', icon: Calendar, shortName: 'Roster' },
];

export const dashboardNavigationItems: AppNavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'My Jobs', href: '/dashboard/my-jobs', icon: ShoppingCart },
  { name: 'Analytics', href: '/dashboard/chartdashboard', icon: LineChart },
  { name: 'Jobs Report', href: '/dashboard/jobs-report', icon: FileText },
  { name: 'Jobs by Topic', href: '/dashboard/jobs/by-topic', icon: Filter },
  { name: 'Rooms by Topic', href: '/dashboard/rooms/by-topics', icon: Filter },
  { name: 'Topic Mismatch', href: '/dashboard/rooms/topic-mismatch', icon: Filter },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
  { name: 'Create Job', href: '/dashboard/create-job', icon: Plus },
  { name: 'Preventive Maintenance', href: '/dashboard/preventive-maintenance', icon: Activity },
  { name: 'Maintenance Tasks', href: '/dashboard/maintenance-tasks', icon: Settings },
  { name: 'Machines', href: '/dashboard/machines', icon: Wrench },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Utility Consumption', href: '/dashboard/utility-consumption', icon: Zap },
  { name: 'Roster', href: '/roster', icon: Calendar },
];
