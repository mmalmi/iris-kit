import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IDENTITY_BOOTSTRAP_MODES,
  identityBootstrapAction,
  shouldAutoCreateIdentity,
  shouldPromptForIdentity,
} from './identityBootstrap.ts';

test('identity bootstrap exposes the supported app policies', () => {
  assert.deepEqual(IDENTITY_BOOTSTRAP_MODES, [
    'auto_create',
    'prompt_on_app_entry',
    'prompt_on_user_view',
  ]);
});

test('auto-create mode creates a missing identity on any bootstrap surface', () => {
  assert.equal(identityBootstrapAction({
    mode: 'auto_create',
    hasIdentity: false,
    surface: 'app_entry',
  }), 'create');
  assert.equal(identityBootstrapAction({
    mode: 'auto_create',
    hasIdentity: false,
    surface: 'user_view',
  }), 'create');
  assert.equal(shouldAutoCreateIdentity({
    mode: 'auto_create',
    hasIdentity: false,
    surface: 'user_view',
  }), true);
});

test('prompt modes only prompt on their configured surface', () => {
  assert.equal(identityBootstrapAction({
    mode: 'prompt_on_app_entry',
    hasIdentity: false,
    surface: 'app_entry',
  }), 'prompt');
  assert.equal(identityBootstrapAction({
    mode: 'prompt_on_app_entry',
    hasIdentity: false,
    surface: 'user_view',
  }), 'none');
  assert.equal(identityBootstrapAction({
    mode: 'prompt_on_user_view',
    hasIdentity: false,
    surface: 'user_view',
  }), 'prompt');
  assert.equal(identityBootstrapAction({
    mode: 'prompt_on_user_view',
    hasIdentity: false,
    surface: 'app_entry',
  }), 'none');
  assert.equal(shouldPromptForIdentity({
    mode: 'prompt_on_user_view',
    hasIdentity: false,
    surface: 'user_view',
  }), true);
});

test('bootstrap policy does nothing when an identity already exists', () => {
  for (const mode of IDENTITY_BOOTSTRAP_MODES) {
    assert.equal(identityBootstrapAction({
      mode,
      hasIdentity: true,
      surface: 'app_entry',
    }), 'none');
    assert.equal(identityBootstrapAction({
      mode,
      hasIdentity: true,
      surface: 'user_view',
    }), 'none');
  }
});
