/** Public reads only. Creation pages and all account-owned routes stay gated. */
export function isPublicBrowsingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (/^\/(?:app|privacy|about|docs|more|book|launch|give|gift)\/?$/i.test(pathname)) return true;
  if (/^\/pay\/[a-z0-9_-]+\/?$/i.test(pathname)) return true;
  const detail = /^\/(?:launch|give)\/([a-z0-9_-]+)\/?$/i.exec(pathname);
  return detail !== null && detail[1]?.toLowerCase() !== 'new';
}

/** Never accept a URL, query, secret fragment or arbitrary redirect after setup. */
export function safeReturnPath(value: string | null): string {
  if (!value || value.length > 256 || /[\s\\?#%]/.test(value) || !/^\/(?:[a-z0-9_-]+\/?)*$/i.test(value)) return '/';
  return isPublicBrowsingPath(value) ? value : '/';
}

export const setupPath = (pathname: string): string => `/account?returnTo=${encodeURIComponent(safeReturnPath(pathname))}`;
