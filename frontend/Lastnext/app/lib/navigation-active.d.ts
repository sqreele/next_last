export type ActiveNavigationItem = {
  href: string;
  exact?: boolean;
  match?: readonly string[];
};

export function getActiveNavigationItem<T extends ActiveNavigationItem>(
  pathname: string,
  items: readonly T[],
): T | undefined;

export function isNavigationItemActive<T extends ActiveNavigationItem>(
  pathname: string,
  item: T,
  items: readonly T[],
): boolean;
