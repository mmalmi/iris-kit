import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import {
  approveDeviceLinkRequest,
  createDeviceLinkRequest,
  createLocalIrisIdentitySession,
  createPendingDeviceLinkSession,
  encodeDeviceLinkInvite,
  isCompleteDeviceLinkInviteInput,
  parseDeviceLinkInvite,
  projectIrisProfileRoster,
  representativeProfileAuthors,
  selectLatestRepresentativeProfileEvent,
  signIrisProfileRosterOp,
  restoreIrisIdentitySession,
  serializeIrisIdentitySession,
} from './index.ts';

const profileId = '019ed693-4110-7352-8cc3-be90158ba91e';

test('device link invite round trips profile, admin AppKey, and secret', () => {
  const admin = getPublicKey(generateSecretKey());
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
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const device = getPublicKey(generateSecretKey());
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: admin,
        purposes: ['app_key'],
        capabilities: {
          can_write_roots: true,
          can_admin_profile: true,
          can_receive_key_wraps: true,
          can_decrypt_key_epochs: true,
        },
        added_at: 10,
        label: 'Laptop',
      },
    },
  });
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
  const approvalContent = approveDeviceLinkRequest({
    request,
    rosterOps: [bootstrap],
    approvedByPubkey: admin,
    approvedAt: 12,
    clientNonce: 'approve-phone',
  });
  const approval = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: approvalContent.parents,
    createdAt: approvalContent.created_at,
    clientNonce: approvalContent.client_nonce,
    op: approvalContent.op,
  });

  const projection = projectIrisProfileRoster(profileId, [approval, bootstrap]);

  assert.deepEqual(projection.accepted_op_ids, [bootstrap.op_id, approval.op_id]);
  assert.equal(projection.active_facets[admin].capabilities?.can_admin_profile, true);
  assert.equal(projection.active_facets[device].label, 'Phone');
  assert.equal(projection.active_facets[device].capabilities?.can_write_roots, true);
});

test('signed non-admin roster additions remain projectable for current web compatibility', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const deviceSecret = generateSecretKey();
  const device = getPublicKey(deviceSecret);
  const other = getPublicKey(generateSecretKey());
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: admin,
        purposes: ['app_key'],
        capabilities: { can_write_roots: true, can_admin_profile: true },
        added_at: 10,
      },
    },
  });
  const addDevice = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id],
    createdAt: 11,
    clientNonce: 'device',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: device,
        purposes: ['app_key'],
        capabilities: { can_write_roots: true },
        added_at: 11,
      },
    },
  });
  const rogue = signIrisProfileRosterOp({
    signerSecretKey: deviceSecret,
    profileId,
    parents: [bootstrap.op_id, addDevice.op_id],
    createdAt: 12,
    clientNonce: 'rogue',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: other,
        purposes: ['app_key'],
        capabilities: { can_write_roots: true },
        added_at: 12,
      },
    },
  });

  const projection = projectIrisProfileRoster(profileId, [bootstrap, addDevice, rogue]);

  assert.deepEqual(projection.accepted_op_ids, [bootstrap.op_id, addDevice.op_id, rogue.op_id]);
  assert.deepEqual(projection.rejected_op_ids, []);
});

test('representative profile uses latest kind 0 event from active identity authors', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const social = getPublicKey(generateSecretKey());
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: admin,
        purposes: ['app_key'],
        capabilities: { can_write_roots: true, can_admin_profile: true },
        added_at: 10,
      },
    },
  });
  const addSocial = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id],
    createdAt: 11,
    clientNonce: 'social',
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

test('local identity session creates a UUID profile with an active AppKey', () => {
  const appKeySecretKey = generateSecretKey();
  const session = createLocalIrisIdentitySession({
    profileId,
    appKeySecretKey,
    createdAt: 42,
    clientNonce: 'session-bootstrap',
    label: 'Browser',
  });
  const restored = restoreIrisIdentitySession(serializeIrisIdentitySession(session));
  const projection = projectIrisProfileRoster(restored.profileId, restored.rosterOps);

  assert.equal(restored.profileId, profileId);
  assert.equal(restored.appKeyPubkey, getPublicKey(appKeySecretKey));
  assert.equal(restored.status, 'active');
  assert.equal(projection.active_facets[restored.appKeyPubkey].label, 'Browser');
});

test('pending device-link session keeps invite identity and request material', () => {
  const admin = getPublicKey(generateSecretKey());
  const invite = encodeDeviceLinkInvite({
    profileId,
    adminAppKeyPubkey: admin,
    linkSecret: 'join-secret',
  });
  const session = createPendingDeviceLinkSession({
    invite,
    appKeySecretKey: generateSecretKey(),
    requestedAt: 43,
    label: 'New browser',
  });

  assert.equal(session.profileId, profileId);
  assert.equal(session.status, 'pending_device_link');
  assert.equal(session.pendingDeviceLink?.adminAppKeyPubkey, admin);
  assert.equal(session.pendingDeviceLink?.deviceAppKeyPubkey, session.appKeyPubkey);
});
