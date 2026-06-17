export interface ImgProxyConfig {
  url: string;
  key: string;
  salt: string;
}

export interface ImgProxyOptions {
  width?: number;
  height?: number;
  square?: boolean;
  dpr?: number;
}

export interface ImgProxySettings extends ImgProxyConfig {
  enabled: boolean;
  fallbackToOriginal: boolean;
}

export const IMGPROXY_SETTINGS_STORAGE_KEY = 'iris:imgproxy:v1';

export const DEFAULT_IMGPROXY_CONFIG: ImgProxyConfig = {
  url: 'https://imgproxy.iris.to',
  key: 'f66233cb160ea07078ff28099bfa3e3e654bc10aa4a745e12176c433d79b8996',
  salt: '5e608e60945dcd2a787e8465d76ba34149894765061d39287609fb9d776caa0c',
};

export const DEFAULT_IMGPROXY_SETTINGS: ImgProxySettings = {
  ...DEFAULT_IMGPROXY_CONFIG,
  enabled: true,
  fallbackToOriginal: false,
};

export type ImgProxySettingsInput = Partial<ImgProxySettings> | null | undefined;

export function normalizeImgProxySettings(input: ImgProxySettingsInput = null): ImgProxySettings {
  return {
    url: readText(input?.url) || DEFAULT_IMGPROXY_CONFIG.url,
    key: readText(input?.key) || DEFAULT_IMGPROXY_CONFIG.key,
    salt: readText(input?.salt) || DEFAULT_IMGPROXY_CONFIG.salt,
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : DEFAULT_IMGPROXY_SETTINGS.enabled,
    fallbackToOriginal: typeof input?.fallbackToOriginal === 'boolean'
      ? input.fallbackToOriginal
      : DEFAULT_IMGPROXY_SETTINGS.fallbackToOriginal,
  };
}

export function loadImgProxySettings(
  storage: Pick<Storage, 'getItem'> | null | undefined = defaultStorage(),
  key = IMGPROXY_SETTINGS_STORAGE_KEY,
): ImgProxySettings {
  if (!storage) return DEFAULT_IMGPROXY_SETTINGS;
  try {
    return normalizeImgProxySettings(JSON.parse(storage.getItem(key) || 'null') as ImgProxySettingsInput);
  } catch {
    return DEFAULT_IMGPROXY_SETTINGS;
  }
}

export function saveImgProxySettings(
  settings: ImgProxySettingsInput,
  storage: Pick<Storage, 'setItem'> | null | undefined = defaultStorage(),
  key = IMGPROXY_SETTINGS_STORAGE_KEY,
): ImgProxySettings {
  const normalized = normalizeImgProxySettings(settings);
  storage?.setItem(key, JSON.stringify(normalized));
  return normalized;
}

export async function resolveImgProxyUrl(
  originalSrc: string,
  options: ImgProxyOptions = {},
  settings: ImgProxySettingsInput | false = null,
): Promise<string> {
  if (settings === false) return originalSrc;
  const proxySettings = normalizeImgProxySettings(settings ?? loadImgProxySettings());
  if (!proxySettings.enabled) return originalSrc;
  return generateProxyUrl(originalSrc, options, proxySettings);
}

export async function generateProxyUrl(
  originalSrc: string,
  options: ImgProxyOptions = {},
  config: ImgProxyConfig = DEFAULT_IMGPROXY_CONFIG,
): Promise<string> {
  const src = originalSrc.trim();
  if (!src || shouldSkipProxy(src, config)) return originalSrc;

  try {
    new URL(src);
  } catch {
    return originalSrc;
  }

  try {
    const encodedUrl = urlSafeBase64(new TextEncoder().encode(src));
    const path = `/${buildImgProxyOptions(options).join('/')}/${encodedUrl}`;
    const signature = await signUrl(path, config.key, config.salt);
    return `${config.url.replace(/\/$/, '')}/${signature}${path}`;
  } catch {
    return originalSrc;
  }
}

export const generateImgProxyUrl = generateProxyUrl;

function buildImgProxyOptions(options: ImgProxyOptions): string[] {
  const opts: string[] = [];
  if (options.width || options.height) {
    const resizeType = options.square ? 'fill' : 'fit';
    const width = positiveInteger(options.width) || positiveInteger(options.height) || 0;
    const height = positiveInteger(options.height) || positiveInteger(options.width) || 0;
    if (width > 0 || height > 0) opts.push(`rs:${resizeType}:${width}:${height}`);
  }
  opts.push(`dpr:${positiveInteger(options.dpr) || 2}`);
  return opts;
}

function shouldSkipProxy(src: string, config: ImgProxyConfig): boolean {
  return src.startsWith(config.url)
    || src.startsWith('data:')
    || src.startsWith('blob:')
    || src.startsWith('/');
}

async function signUrl(path: string, key: string, salt: string): Promise<string> {
  const data = concatBytes(hexToBytes(salt), new TextEncoder().encode(path));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    hexToBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return urlSafeBase64(new Uint8Array(signature));
}

function urlSafeBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...arrays: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(new ArrayBuffer(arrays.reduce((sum, array) => sum + array.length, 0)));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
