/** Build target only: website code must not infer an extension from a spoofed chrome object. */
export const IS_EXTENSION = import.meta.env.VITE_APP_TARGET === 'extension';
export const PUBLIC_APP_ORIGIN = 'https://hushcross.fun';
export const MAX_APP_LINK_LENGTH = 4096;
const BAD_CHARACTERS = /[\u0000-\u0020\u007f\\]/;

/** Route a pasted official link locally; never request the link or rewrite its secret into a query. */
export function parseOfficialAppLink(raw: string): string | null {
  const input = raw.trim();
  if (input.length > MAX_APP_LINK_LENGTH || BAD_CHARACTERS.test(input)) return null;
  const authority = /^https:\/\/([^/?#]+)(\/[^?#]*)/i.exec(input);
  if (!authority || !['hushcross.fun', 'hushcross.fun:443'].includes(authority[1]!.toLowerCase())) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.origin !== PUBLIC_APP_ORIGIN || url.username || url.password
      || url.pathname.length > 512 || authority[2] !== url.pathname) return null;
    if (url.pathname === '/gift') {
      if (url.search || !/^#[A-Za-z0-9_-]+$/.test(url.hash)) return null;
      return `${url.pathname}${url.hash}`;
    }
    const route = /^\/(pay|give|launch)\/([^/]+)$/.exec(url.pathname);
    if (!route || url.hash) return null;
    const id = decodeURIComponent(route[2]!);
    if (!id || id.length > 256 || BAD_CHARACTERS.test(id) || /[/?#%]/.test(id) || id === '.' || id === '..') return null;
    if (route[1] === 'pay') {
      const keys = [...url.searchParams.keys()];
      if (keys.length !== new Set(keys).size || keys.some(key => !['asset', 'units', 'count'].includes(key))) return null;
      const asset = url.searchParams.get('asset'); const units = url.searchParams.get('units'); const count = url.searchParams.get('count');
      if ((asset !== null && asset !== 'BNB' && asset !== 'USDT')
        || (units !== null && !/^(0|[1-9][0-9]{0,19})(\.[0-9]{1,18})?$/.test(units))
        || (count !== null && (!/^[1-9][0-9]?$/.test(count) || Number(count) > 20))) return null;
    } else if (url.search || id === 'new' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Sharing always points at the public website, never an extension's local origin. */
export function publicAppUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.length > MAX_APP_LINK_LENGTH || BAD_CHARACTERS.test(path)) throw new Error('invalid_share_path');
  try {
    const origin = IS_EXTENSION ? PUBLIC_APP_ORIGIN : window.location.origin;
    const url = new URL(path, origin);
    if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('invalid_share_path');
    return url.href;
  } catch {
    throw new Error('invalid_share_path');
  }
}

export const EXTENSION_NAVIGATION_EVENT = 'hushcross:local-navigation';
export function extensionJobPath(id: string): string | null {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? `/jobs/${id}` : null;
}
export function isExtensionJobPath(path: unknown): path is string {
  return typeof path === 'string' && /^\/jobs\/[A-Za-z0-9_-]{1,128}$/.test(path);
}
