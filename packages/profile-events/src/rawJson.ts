const tokenPattern = /"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[\[\]{},:]/g;

interface ObjectLevel {
  keys: Set<string>;
  expectingKey: boolean;
}

/** Validate the JSON grammar and reject ambiguous duplicate members, including nested ones. */
export function validateJsonValue(raw: string): string {
  if (typeof raw !== 'string') throw Error('Expected a JSON value.');
  JSON.parse(raw);
  const levels: (ObjectLevel | null)[] = [];
  for (const {0: token} of raw.matchAll(tokenPattern)) {
    const level = levels.at(-1);
    if (level && level.expectingKey && token.startsWith('"')) {
      const key = JSON.parse(token) as string;
      if (level.keys.has(key)) throw Error('JSON contains a duplicate field name.');
      level.keys.add(key);
      level.expectingKey = false;
    } else if (token === '{') levels.push({keys: new Set(), expectingKey: true});
    else if (token === '[') levels.push(null);
    else if (token === '}' || token === ']') levels.pop();
    else if (token === ',' && level) level.expectingKey = true;
  }
  return raw.trim();
}

// A normalized coefficient and decimal exponent describe the exact mathematical
// value. Never expand an exponent or pass the coefficient through a JS number.
function exactNumber(token: string): string {
  const [mantissa, exponent = '0'] = token.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const [whole, fraction = ''] = (negative ? mantissa.slice(1) : mantissa).split('.');
  const digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const coefficient = digits.replace(/0+$/, '');
  const power = BigInt(exponent) + BigInt(digits.length - coefficient.length - fraction.length);
  return (negative ? '-' : '') + coefficient + 'e' + power;
}

function comparable(raw: string): unknown {
  validateJsonValue(raw);
  // Give every JSON string and number a separate prefix, including escaped
  // strings. JSON.parse then supplies the actual array and object structure.
  const encoded = raw.replace(tokenPattern, token => {
    if (token.startsWith('"')) return '"s' + token.slice(1);
    if (/^[-0-9]/.test(token)) return JSON.stringify('n' + exactNumber(token));
    return token;
  });
  return JSON.parse(encoded);
}

export function equalValue(left: unknown, right: unknown): boolean {
  const pairs: [unknown, unknown][] = [[left, right]];
  while (pairs.length) {
    const [a, b] = pairs.pop()!;
    if (a === b) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const first = a as Record<string, unknown>, second = b as Record<string, unknown>;
    const keys = Object.keys(first);
    if (keys.length !== Object.keys(second).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(second, key)) return false;
      pairs.push([first[key], second[key]]);
    }
  }
  return true;
}

/** Compare exact JSON values. Object order and alternative decimal spellings are immaterial. */
export function equalJsonValues(left: string, right: string): boolean {
  if (left === right) { validateJsonValue(left); return true; }
  return equalValue(comparable(left), comparable(right));
}
