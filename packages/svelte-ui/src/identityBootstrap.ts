export type IdentityBootstrapMode =
  | 'auto_create'
  | 'prompt_on_app_entry'
  | 'prompt_on_user_view';

export type IdentityBootstrapSurface = 'app_entry' | 'user_view';

export type IdentityBootstrapAction = 'none' | 'create' | 'prompt';

export interface IdentityBootstrapOptions {
  mode: IdentityBootstrapMode;
  hasIdentity: boolean;
  surface: IdentityBootstrapSurface;
}

export const IDENTITY_BOOTSTRAP_MODES: readonly IdentityBootstrapMode[] = [
  'auto_create',
  'prompt_on_app_entry',
  'prompt_on_user_view',
];

export function identityBootstrapAction(options: IdentityBootstrapOptions): IdentityBootstrapAction {
  if (options.hasIdentity) return 'none';
  if (options.mode === 'auto_create') return 'create';
  if (options.mode === 'prompt_on_app_entry' && options.surface === 'app_entry') return 'prompt';
  if (options.mode === 'prompt_on_user_view' && options.surface === 'user_view') return 'prompt';
  return 'none';
}

export function shouldAutoCreateIdentity(options: IdentityBootstrapOptions): boolean {
  return identityBootstrapAction(options) === 'create';
}

export function shouldPromptForIdentity(options: IdentityBootstrapOptions): boolean {
  return identityBootstrapAction(options) === 'prompt';
}
