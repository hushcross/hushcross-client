/**
 * Validation of creator-supplied sale profile text (same rules as services/meta/src/text.ts).
 * Apps render the result as text nodes, never as HTML.
 */

export const SALE_DESCRIPTION_MAX = 600;
export const SALE_WEBSITE_MAX = 200;

export type SaleProfileFields = {
  readonly description: string;
  readonly website: string | null;
  readonly x: string | null;
  readonly telegram: string | null;
};

export type SaleProfileIssue = "description_too_long" | "description_invalid" | "website_invalid" | "x_invalid" | "telegram_invalid";

export type ProfileCheck<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: SaleProfileIssue };

/** Invisible or direction-changing characters that would let text masquerade as something else. */
const INVISIBLE = /[\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}\u{7f}-\u{9f}\u{ad}\u{61c}\u{115f}\u{1160}\u{17b4}\u{17b5}\u{180e}\u{200b}\u{200c}\u{200e}\u{200f}\u{202a}-\u{202e}\u{2060}-\u{206f}\u{3164}\u{feff}\u{ffa0}\u{fff0}-\u{fff8}]/gu;
/** Anything that looks like a markup tag or comment. */
const TAG = /<\/?[A-Za-z!?][^<>]*>/gu;

/** Plain-text description: NFC, `\n` line breaks only, no control/invisible characters, no tags. */
export function cleanSaleDescription(raw: string): ProfileCheck<string> {
  if (raw.length > SALE_DESCRIPTION_MAX * 4) return { ok: false, code: "description_too_long" };
  const text = raw
    .normalize("NFC")
    .replace(/\r\n?|[\u{2028}\u{2029}]/gu, "\n")
    .replace(/\t/gu, " ")
    .replace(INVISIBLE, "")
    .replace(TAG, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if ([...text].length > SALE_DESCRIPTION_MAX) return { ok: false, code: "description_too_long" };
  return { ok: true, value: text };
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/u;

/** https only, a public DNS name (no IP literals, no credentials, no custom port). Returns the normalized URL. */
export function cleanSaleWebsite(raw: string | null): ProfileCheck<string | null> {
  if (raw === null) return { ok: true, value: null };
  const value = raw.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > SALE_WEBSITE_MAX || !/^[\x21-\x7e]+$/u.test(value) || !/^https:\/\//iu.test(value)) return { ok: false, code: "website_invalid" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: "website_invalid" };
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return { ok: false, code: "website_invalid" };
  const labels = url.hostname.split(".");
  const tld = labels.at(-1) ?? "";
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label)) || !TLD.test(tld)) return { ok: false, code: "website_invalid" };
  if (url.href.length > SALE_WEBSITE_MAX) return { ok: false, code: "website_invalid" };
  return { ok: true, value: url.href };
}

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/u;
const TELEGRAM_HANDLE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/u;

function handle(raw: string | null, pattern: RegExp, code: SaleProfileIssue): ProfileCheck<string | null> {
  if (raw === null) return { ok: true, value: null };
  const value = raw.trim().replace(/^@/u, "");
  if (value === "") return { ok: true, value: null };
  return pattern.test(value) ? { ok: true, value } : { ok: false, code };
}

/** X (Twitter) handle without the `@`: 1-15 letters, digits or `_`. */
export const cleanXHandle = (raw: string | null): ProfileCheck<string | null> => handle(raw, X_HANDLE, "x_invalid");
/** Telegram username without the `@`: 4-32 characters, starts with a letter. */
export const cleanTelegramHandle = (raw: string | null): ProfileCheck<string | null> => handle(raw, TELEGRAM_HANDLE, "telegram_invalid");

export function cleanSaleProfileFields(fields: SaleProfileFields): ProfileCheck<SaleProfileFields> {
  const description = cleanSaleDescription(fields.description);
  if (!description.ok) return description;
  const website = cleanSaleWebsite(fields.website);
  if (!website.ok) return website;
  const x = cleanXHandle(fields.x);
  if (!x.ok) return x;
  const telegram = cleanTelegramHandle(fields.telegram);
  if (!telegram.ok) return telegram;
  return { ok: true, value: { description: description.value, website: website.value, x: x.value, telegram: telegram.value } };
}
