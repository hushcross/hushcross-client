export interface AndroidReleaseMetadata {
  readonly versionName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly certificateSha256: string;
  readonly downloadUrl: string;
}

/** Only owner-controlled GitHub release assets, never placeholders or arbitrary APK hosts. */
export function readAndroidRelease(value: unknown): AndroidReleaseMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.versionName !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v.versionName)) return null;
  if (typeof v.sizeBytes !== 'number' || !Number.isSafeInteger(v.sizeBytes) || v.sizeBytes <= 0) return null;
  if (typeof v.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(v.sha256)) return null;
  if (typeof v.certificateSha256 !== 'string' || !/^([0-9a-f]{2}:){31}[0-9a-f]{2}$/i.test(v.certificateSha256)) return null;
  if (typeof v.downloadUrl !== 'string') return null;
  let url: URL;
  try { url = new URL(v.downloadUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.split('/');
  if (parts.length !== 7 || parts[1] !== 'hushcross' || !['hushcross-client', 'hushcross-protocol'].includes(parts[2] ?? '') || parts[3] !== 'releases' || parts[4] !== 'download' || !parts[5] || parts[6] !== `hushcross-${v.versionName}.apk`) return null;
  return { versionName: v.versionName, sizeBytes: v.sizeBytes, sha256: v.sha256.toLowerCase(), certificateSha256: v.certificateSha256.toUpperCase(), downloadUrl: url.href };
}
