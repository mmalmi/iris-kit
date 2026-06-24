import { finalizeEvent, getPublicKey, nip19, verifyEvent, type Event } from 'nostr-tools';
import { privateKeyFromSeedWords, validateWords } from 'nostr-tools/nip06';
import { normalizeHexPubkey, type IrisNostrEventDraft } from './profile.ts';

export type Awaitable<T> = T | Promise<T>;

export interface IrisIdentityEventSigner {
  readonly method: 'secret_key' | 'nsec' | 'seed_phrase' | 'nip07' | 'nip46' | 'custom';
  getPublicKey(): Awaitable<string>;
  signEvent(draft: IrisNostrEventDraft): Awaitable<Event>;
}

export interface Nip07LikeSigner {
  getPublicKey(): Promise<string>;
  signEvent(draft: IrisNostrEventDraft): Promise<Event>;
}

export interface Nip46LikeSigner {
  getPublicKey(): Awaitable<string>;
  signEvent(draft: IrisNostrEventDraft): Awaitable<Event>;
}

export function createIrisIdentitySignerFromSecretKey(
  secretKey: Uint8Array,
  method: IrisIdentityEventSigner['method'] = 'secret_key',
): IrisIdentityEventSigner {
  const signerPubkey = getPublicKey(secretKey);
  return {
    method,
    getPublicKey: () => signerPubkey,
    signEvent: (draft) => finalizeEvent(cloneDraft(draft), secretKey),
  };
}

export function createIrisIdentitySignerFromNsec(nsec: string): IrisIdentityEventSigner {
  return createIrisIdentitySignerFromSecretKey(decodeNsecSecretKey(nsec), 'nsec');
}

export function createIrisIdentitySignerFromSeedPhrase(options: {
  seedWords: string;
  passphrase?: string;
}): IrisIdentityEventSigner {
  const seedWords = normalizeSeedWords(options.seedWords);
  if (!validateWords(seedWords)) throw new Error('invalid seed phrase');
  return createIrisIdentitySignerFromSecretKey(
    privateKeyFromSeedWords(seedWords, options.passphrase),
    'seed_phrase',
  );
}

export function createIrisIdentitySignerFromNip07(nostr: Nip07LikeSigner): IrisIdentityEventSigner {
  return {
    method: 'nip07',
    getPublicKey: () => nostr.getPublicKey(),
    signEvent: async (draft) => {
      const expectedPubkey = await nostr.getPublicKey();
      const signed = await nostr.signEvent(cloneDraft(draft));
      validateSignedDraft(signed, draft, expectedPubkey);
      return signed;
    },
  };
}

export function createIrisIdentitySignerFromNip46(signer: Nip46LikeSigner): IrisIdentityEventSigner {
  return createIrisIdentitySignerFromCustom({
    method: 'nip46',
    getPublicKey: () => signer.getPublicKey(),
    signEvent: (draft) => signer.signEvent(draft),
  });
}

export function createIrisIdentitySignerFromCustom(options: {
  method?: IrisIdentityEventSigner['method'];
  getPublicKey: () => Awaitable<string>;
  signEvent: (draft: IrisNostrEventDraft) => Awaitable<Event>;
}): IrisIdentityEventSigner {
  return {
    method: options.method ?? 'custom',
    getPublicKey: options.getPublicKey,
    signEvent: async (draft) => {
      const expectedPubkey = await options.getPublicKey();
      const signed = await options.signEvent(cloneDraft(draft));
      validateSignedDraft(signed, draft, expectedPubkey);
      return signed;
    },
  };
}

export function decodeNsecSecretKey(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec.trim());
  if (decoded.type !== 'nsec') throw new Error('expected nsec private key');
  return decoded.data as Uint8Array;
}

function normalizeSeedWords(seedWords: string): string {
  return seedWords.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cloneDraft(draft: IrisNostrEventDraft): IrisNostrEventDraft {
  return {
    kind: draft.kind,
    content: draft.content,
    created_at: draft.created_at,
    tags: draft.tags.map((tag) => tag.slice()),
  };
}

function validateSignedDraft(event: Event, draft: IrisNostrEventDraft, expectedPubkey: string): void {
  const normalizedExpectedPubkey = normalizeHexPubkey(expectedPubkey);
  if (!normalizedExpectedPubkey) throw new Error('expected signer pubkey must be 64-char hex');
  if (event.kind !== draft.kind) throw new Error('signed event kind mismatch');
  if (event.content !== draft.content) throw new Error('signed event content mismatch');
  if (event.created_at !== draft.created_at) throw new Error('signed event created_at mismatch');
  if (JSON.stringify(event.tags) !== JSON.stringify(draft.tags)) {
    throw new Error('signed event tags mismatch');
  }
  if (event.pubkey !== normalizedExpectedPubkey) throw new Error('signed event pubkey mismatch');
  if (!verifyEvent(event)) throw new Error('signed event signature verification failed');
}
