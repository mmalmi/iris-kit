import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APP_KEY_ADMIN_CAPABILITIES,
  approveDeviceLinkRequest,
  createBootstrapRosterOp,
  createDeviceLinkRequest,
  encodeDeviceLinkInvite,
  isCompleteDeviceLinkInviteInput,
  parseDeviceLinkInvite,
  projectIrisProfileRoster,
  representativeProfileAuthors,
  selectLatestRepresentativeProfileEvent,
} from './index.ts';

const profileId = '019ed693-4110-7352-8cc3-be90158ba91e';
const admin = '0'.repeat(63) + '1';
const device = '0'.repeat(63) + '2';

function signed(content, id, signer = content.actor_pubkey) {
  return {
    op_id: id,
    signer_pubkey: signer,
    content,
  };
}

test('device link invite round trips profile, admin AppKey, and secret', () => {
  const inviteUrl = encodeDeviceLinkInvite({
    profileId,
    adminAppKeyPubkey: admin,
    linkSecret: ' join-secret ',
  });
  const parsed = parseDeviceLinkInvite(inviteUrl);

  assert.equal(inviteUrl.startsWith('iris-drive://invite/'), true);
  assert.deepEqual(parsed, {
    profileId,
    adminAppKeyPubkey: admin,
    linkSecret: 'join-secret',
  });
  assert.equal(isCompleteDeviceLinkInviteInput(inviteUrl), true);
});

test('admin approval projects the requested device as an AppKey facet', () => {
  const bootstrap = signed(createBootstrapRosterOp({
    profileId,
    adminAppKeyPubkey: admin,
    createdAt: 10,
    clientNonce: 'bootstrap',
    label: 'Laptop',
  }), 'op-bootstrap');
  const invite = parseDeviceLinkInvite(encodeDeviceLinkInvite({
    profileId,
    adminAppKeyPubkey: admin,
    linkSecret: 'join-secret',
  }));
  assert.ok(invite);
  const request = createDeviceLinkRequest({
    invite,
    deviceAppKeyPubkey: device,
    requestedAt: 11,
    label: 'Phone',
  });
  const approval = signed(approveDeviceLinkRequest({
    request,
    rosterOps: [bootstrap],
    approvedByPubkey: admin,
    approvedAt: 12,
    clientNonce: 'approve-phone',
  }), 'op-approve-phone');

  const projection = projectIrisProfileRoster(profileId, [approval, bootstrap]);

  assert.deepEqual(projection.accepted_op_ids, ['op-bootstrap', 'op-approve-phone']);
  assert.equal(projection.active_facets[admin].capabilities?.can_admin_profile, true);
  assert.equal(projection.active_facets[device].label, 'Phone');
  assert.equal(projection.active_facets[device].capabilities?.can_write_roots, true);
});

test('non-admin roster additions are rejected', () => {
  const bootstrap = signed(createBootstrapRosterOp({
    profileId,
    adminAppKeyPubkey: admin,
    createdAt: 10,
    clientNonce: 'bootstrap',
    capabilities: APP_KEY_ADMIN_CAPABILITIES,
  }), 'op-bootstrap');
  const rogue = signed({
    schema: 1,
    profile_id: profileId,
    actor_pubkey: device,
    client_nonce: 'rogue',
    created_at: 11,
    op: {
      op: 'add_facet',
      facet: {
        pubkey: '0'.repeat(63) + '3',
        purposes: ['app_key'],
        capabilities: { can_write_roots: true },
        added_at: 11,
      },
    },
  }, 'op-rogue');

  const projection = projectIrisProfileRoster(profileId, [bootstrap, rogue]);

  assert.deepEqual(projection.accepted_op_ids, ['op-bootstrap']);
  assert.deepEqual(projection.rejected_op_ids, ['op-rogue']);
});

test('representative profile uses latest kind 0 event from active identity authors', () => {
  const social = '0'.repeat(63) + '4';
  const bootstrap = signed(createBootstrapRosterOp({
    profileId,
    adminAppKeyPubkey: admin,
    createdAt: 10,
    clientNonce: 'bootstrap',
  }), 'op-bootstrap');
  const addSocial = signed({
    schema: 1,
    profile_id: profileId,
    actor_pubkey: admin,
    client_nonce: 'social',
    created_at: 11,
    op: {
      op: 'add_facet',
      facet: {
        pubkey: social,
        purposes: ['social_profile'],
        capabilities: {},
        added_at: 11,
      },
    },
  }, 'op-social');
  const projection = projectIrisProfileRoster(profileId, [bootstrap, addSocial]);

  assert.deepEqual(representativeProfileAuthors(projection), [admin, social].sort());
  const selected = selectLatestRepresentativeProfileEvent(projection, [
    { kind: 0, pubkey: social, created_at: 12, content: '{"name":"Old"}' },
    { kind: 0, pubkey: admin, created_at: 20, content: '{"name":"Fresh"}' },
    { kind: 1, pubkey: social, created_at: 30, content: 'not a profile' },
  ]);

  assert.equal(selected?.pubkey, admin);
  assert.equal(selected?.profile.name, 'Fresh');
});
