import {
  BotMessageSquare,
  Building2,
  CalendarDays,
  CreditCard,
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
import type { DictKey } from "@/app/lib/i18n/dictionary";

export type NavigationItem = {
  name: string;
  labelKey: DictKey;
  shortName?: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  match?: readonly string[];
};

export type NavigationGroup = {
  label: string;
  labelKey: DictKey;
  items: readonly NavigationItem[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Main",
    labelKey: "nav.main",
    items: [
      {
        name: "Overview",
        labelKey: "nav.dashboard",
        shortName: "Home",
        href: "/dashboard",
        icon: Home,
        exact: true,
      },
      {
        name: "Maintenance Jobs",
        labelKey: "nav.jobs",
        shortName: "Jobs",
        href: "/dashboard/jobs",
        icon: ClipboardList,
      },
      {
        name: "My Jobs",
        labelKey: "nav.myJobs",
        shortName: "My Jobs",
        href: "/dashboard/my-jobs",
        match: ["/dashboard/myJobs"],
        icon: ClipboardList,
      },
      { name: "Create Job", labelKey: "nav.createJob", shortName: "Create", href: "/dashboard/create-job", icon: Plus },
      { name: "Preventive Maintenance", labelKey: "nav.preventiveMaintenance", shortName: "PM", href: "/dashboard/preventive-maintenance", icon: Wrench },
      { name: "PM Schedule", labelKey: "nav.pmSchedule", shortName: "Schedule", href: "/dashboard/preventive-maintenance/schedule", icon: CalendarDays },
    ],
  },
  {
    label: "Property",
    labelKey: "nav.property",
    items: [
      { name: "Rooms", labelKey: "nav.rooms", href: "/dashboard/rooms", icon: Building2 },
      { name: "Machines", labelKey: "nav.machines", href: "/dashboard/machines", icon: Wrench },
      { name: "Areas", labelKey: "nav.areas", href: "/dashboard/areas", icon: MapPin },
      { name: "Inventory", labelKey: "nav.inventory", href: "/dashboard/inventory", icon: Package },
      { name: "Utilities", labelKey: "nav.utilities", href: "/dashboard/utility-consumption", icon: Zap },
    ],
  },
  {
    label: "Management",
    labelKey: "nav.management",
    items: [
      { name: "AI Assistant", labelKey: "nav.aiAssistant", href: "/ai-chat", icon: BotMessageSquare },
      { name: "Reports", labelKey: "nav.reports", href: "/dashboard/jobs-report", icon: FileText },
      { name: "Settings", labelKey: "nav.settings", shortName: "More", href: "/dashboard/settings/users", icon: Settings },
      { name: "Billing", labelKey: "nav.billing", href: "/dashboard/settings/billing", icon: CreditCard },
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
