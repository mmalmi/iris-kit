import { nip19 } from 'nostr-tools';
import type { IrisProfileRosterProjection } from './profile.ts';

export interface NostrProfileEventLike {
  kind: number;
  pubkey: string;
  created_at?: number;
  content: string;
}

export interface RepresentativeProfile {
  pubkey: string;
  npub: string;
  created_at: number;
  profile: Record<string, unknown>;
  event: NostrProfileEventLike;
}

export function representativeProfileAuthors(
  projection: IrisProfileRosterProjection,
): string[] {
  return Object.values(projection.active_facets)
    .filter((facet) => {
      const purposes = facet.purposes ?? [];
      return purposes.includes('social_profile') || purposes.includes('app_key');
    })
    .map((facet) => facet.pubkey)
    .filter((pubkey, index, all) => all.indexOf(pubkey) === index)
    .sort();
}

export function selectLatestRepresentativeProfileEvent(
  projection: IrisProfileRosterProjection,
  events: NostrProfileEventLike[],
): RepresentativeProfile | null {
  const authors = new Set(representativeProfileAuthors(projection));
  const candidates = events
    .filter((event) => event.kind === 0 && authors.has(event.pubkey))
    .slice()
    .sort((a, b) => ((b.created_at ?? 0) - (a.created_at ?? 0)) || a.pubkey.localeCompare(b.pubkey));
  const event = candidates[0];
  if (!event) return null;

  let profile: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      profile = parsed as Record<string, unknown>;
    }
  } catch {
    profile = {};
  }

  return {
    pubkey: event.pubkey,
    npub: nip19.npubEncode(event.pubkey),
    created_at: event.created_at ?? 0,
    profile,
    event,
  };
}
