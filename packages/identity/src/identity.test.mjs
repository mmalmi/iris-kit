import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, nip44 } from 'nostr-tools';
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
  removeIrisAppKeyFromProfile,
  selectLatestRepresentativeProfileEvent,
  signIrisProfileFacetAcceptance,
  signIrisProfileRosterOp,
  signerCanAttachAppKey,
  signerCanRemoveAppKey,
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
  assert.ok(event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'nostr_identity_roster_op'));
  assert.ok(event.tags.some((tag) => tag[0] === 'op' && tag[1] === 'add_key'));
  assert.ok(event.tags.some((tag) => tag[0] === 'key_pubkey' && tag[1] === admin));
  assert.ok(event.tags.some((tag) => tag[0] === 'key_capability' && tag[1] === 'admin'));
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
  assert.ok(event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'nostr_identity_key_acceptance'));
  assert.ok(event.tags.some((tag) => tag[0] === 'key_pubkey' && tag[1] === facet));
  assert.ok(event.tags.some((tag) => tag[0] === 'purpose' && tag[1] === 'app'));
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

test('signed non-admin roster additions are rejected by the neutral identity graph', () => {
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

  assert.deepEqual(projection.accepted_op_ids, [bootstrap.op_id, addDevice.op_id]);
  assert.deepEqual(projection.rejected_op_ids, [rogue.op_id]);
  assert.equal(projection.active_facets[other], undefined);
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
  const recoverySecret = generateSecretKey();
  const recovery = getPublicKey(recoverySecret);
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
  const addRecovery = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id],
    createdAt: 11,
    clientNonce: 'add-recovery-nsec',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: recovery,
        purposes: ['recovery_phrase'],
        capabilities: {
          can_recover_app_keys: true,
          can_decrypt_key_epochs: true,
        },
        added_at: 11,
        label: 'Recovery nsec',
      },
    },
  });
  const signer = createIrisIdentitySignerFromNsec(nip19.nsecEncode(recoverySecret));
  const rewrapCalls = [];
  const { attachment, session } = await createAttachedIrisIdentitySession({
    profileId,
    signer,
    rosterOps: [bootstrap, addRecovery],
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

  assert.equal(attachment.addedByPubkey, recovery);
  assert.equal(attachment.appKeyPubkey, getPublicKey(appKeySecretKey));
  assert.equal(attachment.appKeyNsec, nip19.nsecEncode(appKeySecretKey));
  assert.equal(attachment.rosterOp.signer_pubkey, recovery);
  assert.equal(attachment.rosterOp.content.op.facet.label, 'Browser AppKey');
  assert.equal(attachment.facetAcceptance.signer_pubkey, attachment.appKeyPubkey);
  assert.equal(attachment.facetAcceptance.content.roster_op_id, attachment.rosterOp.op_id);
  assert.equal(projection.active_facets[attachment.appKeyPubkey].capabilities?.can_write_roots, true);
  assert.equal(session.status, 'active');
  assert.equal(session.appKeyPubkey, attachment.appKeyPubkey);
  assert.equal(rewrapCalls.length, 1);
  assert.equal(rewrapCalls[0].existingRosterOps.length, 2);
  assert.equal(rewrapCalls[0].projectedRoster.active_facets[admin].capabilities?.can_admin_profile, true);
  assert.equal(rewrapCalls[0].projectedRoster.active_facets[recovery].capabilities?.can_recover_app_keys, true);
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

test('NIP-07 and NIP-46 recovery signers can attach an AppKey through the same flow', async () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const recoverySecret = generateSecretKey();
  const recovery = getPublicKey(recoverySecret);
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
    clientNonce: 'add-recovery-remote',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: recovery,
        purposes: ['nip46_signer'],
        capabilities: {
          can_recover_app_keys: true,
          can_decrypt_key_epochs: true,
        },
        added_at: 11,
      },
    },
  });
  const remoteSigner = {
    getPublicKey: async () => recovery,
    signEvent: async (draft) => finalizeEvent({
      ...draft,
      tags: draft.tags.map((tag) => tag.slice()),
    }, recoverySecret),
  };
  const nip07Attachment = await attachIrisAppKeyToProfile({
    profileId,
    signer: createIrisIdentitySignerFromNip07(remoteSigner),
    rosterOps: [bootstrap, addRecovery],
    appKeySecretKey: generateSecretKey(),
    createdAt: 70,
    clientNonce: 'nip07-attach',
  });
  const nip46Attachment = await attachIrisAppKeyToProfile({
    profileId,
    signer: createIrisIdentitySignerFromNip46(remoteSigner),
    rosterOps: [bootstrap, addRecovery],
    appKeySecretKey: generateSecretKey(),
    createdAt: 71,
    clientNonce: 'nip46-attach',
  });

  assert.equal(nip07Attachment.addedByPubkey, recovery);
  assert.equal(nip46Attachment.addedByPubkey, recovery);
  assert.equal(nip07Attachment.rosterOp.content.op.op, 'add_facet');
  assert.equal(nip46Attachment.rosterOp.content.op.op, 'add_facet');
});

test('recovery signers can remove AppKeys and run the secret rewrap hook', async () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const recoverySecret = generateSecretKey();
  const recovery = getPublicKey(recoverySecret);
  const appKeySecret = generateSecretKey();
  const appKey = getPublicKey(appKeySecret);
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
      },
    },
  });
  const addRecovery = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id],
    createdAt: 11,
    clientNonce: 'add-recovery',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: recovery,
        purposes: ['recovery_phrase'],
        capabilities: {
          can_recover_app_keys: true,
          can_receive_key_wraps: true,
          can_decrypt_key_epochs: true,
        },
        added_at: 11,
      },
    },
  });
  const addAppKey = signIrisProfileRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id, addRecovery.op_id],
    createdAt: 12,
    clientNonce: 'add-phone',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: appKey,
        purposes: ['app_key'],
        capabilities: {
          can_write_roots: true,
          can_receive_key_wraps: true,
          can_decrypt_key_epochs: true,
        },
        added_at: 12,
        label: 'Phone',
      },
    },
  });
  const rosterOps = [bootstrap, addRecovery, addAppKey];
  const projection = projectIrisProfileRoster(profileId, rosterOps);
  const hookCalls = [];

  assert.equal(signerCanRemoveAppKey(projection, recovery, appKey), true);
  assert.equal(signerCanRemoveAppKey(projection, appKey, admin), false);

  const removal = await removeIrisAppKeyFromProfile({
    profileId,
    signer: createIrisIdentitySignerFromNsec(nip19.nsecEncode(recoverySecret)),
    rosterOps,
    appKeyPubkey: appKey,
    createdAt: 13,
    clientNonce: 'remove-phone',
    reason: 'lost device',
    rewrapSecrets: (context) => {
      hookCalls.push(context);
      return [{
        secretId: 'drive-dck',
        status: 'rotated',
        epoch: 2,
      }];
    },
  });
  const afterRemoval = projectIrisProfileRoster(profileId, [...rosterOps, removal.rosterOp]);

  assert.equal(removal.removedByPubkey, recovery);
  assert.deepEqual(removal.rosterOp.content.op, {
    op: 'tombstone_facet',
    pubkey: appKey,
    reason: 'lost device',
  });
  assert.equal(afterRemoval.active_facets[appKey], undefined);
  assert.equal(afterRemoval.tombstones[appKey].removed_by_pubkey, recovery);
  assert.equal(hookCalls.length, 1);
  assert.equal(hookCalls[0].projectedRoster.active_facets[appKey], undefined);
  assert.equal(hookCalls[0].projectedRoster.tombstones[appKey].reason, 'lost device');
  assert.deepEqual(removal.rewrapResults, [{
    secretId: 'drive-dck',
    status: 'rotated',
    epoch: 2,
  }]);
  await assert.rejects(
    removeIrisAppKeyFromProfile({
      profileId,
      signer: createIrisIdentitySignerFromNsec(nip19.nsecEncode(appKeySecret)),
      rosterOps,
      appKeyPubkey: admin,
      createdAt: 14,
      clientNonce: 'writer-remove-admin',
    }),
    /not authorized to remove this AppKey/,
  );
});

test('recovery signers expose NIP-44 encryption when the underlying method can decrypt secrets', async () => {
  const senderSecret = generateSecretKey();
  const senderPubkey = getPublicKey(senderSecret);
  const recipientSecret = generateSecretKey();
  const recipientPubkey = getPublicKey(recipientSecret);
  const recipient = createIrisIdentitySignerFromNsec(nip19.nsecEncode(recipientSecret));
  const conversationKey = nip44.v2.utils.getConversationKey(senderSecret, recipientPubkey);
  const ciphertext = nip44.v2.encrypt('drive-content-key', conversationKey);

  assert.equal(await recipient.nip44Decrypt?.(senderPubkey, ciphertext), 'drive-content-key');
  const rewrapped = await recipient.nip44Encrypt?.(senderPubkey, 'drive-content-key');
  assert.equal(nip44.v2.decrypt(rewrapped, conversationKey), 'drive-content-key');

  const calls = [];
  const remote = createIrisIdentitySignerFromNip46({
    getPublicKey: async () => recipientPubkey,
    signEvent: async (draft) => finalizeEvent({
      ...draft,
      tags: draft.tags.map((tag) => tag.slice()),
    }, recipientSecret),
    nip44Encrypt: async (pubkey, plaintext) => {
      calls.push(['encrypt', pubkey, plaintext]);
      return 'remote-ciphertext';
    },
    nip44Decrypt: async (pubkey, encrypted) => {
      calls.push(['decrypt', pubkey, encrypted]);
      return 'remote-plaintext';
    },
  });

  assert.equal(await remote.nip44Decrypt?.(senderPubkey, 'remote-wrap'), 'remote-plaintext');
  assert.equal(await remote.nip44Encrypt?.(senderPubkey, 'remote-key'), 'remote-ciphertext');
  assert.deepEqual(calls, [
    ['decrypt', senderPubkey, 'remote-wrap'],
    ['encrypt', senderPubkey, 'remote-key'],
  ]);
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
