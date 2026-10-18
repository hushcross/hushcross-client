import { CoreError } from "./errors.js";

const BASE64URL = /^[A-Za-z0-9_-]*$/u;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** RFC 4648 base64url without padding. Works without Buffer or btoa. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += ALPHABET[(triple >> 18) & 63];
    out += ALPHABET[(triple >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(triple >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[triple & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, "").replace(/\+/gu, "-").replace(/\//gu, "_");
  if (!BASE64URL.test(clean) || clean.length % 4 === 1) throw new CoreError("base64", "invalid base64url text");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return out;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** WebCrypto wants an ArrayBuffer-backed view; copy to drop SharedArrayBuffer typing. */
export function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.length);
  new Uint8Array(copy).set(bytes);
  return copy;
}
