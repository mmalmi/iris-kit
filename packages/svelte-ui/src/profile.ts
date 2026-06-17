export interface IrisProfile {
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  username?: unknown;
  nickname?: unknown;
  picture?: unknown;
  image?: unknown;
  about?: unknown;
  pubkey?: unknown;
  npub?: unknown;
}

export const coolNameAdjectives = [
  'Amber',
  'Analog',
  'Arcane',
  'Astral',
  'Aurora',
  'Azure',
  'Blissful',
  'Blooming',
  'Bold',
  'Bright',
  'Brilliant',
  'Calm',
  'Celestial',
  'Charming',
  'Clear',
  'Clever',
  'Cosmic',
  'Crimson',
  'Crystal',
  'Curious',
  'Daring',
  'Deep',
  'Dreamy',
  'Electric',
  'Emerald',
  'Ethereal',
  'Fabled',
  'Feral',
  'Festival',
  'Floating',
  'Fluent',
  'Free',
  'Friendly',
  'Gentle',
  'Glowing',
  'Golden',
  'Graceful',
  'Harmonic',
  'Hidden',
  'Honey',
  'Infinite',
  'Kind',
  'Laughing',
  'Liminal',
  'Lucid',
  'Lunar',
  'Lush',
  'Magnetic',
  'Mellow',
  'Mercury',
  'Midnight',
  'Mirrored',
  'Mystic',
  'Neon',
  'Nimble',
  'Noble',
  'Northern',
  'Nova',
  'Opal',
  'Open',
  'Pacific',
  'Patient',
  'Pearl',
  'Playful',
  'Polished',
  'Prismatic',
  'Quiet',
  'Radiant',
  'Restless',
  'River',
  'Ruby',
  'Saffron',
  'Secret',
  'Serene',
  'Signal',
  'Silver',
  'Solar',
  'Sparkling',
  'Spiral',
  'Stellar',
  'Still',
  'Stormy',
  'Sunny',
  'Swift',
  'Tender',
  'Verdant',
  'Velvet',
  'Vivid',
  'Warm',
  'Wandering',
  'Wild',
  'Wise',
  'Witty',
  'Wonder',
  'Zephyr',
] as const;

export const coolNameNouns = [
  'Anchor',
  'Archive',
  'Atlas',
  'Aurora',
  'Beacon',
  'Bloom',
  'Bridge',
  'Canvas',
  'Cascade',
  'Cipher',
  'Circuit',
  'Cloud',
  'Comet',
  'Compass',
  'Constellation',
  'Cove',
  'Daydream',
  'Drift',
  'Echo',
  'Ember',
  'Field',
  'Festival',
  'Flame',
  'Flux',
  'Forest',
  'Forge',
  'Fountain',
  'Garden',
  'Glacier',
  'Halo',
  'Harbor',
  'Harmony',
  'Hearth',
  'Horizon',
  'Lantern',
  'Library',
  'Lighthouse',
  'Lagoon',
  'Labyrinth',
  'Meadow',
  'Melody',
  'Mirage',
  'Mosaic',
  'Nebula',
  'Nimbus',
  'Nova',
  'Oasis',
  'Opal',
  'Orbit',
  'Orchard',
  'Paradox',
  'Pearl',
  'Planet',
  'Portal',
  'Prism',
  'Pulse',
  'Quartz',
  'Quest',
  'Radiance',
  'Rain',
  'Reef',
  'Riddle',
  'Ripple',
  'River',
  'Sanctuary',
  'Satellite',
  'Serenade',
  'Signal',
  'Solstice',
  'Spark',
  'Spectrum',
  'Spiral',
  'Starlight',
  'Station',
  'Studio',
  'Summit',
  'Sunrise',
  'Tempo',
  'Thread',
  'Tide',
  'Trail',
  'Valley',
  'Velvet',
  'Voyager',
  'Vortex',
  'Wave',
  'Wonder',
  'Zenith',
] as const;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedSeed(seed: string | null | undefined): string {
  return text(seed) || 'iris';
}

function coolNameHash(seed: string): [number, number] {
  let first = 0x811c9dc5;
  let second = 0x85ebca6b;

  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }

  return [first >>> 0, second >>> 0];
}

export function coolName(seed: string | null | undefined): string {
  const [first, second] = coolNameHash(normalizedSeed(seed));
  const adjective = coolNameAdjectives[first % coolNameAdjectives.length];
  const noun = coolNameNouns[second % coolNameNouns.length];
  return `${adjective} ${noun}`;
}

export function getProfileName(profile: IrisProfile | null | undefined): string {
  return getProfileNameCandidates(profile)[0] ?? '';
}

export function getProfileNameCandidates(profile: IrisProfile | null | undefined): string[] {
  if (!profile) return [];
  return uniqueTexts([
    profile.display_name,
    profile.displayName,
    profile.name,
    profile.username,
    profile.nickname,
  ]);
}

export function getProfilePicture(profile: IrisProfile | null | undefined): string {
  if (!profile) return '';
  return text(profile.picture) || text(profile.image);
}

export function fallbackIdentityName(seed: string | null | undefined): string {
  return coolName(seed);
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

function uniqueTexts(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = text(value);
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
