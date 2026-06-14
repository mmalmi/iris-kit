export interface IrisProfile {
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  username?: unknown;
  picture?: unknown;
  image?: unknown;
  about?: unknown;
  pubkey?: unknown;
  npub?: unknown;
}

const adjectives = [
  'Happy', 'Sleepy', 'Bouncy', 'Fluffy', 'Sneaky', 'Grumpy', 'Jolly', 'Lazy',
  'Brave', 'Clever', 'Swift', 'Gentle', 'Mighty', 'Noble', 'Proud', 'Silent',
  'Wise', 'Wild', 'Calm', 'Fierce', 'Golden', 'Silver', 'Cosmic', 'Mystic',
  'Dancing', 'Singing', 'Glowing', 'Sparkling', 'Daring', 'Curious', 'Playful',
  'Serene', 'Bold', 'Charming', 'Elegant', 'Fancy', 'Graceful', 'Heroic',
];

const names = [
  'Penguin', 'Panda', 'Koala', 'Otter', 'Fox', 'Wolf', 'Bear', 'Lion',
  'Tiger', 'Eagle', 'Owl', 'Hawk', 'Dolphin', 'Whale', 'Shark', 'Octopus',
  'Rabbit', 'Deer', 'Moose', 'Elk', 'Bison', 'Badger', 'Beaver',
  'Hedgehog', 'Squirrel', 'Chipmunk', 'Giraffe', 'Elephant', 'Rhino', 'Hippo',
  'Zebra', 'Cheetah', 'Leopard', 'Jaguar', 'Panther', 'Lynx', 'Cougar',
  'Falcon', 'Raven', 'Crow', 'Sparrow', 'Robin', 'Cardinal', 'Pelican',
  'Flamingo', 'Peacock', 'Swan', 'Goose', 'Duck', 'Crane', 'Heron', 'Stork',
  'Parrot', 'Toucan', 'Finch', 'Canary', 'Puffin', 'Seal', 'Walrus',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hashCode(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getProfileName(profile: IrisProfile | null | undefined): string {
  if (!profile) return '';
  return text(profile.display_name)
    || text(profile.displayName)
    || text(profile.name)
    || text(profile.username);
}

export function getProfilePicture(profile: IrisProfile | null | undefined): string {
  if (!profile) return '';
  return text(profile.picture) || text(profile.image);
}

export function fallbackIdentityName(seed: string | null | undefined): string {
  const normalizedSeed = text(seed) || 'iris';
  const hash = hashCode(normalizedSeed);
  const adjective = adjectives[hash % adjectives.length];
  const name = names[Math.floor(hash / adjectives.length) % names.length];
  return `${adjective} ${name}`;
}

export function getProfileDisplayName(
  profile: IrisProfile | null | undefined,
  pubkey: string | null | undefined,
  preferredName?: string | null,
  fallbackName?: string | null,
): string {
  return text(preferredName) || getProfileName(profile) || text(fallbackName) || fallbackIdentityName(pubkey);
}

export function hasExplicitProfileName(
  profile: IrisProfile | null | undefined,
  preferredName?: string | null,
): boolean {
  return Boolean(text(preferredName) || getProfileName(profile));
}

export const animalName = fallbackIdentityName;
