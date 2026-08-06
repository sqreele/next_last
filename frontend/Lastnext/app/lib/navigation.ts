import {
  mobilePrimaryNavigation,
  navigationItems,
  type NavigationItem,
} from "@/app/design-system/navigation-config";

export type AppNavigationItem = NavigationItem;

/** @deprecated Prefer the grouped navigation config for new shell UI. */
export const primaryNavigationItems = navigationItems;

/** @deprecated Prefer the grouped navigation config for new shell UI. */
export const dashboardNavigationItems = navigationItems;

export { mobilePrimaryNavigation };
