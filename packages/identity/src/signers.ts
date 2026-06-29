import { finalizeEvent, getPublicKey, nip19, nip44, verifyEvent, type Event } from 'nostr-tools';
import { privateKeyFromSeedWords, validateWords } from 'nostr-tools/nip06';
import { normalizeHexPubkey, type NostrIdentityEventDraft } from './profile.ts';

export type Awaitable<T> = T | Promise<T>;

export interface NostrIdentityEventSigner {
  readonly method: 'secret_key' | 'nsec' | 'seed_phrase' | 'nip07' | 'nip46' | 'custom';
  getPublicKey(): Awaitable<string>;
  signEvent(draft: NostrIdentityEventDraft): Awaitable<Event>;
  nip44Encrypt?(recipientPubkey: string, plaintext: string): Awaitable<string>;
  nip44Decrypt?(senderPubkey: string, ciphertext: string): Awaitable<string>;
}

export interface Nip07LikeSigner {
  getPublicKey(): Promise<string>;
  signEvent(draft: NostrIdentityEventDraft): Promise<Event>;
  nip44?: {
    encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
    decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
  };
}

export interface Nip46LikeSigner {
  getPublicKey(): Awaitable<string>;
  signEvent(draft: NostrIdentityEventDraft): Awaitable<Event>;
  nip44Encrypt?(recipientPubkey: string, plaintext: string): Awaitable<string>;
  nip44Decrypt?(senderPubkey: string, ciphertext: string): Awaitable<string>;
}

export function createNostrIdentitySignerFromSecretKey(
  secretKey: Uint8Array,
  method: NostrIdentityEventSigner['method'] = 'secret_key',
): NostrIdentityEventSigner {
  const signerPubkey = getPublicKey(secretKey);
  return {
    method,
    getPublicKey: () => signerPubkey,
    signEvent: (draft) => finalizeEvent(cloneDraft(draft), secretKey),
    nip44Encrypt: (recipientPubkey, plaintext) => nip44.v2.encrypt(
      plaintext,
      nip44.v2.utils.getConversationKey(secretKey, requireHexPubkey(recipientPubkey, 'recipient')),
    ),
    nip44Decrypt: (senderPubkey, ciphertext) => nip44.v2.decrypt(
      ciphertext,
      nip44.v2.utils.getConversationKey(secretKey, requireHexPubkey(senderPubkey, 'sender')),
    ),
  };
}

export function createNostrIdentitySignerFromNsec(nsec: string): NostrIdentityEventSigner {
  return createNostrIdentitySignerFromSecretKey(decodeNsecSecretKey(nsec), 'nsec');
}

export function createNostrIdentitySignerFromSeedPhrase(options: {
  seedWords: string;
  passphrase?: string;
}): NostrIdentityEventSigner {
  const seedWords = normalizeSeedWords(options.seedWords);
  if (!validateWords(seedWords)) throw new Error('invalid seed phrase');
  return createNostrIdentitySignerFromSecretKey(
    privateKeyFromSeedWords(seedWords, options.passphrase),
    'seed_phrase',
  );
}

export function createNostrIdentitySignerFromNip07(nostr: Nip07LikeSigner): NostrIdentityEventSigner {
  return {
    method: 'nip07',
    getPublicKey: () => nostr.getPublicKey(),
    signEvent: async (draft) => {
      const expectedPubkey = await nostr.getPublicKey();
      const signed = await nostr.signEvent(cloneDraft(draft));
      validateSignedDraft(signed, draft, expectedPubkey);
      return signed;
    },
    ...(nostr.nip44 ? {
      nip44Encrypt: (recipientPubkey, plaintext) => nostr.nip44!.encrypt(
        requireHexPubkey(recipientPubkey, 'recipient'),
        plaintext,
      ),
      nip44Decrypt: (senderPubkey, ciphertext) => nostr.nip44!.decrypt(
        requireHexPubkey(senderPubkey, 'sender'),
        ciphertext,
      ),
    } : {}),
  };
}

export function createNostrIdentitySignerFromNip46(signer: Nip46LikeSigner): NostrIdentityEventSigner {
  return createNostrIdentitySignerFromCustom({
    method: 'nip46',
    getPublicKey: () => signer.getPublicKey(),
    signEvent: (draft) => signer.signEvent(draft),
    ...(signer.nip44Encrypt ? {
      nip44Encrypt: (recipientPubkey, plaintext) => signer.nip44Encrypt!(
        requireHexPubkey(recipientPubkey, 'recipient'),
        plaintext,
      ),
    } : {}),
    ...(signer.nip44Decrypt ? {
      nip44Decrypt: (senderPubkey, ciphertext) => signer.nip44Decrypt!(
        requireHexPubkey(senderPubkey, 'sender'),
        ciphertext,
      ),
    } : {}),
  });
}

export function createNostrIdentitySignerFromCustom(options: {
  method?: NostrIdentityEventSigner['method'];
  getPublicKey: () => Awaitable<string>;
  signEvent: (draft: NostrIdentityEventDraft) => Awaitable<Event>;
  nip44Encrypt?: (recipientPubkey: string, plaintext: string) => Awaitable<string>;
  nip44Decrypt?: (senderPubkey: string, ciphertext: string) => Awaitable<string>;
}): NostrIdentityEventSigner {
  return {
    method: options.method ?? 'custom',
    getPublicKey: options.getPublicKey,
    signEvent: async (draft) => {
      const expectedPubkey = await options.getPublicKey();
      const signed = await options.signEvent(cloneDraft(draft));
      validateSignedDraft(signed, draft, expectedPubkey);
      return signed;
    },
    ...(options.nip44Encrypt ? {
      nip44Encrypt: (recipientPubkey, plaintext) => options.nip44Encrypt!(
        requireHexPubkey(recipientPubkey, 'recipient'),
        plaintext,
      ),
    } : {}),
    ...(options.nip44Decrypt ? {
      nip44Decrypt: (senderPubkey, ciphertext) => options.nip44Decrypt!(
        requireHexPubkey(senderPubkey, 'sender'),
        ciphertext,
      ),
    } : {}),
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

function cloneDraft(draft: NostrIdentityEventDraft): NostrIdentityEventDraft {
  return {
    kind: draft.kind,
    content: draft.content,
    created_at: draft.created_at,
    tags: draft.tags.map((tag: string[]) => tag.slice()),
  };
}

function requireHexPubkey(value: string, label: string): string {
  const normalized = normalizeHexPubkey(value);
  if (!normalized) throw new Error(`${label} pubkey must be 64-char hex`);
  return normalized;
}

function validateSignedDraft(event: Event, draft: NostrIdentityEventDraft, expectedPubkey: string): void {
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
