import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { generateSeedWords } from 'nostr-tools/nip06';
import {
  attachIrisAppKeyToProfile,
  approveDeviceLinkRequest,
  createAttachedIrisIdentitySession,
  createDeviceLinkRequest,
  createIrisIdentitySignerFromNip07,
  createIrisIdentitySignerFromNip46,
  createIrisIdentitySignerFromNsec,
  createIrisIdentitySignerFromSeedPhrase,
  createLocalIrisIdentitySession,
  createPendingDeviceLinkSession,
  encodeDeviceLinkInvite,
  isCompleteDeviceLinkInviteInput,
  KIND_IRIS_PROFILE_FACET_ACCEPTANCE,
  KIND_IRIS_PROFILE_ROSTER_OP,
  parseDeviceLinkInvite,
  projectIrisProfileRoster,
  representativeProfileAuthors,
  selectLatestRepresentativeProfileEvent,
  signIrisProfileFacetAcceptance,
  signIrisProfileRosterOp,
  signerCanAttachAppKey,
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

  assert.equal(inviteUrl.startsWith('https://drive.iris.to/invite/'), true);
  assert.deepEqual(parsed, {
    profileId,
    adminAppKeyPubkey: admin,
    linkSecret: 'join-secret',
  });
  assert.equal(isCompleteDeviceLinkInviteInput(inviteUrl), true);
});

test('device link invites are drive.iris.to links, not custom-scheme links', () => {
  const admin = getPublicKey(generateSecretKey());
  const inviteUrl = encodeDeviceLinkInvite({
    profileId,
    adminAppKeyPubkey: admin,
    linkSecret: 'join-secret',
  });
  const legacyUrl = inviteUrl.replace('https://drive.iris.to/invite/', 'iris-drive://invite/');

  assert.equal(inviteUrl.startsWith('https://drive.iris.to/invite/'), true);
  assert.equal(parseDeviceLinkInvite(legacyUrl), null);
  assert.equal(isCompleteDeviceLinkInviteInput(legacyUrl), false);
});

test('device link parser accepts current native HTTPS invite payloads', () => {
  const inviteUrl = 'https://drive.iris.to/invite/eyJ2IjoxLCJwcm9maWxlSWQiOiIzYzA4OWRmOC0yMjFlLTQ3M2MtOTFlYy1mNzcxYzAxNWM4YmQiLCJhZG1pbkFwcEtleU5wdWIiOiJucHViMXE1bDB2bmVhamg2Mjg5dmduZ3N3dTV3bTI2cWFtc2p3dHlqajJncWxwa3VqNXptZGVkeXMweTZtdDciLCJsaW5rU2VjcmV0IjoiazV3NUpMR2hUQ09sSWdPQUtpRnUtUSJ9';

  assert.deepEqual(parseDeviceLinkInvite(inviteUrl), {
    profileId: '3c089df8-221e-473c-91ec-f771c015c8bd',
    adminAppKeyPubkey: '053ef64f3d95f4a395889a20ee51db5681ddc24e592525201f0db92a0b6dcb49',
    linkSecret: 'k5w5JLGhTCOlIgOAKiFu-Q',
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

test('roster ops are signed fact events', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const signed = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'fact-bootstrap',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: admin,
        purposes: ['app_key'],
        capabilities: { can_write_roots: true, can_admin_profile: true },
        added_at: 10,
        label: 'Laptop',
      },
    },
  });
  const event = JSON.parse(signed.event_json);

  assert.equal(event.kind, KIND_IRIS_PROFILE_ROSTER_OP);
  assert.equal(event.content, '');
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'i' && tag[2] === 'subject'), ['i', profileId, 'subject']);
  assert.ok(event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'iris_profile_roster_op'));
  assert.ok(event.tags.some((tag) => tag[0] === 'op' && tag[1] === 'add_facet'));
  assert.ok(event.tags.some((tag) => tag[0] === 'facet_pubkey' && tag[1] === admin));
  assert.ok(event.tags.some((tag) => tag[0] === 'facet_capability' && tag[1] === 'can_admin_profile'));
  assert.equal(signed.content.op.op, 'add_facet');
  assert.equal(signed.content.op.facet.label, 'Laptop');
});

test('facet acceptances are signed fact events', () => {
  const facetSecret = generateSecretKey();
  const facet = getPublicKey(facetSecret);
  const acceptance = signIrisProfileFacetAcceptance({
    signerSecretKey: facetSecret,
    profileId,
    purposes: ['app_key'],
    rosterOpId: 'a'.repeat(64),
    acceptedAt: 44,
    clientNonce: 'accept-app-key',
  });
  const event = JSON.parse(acceptance.event_json);

  assert.equal(event.kind, KIND_IRIS_PROFILE_FACET_ACCEPTANCE);
  assert.equal(event.content, '');
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'i' && tag[2] === 'subject'), ['i', profileId, 'subject']);
  assert.ok(event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'iris_profile_facet_acceptance'));
  assert.ok(event.tags.some((tag) => tag[0] === 'facet_pubkey' && tag[1] === facet));
  assert.ok(event.tags.some((tag) => tag[0] === 'purpose' && tag[1] === 'app_key'));
  assert.equal(acceptance.content.roster_op_id, 'a'.repeat(64));
});

test('fact roster ops round trip all roster mutation shapes', () => {
  const adminSecret = generateSecretKey();
  const device = getPublicKey(generateSecretKey());
  const parent = 'b'.repeat(64);
  const cases = [
    {
      op: { op: 'tombstone_facet', pubkey: device, reason: 'lost device' },
      expected: { op: 'tombstone_facet', pubkey: device, reason: 'lost device' },
    },
    {
      op: {
        op: 'set_capabilities',
        pubkey: device,
        capabilities: { can_write_roots: true, can_receive_key_wraps: true },
      },
      expected: {
        op: 'set_capabilities',
        pubkey: device,
        capabilities: { can_write_roots: true, can_receive_key_wraps: true },
      },
    },
    {
      op: { op: 'rotate_key_epoch', epoch: 2, wrapped_dck: { [device]: 'wrap-device' } },
      expected: { op: 'rotate_key_epoch', epoch: 2, wrapped_dck: { [device]: 'wrap-device' } },
    },
    {
      op: { op: 'repair_key_wraps', epoch: 2, wrapped_dck: { [device]: 'wrap-device-again' } },
      expected: { op: 'repair_key_wraps', epoch: 2, wrapped_dck: { [device]: 'wrap-device-again' } },
    },
  ];

  for (const [index, { op, expected }] of cases.entries()) {
    const signed = signIrisProfileRosterOp({
      signerSecretKey: adminSecret,
      profileId,
      parents: [parent],
      createdAt: 100 + index,
      clientNonce: `fact-op-${index}`,
      op,
    });

    assert.deepEqual(signed.content.parents, [parent]);
    assert.deepEqual(signed.content.op, expected);
  }
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

test('nsec login attaches a new AppKey and runs the secret rewrap hook', async () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const appKeySecretKey = generateSecretKey();
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap-admin',
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
        label: 'Existing browser',
      },
    },
  });
  const signer = createIrisIdentitySignerFromNsec(nip19.nsecEncode(adminSecret));
  const rewrapCalls = [];
  const { attachment, session } = await createAttachedIrisIdentitySession({
    profileId,
    signer,
    rosterOps: [bootstrap],
    appKeySecretKey,
    createdAt: 50,
    clientNonce: 'attach-browser',
    label: 'Browser AppKey',
    rewrapSecrets: (context) => {
      rewrapCalls.push(context);
      return [{
        secretId: 'drive-dck',
        status: 'rewrapped',
        epoch: 1,
        wrappedForAppKey: `wrap:${context.appKeyPubkey}`,
      }];
    },
  });
  const projection = projectIrisProfileRoster(profileId, session.rosterOps);

  assert.equal(attachment.addedByPubkey, admin);
  assert.equal(attachment.appKeyPubkey, getPublicKey(appKeySecretKey));
  assert.equal(attachment.appKeyNsec, nip19.nsecEncode(appKeySecretKey));
  assert.equal(attachment.rosterOp.signer_pubkey, admin);
  assert.equal(attachment.rosterOp.content.op.facet.label, 'Browser AppKey');
  assert.equal(attachment.facetAcceptance.signer_pubkey, attachment.appKeyPubkey);
  assert.equal(attachment.facetAcceptance.content.roster_op_id, attachment.rosterOp.op_id);
  assert.equal(projection.active_facets[attachment.appKeyPubkey].capabilities?.can_write_roots, true);
  assert.equal(session.status, 'active');
  assert.equal(session.appKeyPubkey, attachment.appKeyPubkey);
  assert.equal(rewrapCalls.length, 1);
  assert.equal(rewrapCalls[0].existingRosterOps.length, 1);
  assert.equal(rewrapCalls[0].projectedRoster.active_facets[admin].capabilities?.can_admin_profile, true);
  assert.deepEqual(attachment.rewrapResults, [{
    secretId: 'drive-dck',
    status: 'rewrapped',
    epoch: 1,
    wrappedForAppKey: `wrap:${attachment.appKeyPubkey}`,
  }]);
});

test('seed phrase recovery login can attach a new AppKey', async () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const seedSigner = createIrisIdentitySignerFromSeedPhrase({
    seedWords: generateSeedWords(),
  });
  const recoveryPubkey = await seedSigner.getPublicKey();
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap-admin',
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
  const addRecovery = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id],
    createdAt: 11,
    clientNonce: 'add-recovery-phrase',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: recoveryPubkey,
        purposes: ['recovery_phrase'],
        capabilities: { can_recover_app_keys: true },
        added_at: 11,
        label: 'Recovery phrase',
      },
    },
  });
  const attachment = await attachIrisAppKeyToProfile({
    profileId,
    signer: seedSigner,
    rosterOps: [bootstrap, addRecovery],
    appKeySecretKey: generateSecretKey(),
    createdAt: 60,
    clientNonce: 'seed-attach',
  });
  const projection = projectIrisProfileRoster(profileId, [bootstrap, addRecovery, attachment.rosterOp]);

  assert.equal(attachment.addedByPubkey, recoveryPubkey);
  assert.equal(attachment.rosterOp.signer_pubkey, recoveryPubkey);
  assert.equal(attachment.rosterOp.content.op.facet.purposes[0], 'app_key');
  assert.equal(projection.active_facets[attachment.appKeyPubkey].capabilities?.can_write_roots, true);
});

test('NIP-07 and NIP-46 signers can attach an AppKey through the same flow', async () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap-admin',
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
  const remoteSigner = {
    getPublicKey: async () => admin,
    signEvent: async (draft) => finalizeEvent({
      ...draft,
      tags: draft.tags.map((tag) => tag.slice()),
    }, adminSecret),
  };
  const nip07Attachment = await attachIrisAppKeyToProfile({
    profileId,
    signer: createIrisIdentitySignerFromNip07(remoteSigner),
    rosterOps: [bootstrap],
    appKeySecretKey: generateSecretKey(),
    createdAt: 70,
    clientNonce: 'nip07-attach',
  });
  const nip46Attachment = await attachIrisAppKeyToProfile({
    profileId,
    signer: createIrisIdentitySignerFromNip46(remoteSigner),
    rosterOps: [bootstrap],
    appKeySecretKey: generateSecretKey(),
    createdAt: 71,
    clientNonce: 'nip46-attach',
  });

  assert.equal(nip07Attachment.addedByPubkey, admin);
  assert.equal(nip46Attachment.addedByPubkey, admin);
  assert.equal(nip07Attachment.rosterOp.content.op.op, 'add_facet');
  assert.equal(nip46Attachment.rosterOp.content.op.op, 'add_facet');
});

test('AppKey attach rejects signers without admin or recovery capability', async () => {
  const existingSecret = generateSecretKey();
  const existingPubkey = getPublicKey(existingSecret);
  const bootstrap = signIrisProfileRosterOp({
    signerSecretKey: existingSecret,
    profileId,
    createdAt: 10,
    clientNonce: 'bootstrap-writer-only',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: existingPubkey,
        purposes: ['app_key'],
        capabilities: { can_write_roots: true },
        added_at: 10,
      },
    },
  });
  const projection = projectIrisProfileRoster(profileId, [bootstrap]);

  assert.equal(signerCanAttachAppKey(projection, existingPubkey), false);
  await assert.rejects(
    attachIrisAppKeyToProfile({
      profileId,
      signer: createIrisIdentitySignerFromNsec(nip19.nsecEncode(existingSecret)),
      rosterOps: [bootstrap],
      appKeySecretKey: generateSecretKey(),
      createdAt: 80,
      clientNonce: 'writer-only-attach',
    }),
    /not authorized to attach AppKeys/,
  );
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
