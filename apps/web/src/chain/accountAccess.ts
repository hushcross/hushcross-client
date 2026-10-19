import { DataSourceError, type DataSource } from '../data/DataSource';

// Only account-independent chain/service reads belong here. In particular,
// getPrivacyContext includes local notes/history and is not a public read.
const PUBLIC_READS = new Set<PropertyKey>([
  'getVaultConfig', 'getPoolStats', 'openGift', 'listSales', 'getSale', 'getSaleProfile',
  'listPairs', 'getEpoch', 'listClearings', 'getRevealedBook', 'listCampaigns',
  'getCampaign', 'listDonations', 'verifyReceipt',
] satisfies (keyof DataSource)[]);

const PERSONAL_READS = new Set<PropertyKey>([
  'getAccount', 'getBalances', 'listActivity', 'listNotes', 'getBackupStatus', 'exportBackup',
  'resolveRecipient', 'quoteSend', 'listRelayJobs', 'listPaymentRequests', 'listIncoming',
  'listOneTimeFunds', 'listMyGifts', 'getPrivacyContext', 'listMyBids', 'quoteBid',
  'listMyOrders', 'quoteOrder', 'listMyDonations',
] satisfies (keyof DataSource)[]);

type Method = (...args: unknown[]) => unknown;

/** Resolve ordinary methods without exposing context fields or evaluating accessors. */
function findMethod(source: DataSource, property: PropertyKey): Method | undefined {
  if (property === 'constructor') return undefined;
  for (let object: object | null = source; object && object !== Object.prototype; object = Object.getPrototypeOf(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, property);
    if (descriptor) return typeof descriptor.value === 'function' ? descriptor.value as Method : undefined;
  }
  return undefined;
}

/**
 * Session gate for the UI DataSource, not a replacement for contract authorization.
 * Refusals are rejected promises (the DataSource contract); subscribe stays synchronous.
 */
export function withAccountAccess(source: DataSource, readStatus: () => unknown): DataSource {
  const unlocked = (): boolean => {
    try { return readStatus() === 'unlocked'; }
    catch { return false; }
  };
  const methods = new Map<PropertyKey, { original: Method; wrapped: Method }>();
  // A separate facade also supports frozen sources and does not expose their context.
  return new Proxy(Object.create(null) as DataSource, {
    get(_target, property) {
      const original = findMethod(source, property);
      if (!original) return undefined;
      const cached = methods.get(property);
      if (cached?.original === original) return cached.wrapped;
      const wrapped: Method = property === 'subscribe' || PUBLIC_READS.has(property)
        ? (...args) => Reflect.apply(original, source, args)
        : async (...args) => {
          if (!unlocked()) throw new DataSourceError('locked');
          const result: unknown = await Reflect.apply(original, source, args);
          // Discard late personal reads. Do not pretend a submitted write was revoked:
          // its accepted result must retain its meaning even if the vault has since locked.
          if (PERSONAL_READS.has(property) && !unlocked()) throw new DataSourceError('locked');
          return result;
        };
      methods.set(property, { original, wrapped });
      return wrapped;
    },
  });
}
