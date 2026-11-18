/** Callers establish the event's signature, kind, author and freshness before editing. */
type EventData = { content: string; tags: readonly (readonly string[])[] };
type ProfileBase = EventData & { created_at: number };

export function readProfileFields(content: string): Record<string, unknown> {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Profile metadata must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

// The document is already validated. Retain the original JSON for untouched
// values, including nested numbers that cannot round-trip through a JS number.
function rawMembers(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[\[\]{},:]|[^\s\[\]{},:"]+/g;
  let depth = 0;
  let key: string | undefined;
  let valueStart = 0;
  for (const match of content.matchAll(tokens)) {
    const token = match[0];
    if (depth === 1 && key === undefined && token.startsWith('"')) {
      key = JSON.parse(token) as string;
    } else if (depth === 1 && token === ':') {
      valueStart = match.index + 1;
    } else if (depth === 1 && (token === ',' || token === '}') && key !== undefined) {
      if (fields.has(key)) throw new Error('Profile metadata contains a duplicate field name.');
      fields.set(key, content.slice(valueStart, match.index).trim());
      key = undefined;
    }
    if (token === '{' || token === '[') depth++;
    if (token === '}' || token === ']') depth--;
  }
  return fields;
}

function encodeValue(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) => {
    if (part === undefined || typeof part === 'function' || typeof part === 'symbol'
      || (typeof part === 'number' && !Number.isFinite(part))) {
      throw new Error('Profile fields must contain JSON values.');
    }
    return part;
  });
}

export function buildProfileDraft(
  base: ProfileBase | null,
  edits: Readonly<Record<string, unknown>>,
  now = Math.floor(Date.now() / 1000),
): { kind: 0; content: string; tags: string[][]; created_at: number } {
  if (!Number.isSafeInteger(now) || now < 0 || (base &&
    (!Number.isSafeInteger(base.created_at) || base.created_at < 0 || base.created_at === Number.MAX_SAFE_INTEGER))) {
    throw new Error('Invalid profile timestamp.');
  }
  const content = base?.content ?? '{}';
  const fields = readProfileFields(content);
  const members = rawMembers(content);
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) members.delete(key);
    else members.set(key, encodeValue(value));
  }
  // NIP-92: discard attachment metadata only when the corresponding profile
  // image actually goes away, including when picture and banner share a URL.
  const removedImages = new Set([fields.picture, fields.banner].filter(url => typeof url === 'string'));
  for (const key of ['picture', 'banner']) {
    const url = Object.hasOwn(edits, key) ? edits[key] : fields[key];
    if (typeof url === 'string') removedImages.delete(url);
  }
  const tags = (base?.tags ?? []).filter(tag => {
    if (tag[0] !== 'imeta' || removedImages.size === 0) return true;
    const url = tag.find(part => part.startsWith('url '));
    return !url || !removedImages.has(url.slice(4));
  }).map(tag => [...tag]);
  const entries = Array.from(members, ([key, raw]) => JSON.stringify(key) + ':' + raw);
  return { kind: 0, content: '{' + entries.join(',') + '}', tags, created_at: Math.max(now, (base?.created_at ?? -1) + 1) };
}

type Tags = EventData['tags'];

function subtractTags(left: Tags, right: Tags): string[][] {
  const counts = new Map<string, number>();
  for (const tag of right) {
    const key = JSON.stringify(tag);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const remaining: string[][] = [];
  for (const tag of left) {
    const key = JSON.stringify(tag);
    const count = counts.get(key) ?? 0;
    if (count > 0) counts.set(key, count - 1);
    else remaining.push([...tag]);
  }
  return remaining;
}

function tagChanges(before: Tags, after: Tags) {
  const tagsAdded = subtractTags(after, before);
  const tagsRemoved = subtractTags(before, after);
  const tagsReordered = !tagsAdded.length && !tagsRemoved.length && JSON.stringify(before) !== JSON.stringify(after);
  return { tagsAdded, tagsRemoved, tagsReordered };
}

// Object property order does not change a JSON value. Array order does.
function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
    || Array.isArray(left) !== Array.isArray(right)) return false;
  const first = left as Record<string, unknown>;
  const second = right as Record<string, unknown>;
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length &&
    keys.every(key => Object.hasOwn(second, key) && equalValue(first[key], second[key]));
}

type Fields = Readonly<Record<string, unknown>>;

export function diffProfileFields(before: Fields, after: Fields): Record<string, unknown> {
  const changes: Record<string, unknown> = Object.create(null);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!Object.hasOwn(after, key)) changes[key] = undefined;
    else if (!Object.hasOwn(before, key) || !equalValue(before[key], after[key])) changes[key] = after[key];
  }
  return changes;
}

export function conflictingProfileFields(base: Fields, latest: Fields, edits: Fields): string[] {
  return Object.keys(edits).filter(key => {
    const current = Object.hasOwn(latest, key) ? latest[key] : undefined;
    const previous = Object.hasOwn(base, key) ? base[key] : undefined;
    return !equalValue(current, previous) && !equalValue(current, edits[key]);
  });
}

function populated(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

type FieldChange = { key: string; before?: unknown; after?: unknown };

export function compareProfileEvents(before: EventData, after: EventData) {
  const previous = readProfileFields(before.content);
  const next = readProfileFields(after.content);
  const fields: FieldChange[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  let removed = 0;
  for (const key of keys) {
    const had = Object.hasOwn(previous, key);
    const has = Object.hasOwn(next, key);
    if (had && has && equalValue(previous[key], next[key])) continue;
    fields.push({ key, ...(had && { before: previous[key] }), ...(has && { after: next[key] }) });
    if (had && populated(previous[key]) && (!has || !populated(next[key]))) removed++;
  }
  const previousSize = Object.values(previous).filter(populated).length;
  const tagDiff = tagChanges(before.tags, after.tags);
  const massRemoval = (removed > 0 && Object.values(next).every(value => !populated(value))) ||
    (removed >= 3 && removed * 2 >= previousSize) ||
    (tagDiff.tagsRemoved.length >= 3 && tagDiff.tagsRemoved.length * 2 >= before.tags.length);
  return { fields, ...tagDiff, massRemoval };
}

function splitFollowTags(tags: Tags) {
  const follows = new Map<string, string[][]>();
  const other: string[][] = [];
  for (const tag of tags) {
    const pubkey = tag[1];
    if (tag[0] === 'p' && /^[a-f0-9]{64}$/.test(pubkey)) {
      const group = follows.get(pubkey);
      if (group) group.push([...tag]);
      else follows.set(pubkey, [[...tag]]);
    } else other.push([...tag]);
  }
  return { follows, other };
}

export function compareFollowEvents(before: EventData, after: EventData) {
  const previous = splitFollowTags(before.tags);
  const next = splitFollowTags(after.tags);
  const added = [...next.follows.keys()].filter(key => !previous.follows.has(key));
  const removed = [...previous.follows.keys()].filter(key => !next.follows.has(key));
  const changes: { pubkey: string; before: string[][]; after: string[][] }[] = [];
  for (const [key, tags] of next.follows) {
    const previousTags = previous.follows.get(key);
    if (previousTags && JSON.stringify(previousTags) !== JSON.stringify(tags)) {
      changes.push({ pubkey: key, before: previousTags, after: tags });
    }
  }
  const tagDiff = tagChanges(previous.other, next.other);
  const tagsReordered = !added.length && !removed.length && !changes.length &&
    !tagDiff.tagsAdded.length && !tagDiff.tagsRemoved.length && JSON.stringify(before.tags) !== JSON.stringify(after.tags);
  const massRemoval = (previous.follows.size > 0 && next.follows.size === 0) ||
    (removed.length >= 10 && removed.length * 2 >= previous.follows.size);
  return { added, removed, changed: changes.map(change => change.pubkey), changes, ...tagDiff, tagsReordered,
    contentChanged: before.content !== after.content, massRemoval };
}
