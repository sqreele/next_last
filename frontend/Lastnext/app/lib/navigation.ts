import {
  Home,
  ShoppingCart,
  LineChart,
  FileText,
  Filter,
  Plus,
  User,
  Calendar,
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
  { name: 'My Jobs', href: '/dashboard/myJobs', icon: ShoppingCart, shortName: 'Jobs' },
  { name: 'Create Job', href: '/dashboard/createJob', icon: Plus, shortName: 'Create' },
  { name: 'Analytics', href: '/dashboard/chartdashboard', icon: LineChart, shortName: 'Analytics' },
  { name: 'Jobs Report', href: '/dashboard/jobs-report', icon: FileText, shortName: 'Reports' },
  { name: 'Rooms by Topic', href: '/dashboard/rooms/by-topics', icon: Filter, shortName: 'Rooms' },
  { name: 'Profile', href: '/dashboard/profile', icon: User, shortName: 'Profile' },
  { name: 'Roster', href: '/roster', icon: Calendar, shortName: 'Roster' },
];
