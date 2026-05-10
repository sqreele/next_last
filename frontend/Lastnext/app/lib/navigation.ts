import {
  Home,
  ClipboardList,
  FileText,
  Plus,
  Users,
  Settings,
  Building2,
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
  { name: 'Reports', href: '/dashboard/jobs-report', icon: FileText, shortName: 'Reports' },
];

export const dashboardNavigationItems: AppNavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Maintenance Jobs', href: '/dashboard/my-jobs', icon: ClipboardList },
  { name: 'Create Job', href: '/dashboard/create-job', icon: Plus },
  { name: 'Rooms', href: '/dashboard/rooms/by-topics', icon: Building2 },
  { name: 'Reports', href: '/dashboard/jobs-report', icon: FileText },
  { name: 'Users', href: '/roster', icon: Users },
  { name: 'Settings', href: '/dashboard/profile', icon: Settings },
];
