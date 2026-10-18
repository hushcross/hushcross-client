import { getAddress, keccak256, type Address, type Hex } from "viem";
import { CoreError } from "../errors.js";
import { ServiceError } from "../services.js";
import { saleProfileMessage, saleProfileUploadHash, toBase64, verifySaleProfileDocument, type SaleLogoChange, type SaleProfileDocument, type SaleProfilePointer } from "./protocol.js";
import type { SaleProfileFields } from "./text.js";

/** `fetch`-compatible shape that also returns raw bytes (documents and logos are verified byte for byte). */
export interface BytesResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type BytesFetch = (url: string, init?: { readonly method?: string; readonly headers?: Readonly<Record<string, string>>; readonly body?: string }) => Promise<BytesResponseLike>;

/** A profile whose document and logos all matched their hashes. */
export interface VerifiedSaleProfile {
  readonly pointer: SaleProfilePointer;
  readonly document: SaleProfileDocument;
  /** Verified WebP bytes (256 px / 64 px), or null when the document has no logo or a logo failed its hash. */
  readonly logo: { readonly large: Uint8Array; readonly small: Uint8Array } | null;
}

/** Built before signing: the wallet signs `message`, then `MetaClient.upload` sends `body` with the signature. */
export interface PreparedSaleProfileUpload {
  readonly sale: Address;
  readonly message: string;
  readonly body: {
    readonly profile: SaleProfileFields;
    readonly logo?: string | { readonly from: Hex };
    readonly issuedAt: number;
    readonly chainId: number;
  };
}

export interface SaleProfileUploadResult {
  readonly sale: Address;
  readonly contentHash: Hex;
  readonly uri: string;
  readonly version: number;
}

const HASH = /^0x[0-9a-fA-F]{64}$/u;

export function prepareSaleProfileUpload(input: { readonly chainId: number; readonly sale: Address; readonly fields: SaleProfileFields; readonly logo: SaleLogoChange; readonly issuedAt: number }): PreparedSaleProfileUpload {
  const sale = getAddress(input.sale);
  const message = saleProfileMessage({ chainId: input.chainId, sale, contentHash: saleProfileUploadHash(input.fields, input.logo), issuedAt: input.issuedAt });
  const logo = input.logo.kind === "replace" ? { logo: toBase64(input.logo.bytes) } : input.logo.kind === "reuse" ? { logo: { from: input.logo.from } } : {};
  return { sale, message, body: { profile: { ...input.fields }, ...logo, issuedAt: input.issuedAt, chainId: input.chainId } };
}

async function json(response: BytesResponseLike): Promise<unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * Client of services/meta. Readers never trust the service: `resolve` checks the document against
 * the pointer's hash and each logo against the hash in the document.
 */
export class MetaClient {
  readonly origin: string;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: BytesFetch,
  ) {
    this.origin = new URL(baseUrl).origin;
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/u, "")}${path}`;
  }

  /** Service-held pointer (`GET /v1/sales/:sale`); null when the sale has no visible profile. */
  async pointer(sale: Address): Promise<SaleProfilePointer | null> {
    const response = await this.fetchImpl(this.url(`/v1/sales/${getAddress(sale)}`));
    if (response.status === 404) return null;
    const body = await json(response);
    if (!response.ok) throw new ServiceError("meta", response.status, errorCode(body));
    if (typeof body !== "object" || body === null || !("contentHash" in body) || !("uri" in body) || typeof body.contentHash !== "string" || typeof body.uri !== "string" || !HASH.test(body.contentHash)) {
      throw new CoreError("service_shape", "meta pointer is malformed");
    }
    return { contentHash: body.contentHash as Hex, uri: body.uri };
  }

  /** `POST /v1/sales/:sale` with the creator's signature over `prepared.message`. */
  async upload(prepared: PreparedSaleProfileUpload, signature: Hex): Promise<SaleProfileUploadResult> {
    const response = await this.fetchImpl(this.url(`/v1/sales/${prepared.sale}`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...prepared.body, signature }) });
    const body = await json(response);
    if (!response.ok) throw new ServiceError("meta", response.status, errorCode(body));
    if (typeof body !== "object" || body === null) throw new CoreError("service_shape", "meta upload answer is malformed");
    const { contentHash, uri, version } = body as Record<string, unknown>;
    if (typeof contentHash !== "string" || !HASH.test(contentHash) || typeof uri !== "string" || typeof version !== "number") throw new CoreError("service_shape", "meta upload answer is malformed");
    return { sale: prepared.sale, contentHash: contentHash as Hex, uri, version };
  }

  /** Where a pointer's document is fetched from. Only `<this service>/v1/p/<contentHash>` is accepted. */
  documentUrl(pointer: SaleProfilePointer): string | null {
    let url: URL;
    try {
      url = new URL(pointer.uri, this.baseUrl);
    } catch {
      return null;
    }
    return url.origin === this.origin && url.pathname.endsWith(`/v1/p/${pointer.contentHash.toLowerCase()}`) && url.search === "" && url.hash === "" ? url.href : null;
  }

  logoUrl(sale: Address, logoHash: Hex): string {
    return this.url(`/v1/logo/${sale.toLowerCase()}/${logoHash.toLowerCase()}.webp`);
  }

  private async bytes(url: string): Promise<Uint8Array | null> {
    const response = await this.fetchImpl(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Fetch and verify the document a pointer names, then its logos. Throws `profile_mismatch` for a
   * foreign uri, a hash mismatch or a malformed document (callers fall back to the monogram); a logo
   * that fails its hash is dropped (`logo: null`). Returns null when the document is gone (404).
   */
  async resolve(pointer: SaleProfilePointer, expected: { readonly sale: Address; readonly chainId: number }): Promise<VerifiedSaleProfile | null> {
    const url = this.documentUrl(pointer);
    if (url === null) throw new CoreError("profile_mismatch", "profile uri is not this meta service");
    const bytes = await this.bytes(url);
    if (bytes === null) return null;
    const document = verifySaleProfileDocument(bytes, { contentHash: pointer.contentHash, sale: expected.sale, chainId: expected.chainId });
    let logo: VerifiedSaleProfile["logo"] = null;
    if (document.logo !== null) {
      const [large, small] = await Promise.all([this.bytes(this.logoUrl(document.sale, document.logo.large)), this.bytes(this.logoUrl(document.sale, document.logo.small))]);
      const matches = (data: Uint8Array | null, hash: Hex): data is Uint8Array => data !== null && keccak256(data).toLowerCase() === hash.toLowerCase();
      logo = matches(large, document.logo.large) && matches(small, document.logo.small) ? { large, small } : null;
    }
    return { pointer, document, logo };
  }
}

function errorCode(body: unknown): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "error";
}
