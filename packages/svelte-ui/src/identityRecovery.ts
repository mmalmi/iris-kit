export type IdentityRecoveryMethod = 'nsec' | 'seed_phrase' | 'nip07' | 'nip46';

export interface IdentityRecoveryMethodOption {
  id: IdentityRecoveryMethod;
  label: string;
  icon: string;
}

export interface IdentityRecoveryRequest {
  method: IdentityRecoveryMethod;
  nsec?: string;
  seedWords?: string;
  seedPassphrase?: string;
  nip46Connection?: string;
  nip46Relay?: string;
}

export const IDENTITY_RECOVERY_METHODS: readonly IdentityRecoveryMethodOption[] = [
  { id: 'nip07', label: 'Browser extension', icon: 'i-lucide-plug' },
  { id: 'seed_phrase', label: 'Seed phrase', icon: 'i-lucide-list-ordered' },
  { id: 'nip46', label: 'Link device', icon: 'i-lucide-link' },
  { id: 'nsec', label: 'Secret key', icon: 'i-lucide-key-round' },
];

export function normalizeIdentityRecoveryRequest(
  request: IdentityRecoveryRequest,
): IdentityRecoveryRequest {
  const method = request.method;
  if (method === 'nsec') {
    return {
      method,
      nsec: requireTrimmed(request.nsec, 'secret key'),
    };
  }
  if (method === 'seed_phrase') {
    return {
      method,
      seedWords: normalizeSeedWords(request.seedWords),
      ...(request.seedPassphrase?.trim() ? { seedPassphrase: request.seedPassphrase } : {}),
    };
  }
  if (method === 'nip07') {
    return { method };
  }
  return {
    method,
    nip46Connection: requireTrimmed(request.nip46Connection, 'link device'),
    ...(request.nip46Relay?.trim() ? { nip46Relay: request.nip46Relay.trim() } : {}),
  };
}

export function identityRecoveryRequestHasInput(request: IdentityRecoveryRequest): boolean {
  try {
    normalizeIdentityRecoveryRequest(request);
    return true;
  } catch {
    return false;
  }
}

function normalizeSeedWords(value: string | undefined): string {
  return requireTrimmed(value, 'seed phrase').toLowerCase().replace(/\s+/g, ' ');
}

function requireTrimmed(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}
