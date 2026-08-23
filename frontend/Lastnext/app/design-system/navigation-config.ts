import {
  BotMessageSquare,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  MapPin,
  Package,
  Plus,
  Settings,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  name: string;
  shortName?: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  match?: readonly string[];
};

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Main",
    items: [
      {
        name: "Overview",
        shortName: "Home",
        href: "/dashboard",
        icon: Home,
        exact: true,
      },
      {
        name: "Maintenance Jobs",
        shortName: "Jobs",
        href: "/dashboard/jobs",
        icon: ClipboardList,
      },
      {
        name: "My Jobs",
        shortName: "My Jobs",
        href: "/dashboard/my-jobs",
        match: ["/dashboard/myJobs"],
        icon: ClipboardList,
      },
      { name: "Create Job", shortName: "Create", href: "/dashboard/create-job", icon: Plus },
      { name: "Preventive Maintenance", shortName: "PM", href: "/dashboard/preventive-maintenance", icon: Wrench },
      { name: "PM Schedule", shortName: "Schedule", href: "/dashboard/preventive-maintenance/schedule", icon: CalendarDays },
    ],
  },
  {
    label: "Property",
    items: [
      { name: "Rooms", href: "/dashboard/rooms", icon: Building2 },
      { name: "Machines", href: "/dashboard/machines", icon: Wrench },
      { name: "Areas", href: "/dashboard/areas", icon: MapPin },
      { name: "Inventory", href: "/dashboard/inventory", icon: Package },
      { name: "Utilities", href: "/dashboard/utility-consumption", icon: Zap },
    ],
  },
  {
    label: "Management",
    items: [
      { name: "AI Assistant", href: "/ai-chat", icon: BotMessageSquare },
      { name: "Reports", href: "/dashboard/jobs-report", icon: FileText },
      { name: "Settings", shortName: "More", href: "/dashboard/profile", icon: Settings },
    ],
  },
];

export const navigationItems: readonly NavigationItem[] = navigationGroups.flatMap(
  (group) => group.items,
);

export const mobilePrimaryNavigation: readonly NavigationItem[] = [
  navigationGroups[0].items[0],
  navigationGroups[0].items[1],
  navigationGroups[0].items[3],
  navigationGroups[0].items[2],
];

export const mobileSecondaryNavigation = navigationGroups
  .flatMap((group) => group.items)
  .filter((item) => !mobilePrimaryNavigation.some((primary) => primary.href === item.href));
