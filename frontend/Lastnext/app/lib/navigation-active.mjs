function normalizePathname(pathname) {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function matchLength(pathname, item) {
  const currentPath = normalizePathname(pathname);
  const routes = [item.href, ...(item.match ?? [])];

  return routes.reduce((longest, route, index) => {
    const candidate = normalizePathname(route);
    const exact = index === 0 && item.exact === true;
    const matches =
      currentPath === candidate ||
      (!exact && currentPath.startsWith(`${candidate}/`));

    return matches ? Math.max(longest, candidate.length) : longest;
  }, -1);
}

/**
 * Returns the single navigation item that owns the pathname. More-specific
 * routes win, so a child such as the PM schedule does not also activate its
 * top-level PM sibling.
 */
export function getActiveNavigationItem(pathname, items) {
  let activeItem;
  let activeMatchLength = -1;

  for (const item of items) {
    const itemMatchLength = matchLength(pathname, item);
    if (itemMatchLength > activeMatchLength) {
      activeItem = itemMatchLength >= 0 ? item : activeItem;
      activeMatchLength = itemMatchLength;
    }
  }

  return activeItem;
}

export function isNavigationItemActive(pathname, item, items) {
  return getActiveNavigationItem(pathname, items)?.href === item.href;
}
