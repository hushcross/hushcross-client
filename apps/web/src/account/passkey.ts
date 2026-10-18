/**
 * WebAuthn PRF (passkey) helper. The PRF output never leaves this tab; it only becomes
 * the AES key for the local vault (see core vaultStore).
 */
export interface PasskeyRegistration {
  readonly credentialId: Uint8Array;
  readonly prfSalt: Uint8Array;
  readonly prfOutput: Uint8Array;
}

export interface PasskeyPort {
  isSupported(): Promise<boolean>;
  register(label: string): Promise<PasskeyRegistration>;
  evaluate(credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array>;
}

export class PasskeyUnavailableError extends Error {
  constructor(message = 'passkey with PRF is not available') {
    super(message);
    this.name = 'PasskeyUnavailableError';
  }
}

interface PrfResults {
  readonly prf?: { readonly enabled?: boolean; readonly results?: { readonly first?: ArrayBuffer | ArrayBufferView } };
}

const random = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));
const view = (value: ArrayBuffer | ArrayBufferView): Uint8Array =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
const buffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.length);
  new Uint8Array(copy).set(bytes);
  return copy;
};

export function browserPasskeys(): PasskeyPort {
  const evaluate = async (credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array> => {
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: buffer(random(32)),
        allowCredentials: [{ type: 'public-key', id: buffer(credentialId) }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: buffer(prfSalt) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    const first = (credential?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first;
    if (!first) throw new PasskeyUnavailableError('this passkey did not return a PRF result');
    return view(first);
  };

  return {
    async isSupported() {
      if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return false;
      try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        return false;
      }
    },
    async register(label) {
      const prfSalt = random(32);
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { name: 'HushCross' },
          user: { id: buffer(random(16)), name: label, displayName: label },
          challenge: buffer(random(32)),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          extensions: { prf: { eval: { first: buffer(prfSalt) } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new PasskeyUnavailableError('passkey creation was cancelled');
      const results = credential.getClientExtensionResults() as PrfResults;
      if (results.prf?.enabled === false) throw new PasskeyUnavailableError();
      const credentialId = new Uint8Array(credential.rawId);
      const immediate = results.prf?.results?.first;
      const prfOutput = immediate ? view(immediate) : await evaluate(credentialId, prfSalt);
      return { credentialId, prfSalt, prfOutput };
    },
    evaluate,
  };
}
