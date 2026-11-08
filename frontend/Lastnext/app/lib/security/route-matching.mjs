/** Match a route and its children without also matching a public sibling slug. */
export function isWithinRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}
