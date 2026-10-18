/**
 * Links from a sale profile are untrusted: rebuilt here from validated parts only, never taken as
 * free-form hrefs. Everything shown is the plain domain or handle.
 */
export interface ProfileLink {
  readonly kind: 'website' | 'x' | 'telegram';
  readonly href: string;
  /** What the link text shows: the domain for websites, @handle for X and Telegram. */
  readonly text: string;
}

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const TELEGRAM_HANDLE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/** https URL with a public host; returns the normalised href and the bare domain, or null. */
export function websiteLink(raw: string | null): ProfileLink | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || !url.hostname.includes('.')) return null;
    return { kind: 'website', href: url.href, text: url.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

export function profileLinks(profile: { readonly website: string | null; readonly x: string | null; readonly telegram: string | null }): ProfileLink[] {
  const links: ProfileLink[] = [];
  const site = websiteLink(profile.website);
  if (site) links.push(site);
  if (profile.x && X_HANDLE.test(profile.x)) links.push({ kind: 'x', href: `https://x.com/${profile.x}`, text: `@${profile.x}` });
  if (profile.telegram && TELEGRAM_HANDLE.test(profile.telegram)) links.push({ kind: 'telegram', href: `https://t.me/${profile.telegram}`, text: `@${profile.telegram}` });
  return links;
}
