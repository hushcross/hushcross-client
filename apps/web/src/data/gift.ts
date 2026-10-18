/**
 * Gift helpers (SPEC §3.1). The link carries everything in the URL fragment
 * (`/gift#<base64url payload>`), which browsers never send to a server.
 * In the real build the message field is encrypted with a key derived from
 * the gift key; the mock carries it as-is inside the fragment.
 */

export interface GiftFragment {
  readonly v: 1;
  readonly chainId: number;
  readonly scope: string;
  /** 32-byte gift key, hex. Personal packets append `.<index>`. */
  readonly key: string;
  readonly message: string;
}

/** Randomly split `units` into `k` packets of at least one unit each. */
export function splitPackets(units: number, k: number, rng: () => number): number[] {
  if (!Number.isInteger(units) || !Number.isInteger(k) || k < 1 || units < k) throw new Error('need at least one unit per packet');
  const packets = Array.from({ length: k }, () => 1);
  for (let left = units - k; left > 0; left -= 1) {
    const index = Math.min(k - 1, Math.floor(rng() * k));
    packets[index] = (packets[index] ?? 1) + 1;
  }
  return packets;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeGiftFragment(payload: GiftFragment): string {
  return `#${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeGiftFragment(hash: string): GiftFragment | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(hash.replace(/^#/, '')));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (p.v !== 1 || typeof p.chainId !== 'number' || typeof p.scope !== 'string' || typeof p.key !== 'string' || typeof p.message !== 'string') return null;
    if (!/^[0-9a-f]{64}(\.\d+)?$/.test(p.key)) return null;
    return { v: 1, chainId: p.chainId, scope: p.scope, key: p.key, message: p.message.slice(0, 140) };
  } catch {
    return null;
  }
}
