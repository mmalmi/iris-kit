import { verifyEvent, type Event } from 'nostr-tools/pure';
import { buildProfileDraft, conflictingProfileFields, readProfileFields } from '@iris/profile-events';
import type { AppNostrClient } from './nostr.ts';

type ProfileClient = Pick<AppNostrClient, 'subscribe' | 'signer' | 'signEvent' | 'publish'>;
const accepted = new WeakMap<ProfileClient, Event>();
const writes = new WeakMap<ProfileClient, Promise<unknown>>();

function verifiedProfile(event: Event, pubkey: string): Event | undefined {
  if (event?.kind !== 0 || event.pubkey !== pubkey) return;
  try {
    // Remove nostr-tools' cached verification symbol and detach from mutable state.
    const copy: Event = {kind: event.kind, pubkey: event.pubkey, created_at: event.created_at,
      tags: event.tags.map(tag => [...tag]), content: event.content, sig: event.sig, id: event.id};
    if (verifyEvent(copy)) return copy;
  } catch { /* An invalid raw event cannot be a base. */ }
}

function newer(candidate: Event, head: Event | null): boolean {
  return !head || candidate.created_at > head.created_at ||
    (candidate.created_at === head.created_at && candidate.id < head.id);
}

function observe(client: ProfileClient, pubkey: string, base: Event | null = null, timeoutMs = 8000) {
  if (!/^[a-f0-9]{64}$/.test(pubkey)) throw Error('Invalid profile owner.');
  let head = base;
  const local = accepted.get(client);
  if (local?.pubkey === pubkey && newer(local, head)) head = local;
  let invalid = false;
  const sub = client.subscribe({kinds: [0], authors: [pubkey], limit: 1});
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Profile history is incomplete. Try again when connected.')), timeoutMs);
    sub.on('event', event => {
      if (event.kind !== 0 || event.pubkey !== pubkey) return;
      const verified = verifiedProfile(event, pubkey);
      if (!verified) invalid = true;
      else if (newer(verified, head)) head = verified;
    });
    sub.on('history', status => {
      clearTimeout(timer);
      if (status.complete && (head || !invalid)) resolve();
      else reject(Error('Profile history is incomplete. Try again when connected.'));
    });
    sub.on('close', () => { clearTimeout(timer); reject(Error('Profile history closed. Try again.')); });
  });
  return {ready, head: () => head, stop: () => sub.stop()};
}

/** Null denotes an authoritative empty history. Partial or unanswered history rejects. */
export async function readOwnProfileHead(client: ProfileClient, pubkey: string, timeoutMs?: number): Promise<Event | null> {
  const view = observe(client, pubkey, null, timeoutMs);
  try { await view.ready; return structuredClone(view.head()); } finally { view.stop(); }
}

/** Keep observing the head through signer approval. Publish only the reviewed changes. */
export function saveOwnProfileEdits(
  client: ProfileClient, pubkey: string, base: Event | null, edits: Readonly<Record<string, unknown>>,
): Promise<Event> {
  const signer = client.signer;
  const changes = structuredClone(edits);
  const operation = async () => {
    if (!signer || client.signer !== signer || await signer.getPublicKey() !== pubkey)
      throw Error('Sign in with the profile owner before publishing.');
    const original = base && verifiedProfile(base, pubkey);
    if (base && !original) throw Error('The original profile could not be verified.');
    const view = observe(client, pubkey, original ?? null);
    try {
      await view.ready;
      const head = view.head();
      const conflicts = conflictingProfileFields(readProfileFields(original?.content ?? '{}'),
        readProfileFields(head?.content ?? '{}'), changes);
      if (conflicts.length) throw Error('Changed in another client: ' + conflicts.join(', ') + '. Reload and review these fields.');
      const draft = buildProfileDraft(head, changes);
      if (/nsec1/i.test(draft.content) || /nsec1/i.test(JSON.stringify(draft.tags)))
        throw Error('Remove the secret key before publishing your public profile.');
      const signed = verifiedProfile(await client.signEvent(structuredClone(draft)), pubkey);
      if (!signed || signed.content !== draft.content || signed.created_at !== draft.created_at ||
        JSON.stringify(signed.tags) !== JSON.stringify(draft.tags))
        throw Error('The signer returned a different profile.');
      const checkCurrent = () => {
        if (client.signer !== signer || view.head()?.id !== head?.id)
          throw Error('The account or profile changed during signing. Review your edits and try again.');
      };
      checkCurrent();
      const receipt = await client.publish(signed, checkCurrent);
      if (receipt && typeof receipt === 'object' &&
        !('queued' in receipt && receipt.queued === true) && !('accepted' in receipt && receipt.accepted === true) &&
        !('remoteAccepted' in receipt && receipt.remoteAccepted === true) &&
        ('accepted' in receipt || 'queued' in receipt || 'remoteAccepted' in receipt))
        throw Error('The updated profile was not accepted.');
      accepted.set(client, signed);
      return structuredClone(signed);
    } finally { view.stop(); }
  };
  const pending = (writes.get(client) ?? Promise.resolve()).then(operation);
  writes.set(client, pending.catch(() => {}));
  return pending;
}
