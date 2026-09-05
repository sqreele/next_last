/** Server-only BFF target: never route credentials through the public app. */
export function buildBffUpstream(path: string[], search: string): URL {
  const upstream = new URL(process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000');
  if (
    upstream.protocol !== 'http:' || upstream.hostname !== 'backend' ||
    upstream.port !== '8000' || upstream.username || upstream.password ||
    upstream.pathname !== '/' || upstream.search || upstream.hash
  ) {
    throw new Error('BFF requires the internal backend origin.');
  }
  upstream.pathname = `/api/v1/${path.map(encodeURIComponent).join('/')}/`;
  upstream.search = search;
  return upstream;
}
