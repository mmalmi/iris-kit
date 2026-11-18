import { verifyEvent, type Event } from 'nostr-tools/pure';
import { buildProfileDraft, buildRawProfileDraft, conflictingRawProfileFields, readRawProfileFields, type RawProfileEdits } from '@iris/profile-events';
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

export interface ProfileReadOptions {
  /** Query only the account's configured sources. A complete empty result permits creation. */
  query?: (pubkey: string) => Promise<{events: Iterable<Event>; complete: boolean}>;
  timeoutMs?: number;
}

function observe(client: ProfileClient, pubkey: string, base: Event | null, options: ProfileReadOptions, writing: boolean) {
  if (!/^[a-f0-9]{64}$/.test(pubkey)) throw Error('Invalid profile owner.');
  let head = base;
  const local = accepted.get(client);
  if (local?.pubkey === pubkey && newer(local, head)) head = local;
  let invalid = false;
  const receive = (event: Event) => {
    if (event?.kind !== 0 || event.pubkey !== pubkey) return;
    const verified = verifiedProfile(event, pubkey);
    if (!verified) invalid = true;
    else if (newer(verified, head)) head = verified;
  };
  const sub = client.subscribe({kinds: [0], authors: [pubkey], limit: 1});
  sub.on('event', receive);
  const refresh = async () => {
    if (!options.query) return;
    const report = await options.query(pubkey);
    for (const event of report.events) receive(event);
    if (!report.complete || (invalid && !head)) throw Error('Profile history is incomplete. Try again when connected.');
  };
  const ready = new Promise<void>((resolve, reject) => {
    const finish = (complete: boolean) => {
      clearTimeout(timer);
      if (complete || (!writing && head)) resolve();
      else reject(Error('Profile history is incomplete. Try again when connected.'));
    };
    const timer = setTimeout(() => finish(false), options.timeoutMs ?? 8000);
    if (options.query) void refresh().then(() => finish(true), () => finish(false));
    else sub.on('history', status => finish(status.complete && (!!head || !invalid)));
    sub.on('close', () => { clearTimeout(timer); reject(Error('Profile history closed. Try again.')); });
  });
  return {ready, refresh, head: () => head, stop: () => sub.stop()};
}

/** Null denotes a completed empty history. A verified known head can be displayed offline. */
export async function readOwnProfileHead(client: ProfileClient, pubkey: string, options: ProfileReadOptions = {}): Promise<Event | null> {
  const view = observe(client, pubkey, null, options, false);
  try { await view.ready; return structuredClone(view.head()); } finally { view.stop(); }
}

/** Keep observing the head through signer approval. Publish only the reviewed changes. */
export async function saveOwnProfileEdits(
  client: ProfileClient, pubkey: string, base: Event | null, edits: Readonly<Record<string, unknown>>, options: ProfileReadOptions = {},
): Promise<Event> {
  const values = readRawProfileFields(buildProfileDraft(null, edits).content);
  const raw = Object.fromEntries(Object.keys(edits).map(key => [key, Object.hasOwn(values, key) ? values[key] : undefined]));
  return saveOwnRawProfileEdits(client, pubkey, base, raw, options);
}

/** Publish exact JSON fragments, retaining the freshly verified profile and its tags. */
export function saveOwnRawProfileEdits(
  client: ProfileClient, pubkey: string, base: Event | null, edits: RawProfileEdits, options: ProfileReadOptions = {},
): Promise<Event> {
  const signer = client.signer;
  const changes = structuredClone(edits);
  const operation = async () => {
    if (!signer || client.signer !== signer || await signer.getPublicKey() !== pubkey)
      throw Error('Sign in with the profile owner before publishing.');
    const original = base && verifiedProfile(base, pubkey);
    if (base && !original) throw Error('The original profile could not be verified.');
    const view = observe(client, pubkey, original ?? null, options, true);
    try {
      await view.ready;
      const head = view.head();
      const conflicts = conflictingRawProfileFields(readRawProfileFields(original?.content ?? '{}'),
        readRawProfileFields(head?.content ?? '{}'), changes);
      if (conflicts.length) throw Error('Changed in another client: ' + conflicts.join(', ') + '. Reload and review these fields.');
      const draft = buildRawProfileDraft(head, changes);
      if (/nsec1/i.test(draft.content) || /nsec1/i.test(JSON.stringify(draft.tags)))
        throw Error('Remove the secret key before publishing your public profile.');
      const signed = verifiedProfile(await client.signEvent(structuredClone(draft)), pubkey);
      if (!signed || signed.content !== draft.content || signed.created_at !== draft.created_at ||
        JSON.stringify(signed.tags) !== JSON.stringify(draft.tags))
        throw Error('The signer returned a different profile.');
      await view.refresh();
      const checkCurrent = () => {
        if (client.signer !== signer || view.head()?.id !== head?.id)
          throw Error('Your sign-in or public profile changed during signing. Review your edits and try again.');
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
