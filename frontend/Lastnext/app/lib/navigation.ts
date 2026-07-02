import {
  Home,
  ClipboardList,
  FileText,
  Plus,
  Settings,
  Building2,
  MapPin,
  Package,
  Zap,
  Wrench,
  BotMessageSquare,
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
  { name: 'Machines', href: '/dashboard/machines', icon: Wrench, shortName: 'Equip' },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package, shortName: 'Stock' },
  { name: 'Electricity', href: '/dashboard/utility-consumption', icon: Zap, shortName: 'Power' },
  { name: 'AI Chat', href: '/ai-chat', icon: BotMessageSquare, shortName: 'AI' },
  { name: 'Reports', href: '/dashboard/jobs-report', icon: FileText, shortName: 'Reports' },
];

export const dashboardNavigationItems: AppNavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Maintenance Jobs', href: '/dashboard/my-jobs', icon: ClipboardList },
  { name: 'Create Job', href: '/dashboard/create-job', icon: Plus },
  { name: 'Rooms', href: '/dashboard/rooms/by-topics', icon: Building2 },
  { name: 'Machines', href: '/dashboard/machines', icon: Wrench },
  { name: 'Areas', href: '/dashboard/areas', icon: MapPin },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Electricity', href: '/dashboard/utility-consumption', icon: Zap },
  { name: 'AI Chat', href: '/ai-chat', icon: BotMessageSquare },
  { name: 'Reports', href: '/dashboard/jobs-report', icon: FileText },
  { name: 'Settings', href: '/dashboard/profile', icon: Settings },
];
