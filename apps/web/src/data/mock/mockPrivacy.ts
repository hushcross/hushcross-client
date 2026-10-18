import type { PrivacyContext, RecipientFacts, SpentNoteFacts } from '../privacyCheck';
import type { Address, Note, PrivacyContextRequest } from '../types';
import { hashString } from './mockUtil';

export interface PrivacyFactsInput {
  readonly request: PrivacyContextRequest;
  readonly notes: readonly Note[];
  readonly now: number;
  readonly publicAddress: Address | null;
  /** Addresses this account has deposited from. */
  readonly depositAddresses: readonly Address[];
  /** Addresses whose first funding came from one of the deposit addresses. */
  readonly fundedByDepositAddresses: readonly Address[];
  readonly previousRecipients: readonly string[];
  readonly gift?: { readonly amount: bigint; readonly createdAt: number; readonly mixedAfter: number };
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Pick the notes a withdrawal would consume (exact unit matches, largest first). */
function chooseNotes(notes: readonly Note[], request: PrivacyContextRequest): Note[] {
  if (request.noteIds) return request.noteIds.flatMap((id) => notes.filter((n) => n.id === id));
  const pool = notes.filter((n) => n.asset === request.asset && n.status === 'approved');
  const used = new Set<string>();
  const chosen: Note[] = [];
  for (const unit of request.units) {
    const note = pool.find((n) => !used.has(n.id) && n.amount === unit) ?? pool.find((n) => !used.has(n.id) && n.amount > unit);
    if (note) {
      used.add(note.id);
      chosen.push(note);
    }
  }
  return chosen;
}

function recipientFacts(input: PrivacyFactsInput): RecipientFacts {
  const { request } = input;
  if (request.recipientAddress === null) return request.action === 'send' ? { kind: 'stealth' } : { kind: 'none' };
  const address = request.recipientAddress;
  const funded = input.fundedByDepositAddresses.some((a) => same(a, address));
  const seen = input.previousRecipients.some((a) => same(a, address));
  return {
    kind: 'address',
    ownDepositAddress: input.depositAddresses.some((a) => same(a, address)),
    ownPublicWallet: input.publicAddress !== null && same(input.publicAddress, address),
    // The mock pretends the read-only RPC could not see history for some fresh addresses.
    firstFundingFromOwnDeposit: funded ? true : seen || hashString(address.toLowerCase()) % 3 !== 0 ? false : null,
  };
}

export function buildPrivacyContext(input: PrivacyFactsInput): PrivacyContext {
  const { request, now } = input;
  const recipient = recipientFacts(input);
  const priorWithdrawalsToRecipient = request.recipientAddress === null ? 0 : input.previousRecipients.filter((a) => same(a, request.recipientAddress ?? '')).length;
  if (request.action === 'gift_claim' && input.gift) {
    const facts: SpentNoteFacts = { mixedAfter: input.gift.mixedAfter, ageMs: now - input.gift.createdAt, amount: input.gift.amount, depositTotal: input.gift.amount };
    return { notes: [facts], total: input.gift.amount, sameDepositAllUnits: false, recipient, relayDelayMinutes: request.relayDelayMinutes, priorWithdrawalsToRecipient };
  }
  const chosen = chooseNotes(input.notes, request);
  const depositTotal = (tx: string): bigint => input.notes.filter((n) => n.depositTx === tx).reduce((sum, n) => sum + n.amount, 0n);
  const facts = chosen.map((n) => ({ mixedAfter: n.mixedWith, ageMs: now - n.createdAt, amount: n.amount, depositTotal: depositTotal(n.depositTx) }));
  const txs = new Set(chosen.map((n) => n.depositTx));
  const [onlyTx] = [...txs];
  const siblings = onlyTx === undefined ? [] : input.notes.filter((n) => n.depositTx === onlyTx);
  const sameDepositAllUnits = recipient.kind === 'address' && txs.size === 1 && siblings.length >= 2 && siblings.every((n) => chosen.some((c) => c.id === n.id));
  return {
    notes: facts,
    total: request.units.reduce((sum, u) => sum + u, 0n),
    sameDepositAllUnits,
    recipient,
    relayDelayMinutes: request.relayDelayMinutes,
    priorWithdrawalsToRecipient,
  };
}
