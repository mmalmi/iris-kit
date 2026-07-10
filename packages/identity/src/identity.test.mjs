import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, nip44 } from 'nostr-tools';
import { generateSeedWords } from 'nostr-tools/nip06';
import {
  APP_KEY_ADMIN_CAPABILITIES,
  approveDeviceApprovalBootstrap,
  attachNostrAppKeyToIdentity,
  buildDeviceApprovalReceiptEvent,
  completePendingDeviceApprovalSession,
  createAttachedNostrIdentitySession,
  createDeviceApprovalBootstrap,
  createNostrIdentitySignerFromNip07,
  createNostrIdentitySignerFromNip46,
  createNostrIdentitySignerFromNsec,
  createNostrIdentitySignerFromSeedPhrase,
  createLocalNostrIdentitySession,
  createPendingDeviceApprovalSession,
  DEVICE_APPROVAL_BOOTSTRAP_PREFIX,
  deviceApprovalBootstrapHasPrefix,
  encodeDeviceApprovalBootstrap,
  isCompleteDeviceApprovalBootstrapInput,
  KIND_NOSTR_IDENTITY_FACET_ACCEPTANCE,
  KIND_NOSTR_IDENTITY_ROSTER_OP,
  NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH,
  NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES,
  parseDeviceApprovalReceiptEvent,
  parseDeviceApprovalReceiptRosterOp,
  parseDeviceApprovalBootstrap,
  clearNostrIdentitySession,
  loadNostrIdentitySession,
  nostrIdentitySessionRosterEvents,
  projectNostrIdentityRoster,
  publishNostrIdentitySessionRosterEvents,
  representativeProfileAuthors,
  removeNostrAppKeyFromIdentity,
  selectLatestRepresentativeProfileEvent,
  saveNostrIdentitySession,
  signNostrIdentityFacetAcceptance,
  signNostrIdentityRosterOp,
  signerCanAttachAppKey,
  signerCanRemoveAppKey,
  restoreNostrIdentitySession,
  rosterOpMatchesDeviceApprovalReceipt,
  serializeNostrIdentitySession,
} from './index.ts';

const profileId = '019ed693-4110-7352-8cc3-be90158ba91e';

function decodeDeviceApprovalBootstrap(uri) {
  const prefix = 'https://drive.iris.to/approve-device/';
  return JSON.parse(Buffer.from(uri.slice(prefix.length), 'base64url').toString('utf8'));
}

function encodeApprovalPayload(payload) {
  return `https://drive.iris.to/approve-device/${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

test('device approval QR is the approval input and only the receipt is transported', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const deviceSecret = generateSecretKey();
  const device = getPublicKey(deviceSecret);
  const requestSecretKey = generateSecretKey();
  const requestPubkey = getPublicKey(requestSecretKey);
  const adminBootstrap = signNostrIdentityRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 20,
    clientNonce: 'approval-bootstrap',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: admin,
        purposes: ['app_key'],
        capabilities: {
          can_write_roots: true,
          can_admin_profile: true,
          can_receive_secret_wraps: true,
          can_decrypt_secret_epochs: true,
        },
        added_at: 20,
      },
    },
  });
  const local = createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: deviceSecret,
    requestSecretKey,
    label: 'Phone',
  });
  const { bootstrap } = local;
  const requestUrl = encodeDeviceApprovalBootstrap(bootstrap);

  assert.equal(requestUrl.startsWith('https://drive.iris.to/approve-device/'), true);
  assert.equal(requestUrl.length < NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH, true);
  assert.deepEqual(decodeDeviceApprovalBootstrap(requestUrl), {
    deviceAppKeyNpub: nip19.npubEncode(device),
    requestNpub: nip19.npubEncode(requestPubkey),
    requestSecret: bootstrap.requestSecret,
    label: 'Phone',
  });
  assert.equal(isCompleteDeviceApprovalBootstrapInput(requestUrl), true);
  assert.equal(deviceApprovalBootstrapHasPrefix(requestUrl), true);
  assert.deepEqual(parseDeviceApprovalBootstrap(requestUrl), bootstrap);

  const approvalContent = approveDeviceApprovalBootstrap({
    bootstrap: parseDeviceApprovalBootstrap(requestUrl),
    profileId,
    rosterOps: [adminBootstrap],
    approvedByPubkey: admin,
    approvedAt: 22,
    clientNonce: 'approve-device-full-flow',
  });
  const approval = signNostrIdentityRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: approvalContent.parents,
    createdAt: approvalContent.created_at,
    clientNonce: approvalContent.client_nonce,
    op: approvalContent.op,
  });
  const receiptEvent = buildDeviceApprovalReceiptEvent({
    signerSecretKey: adminSecret,
    bootstrap,
    profileId,
    approvedAt: 22,
    subjectPubkey: admin,
    rosterOpEvent: approval,
  });
  const receipt = parseDeviceApprovalReceiptEvent(receiptEvent, {
    requestSecretKey,
    bootstrap,
    profileId,
    approvedByPubkey: admin,
  });
  assert.throws(
    () => parseDeviceApprovalReceiptEvent(receiptEvent, {
      requestSecretKey,
      bootstrap: {
        ...bootstrap,
        requestSecret: Buffer.alloc(32, 8).toString('base64url'),
      },
      profileId,
      approvedByPubkey: admin,
    }),
    /receipt secret mismatch/,
  );
  const receiptRosterOp = parseDeviceApprovalReceiptRosterOp(receipt);
  const projection = projectNostrIdentityRoster(profileId, [adminBootstrap, receiptRosterOp]);

  assert.equal(receipt.requestPubkey, requestPubkey);
  assert.equal(receipt.deviceAppKeyPubkey, device);
  assert.equal(receipt.rosterOpId, approval.op_id);
  assert.equal(receiptRosterOp.op_id, approval.op_id);
  assert.equal(rosterOpMatchesDeviceApprovalReceipt(approval, receipt), true);
  assert.equal(projection.active_facets[device].capabilities?.can_write_roots, true);
});

test('device approval bootstrap preserves separate stable and ephemeral npubs and a 32-byte secret', () => {
  const deviceSecret = generateSecretKey();
  const suppliedSecret = Buffer.alloc(32, 7).toString('base64url');
  assert.throws(() => createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: deviceSecret,
    requestSecret: suppliedSecret,
  }), /unknown option requestSecret/);
  const local = createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: deviceSecret,
  });
  const { bootstrap, requestSecretKey } = local;
  const encoded = encodeDeviceApprovalBootstrap(bootstrap);
  const parsed = parseDeviceApprovalBootstrap(encoded);

  assert.equal(parsed?.requestNpub, nip19.npubEncode(getPublicKey(requestSecretKey)));
  assert.equal(parsed?.deviceAppKeyNpub, nip19.npubEncode(getPublicKey(deviceSecret)));
  assert.notEqual(parsed?.requestNpub, parsed?.deviceAppKeyNpub);
  assert.match(parsed?.requestSecret, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(Buffer.from(parsed.requestSecret, 'base64url').length, 32);
  assert.notEqual(parsed.requestSecret, Buffer.from(requestSecretKey).toString('hex'));
  assert.throws(() => createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: deviceSecret,
    requestSecretKey: deviceSecret,
  }), /stable and ephemeral keys must be distinct/);
});

test('device approval bootstrap parser rejects extras and legacy link shapes', () => {
  const { bootstrap } = createDeviceApprovalBootstrap({
    deviceAppKeySecretKey: generateSecretKey(),
    label: 'Phone',
  });
  for (const extra of [
    'deviceAppKeyProof', 'requestEvent', 'requestedAt', 'resources', 'relay', 'profileId',
  ]) {
    assert.equal(parseDeviceApprovalBootstrap(encodeApprovalPayload({
      ...bootstrap,
      [extra]: true,
    })), null);
  }
  assert.equal(parseDeviceApprovalBootstrap(encodeApprovalPayload({
    ...bootstrap,
    requestNpub: bootstrap.deviceAppKeyNpub,
  })), null);
  assert.equal(parseDeviceApprovalBootstrap(encodeApprovalPayload({
    ...bootstrap,
    deviceAppKeyNpub: getPublicKey(generateSecretKey()),
  })), null);
  assert.equal(parseDeviceApprovalBootstrap(encodeApprovalPayload({
    ...bootstrap,
    requestSecret: Buffer.alloc(31, 1).toString('base64url'),
  })), null);
  const fullEvent = finalizeEvent({
    kind: 1,
    created_at: 1,
    tags: [],
    content: JSON.stringify(bootstrap),
  }, generateSecretKey());
  assert.equal(parseDeviceApprovalBootstrap(encodeApprovalPayload(fullEvent)), null);
  assert.equal(parseDeviceApprovalBootstrap(`${encodeDeviceApprovalBootstrap(bootstrap)}?relay=wss://example.com`), null);
  const payload = encodeDeviceApprovalBootstrap(bootstrap).slice(DEVICE_APPROVAL_BOOTSTRAP_PREFIX.length);
  assert.equal(parseDeviceApprovalBootstrap(`nostr-identity://device-approval/${payload}`), null);
  assert.equal(deviceApprovalBootstrapHasPrefix(`nostr-identity://device-approval/${payload}`), false);
  assert.equal(parseDeviceApprovalBootstrap('https://drive.iris.to/invite/legacy'), null);
  assert.equal(parseDeviceApprovalBootstrap('iris-drive://invite/legacy'), null);
  assert.equal(parseDeviceApprovalBootstrap('https://drive.iris.to/approve-device?legacy=1'), null);
});

test('device approval bootstrap label is trimmed and bounded by UTF-8 bytes', () => {
  const deviceAppKeySecretKey = generateSecretKey();
  const exactAscii = createDeviceApprovalBootstrap({
    deviceAppKeySecretKey,
    label: ` ${'a'.repeat(NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES)} `,
  }).bootstrap;
  const exactUtf8 = createDeviceApprovalBootstrap({
    deviceAppKeySecretKey,
    label: 'é'.repeat(NOSTR_IDENTITY_DEVICE_APPROVAL_LABEL_MAX_BYTES / 2),
  }).bootstrap;

  assert.equal(exactAscii.label, 'a'.repeat(16));
  assert.equal(parseDeviceApprovalBootstrap(encodeDeviceApprovalBootstrap(exactUtf8))?.label, 'é'.repeat(8));
  assert.throws(() => createDeviceApprovalBootstrap({
    deviceAppKeySecretKey,
    label: 'a'.repeat(17),
  }), /16 UTF-8 bytes/);
  assert.throws(() => createDeviceApprovalBootstrap({
    deviceAppKeySecretKey,
    label: 'é'.repeat(9),
  }), /16 UTF-8 bytes/);
  assert.equal(
    encodeDeviceApprovalBootstrap(exactAscii).length <= NOSTR_IDENTITY_DEVICE_APPROVAL_BOOTSTRAP_MAX_URI_LENGTH,
    true,
  );
});

test('roster ops are signed fact events', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const signed = signNostrIdentityRosterOp({
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

  assert.equal(event.kind, KIND_NOSTR_IDENTITY_ROSTER_OP);
  assert.equal(event.content, '');
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'i' && tag[2] === 'subject'), ['i', profileId, 'subject']);
  assert.ok(event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'nostr_identity_roster_op'));
  assert.ok(event.tags.some((tag) => tag[0] === 'op' && tag[1] === 'add_key'));
  assert.ok(event.tags.some((tag) => tag[0] === 'key_pubkey' && tag[1] === admin));
  assert.ok(event.tags.some((tag) => tag[0] === 'p' && tag[1] === admin));
  assert.ok(event.tags.some((tag) => tag[0] === 'key_capability' && tag[1] === 'admin'));
  assert.equal(event.tags.some((tag) => tag[0] === 'key_label'), false);
  assert.equal(JSON.stringify(event.tags).includes('Laptop'), false);
  assert.equal(signed.content.op.op, 'add_facet');
  assert.equal(signed.content.op.facet.label, undefined);
});

test('facet acceptances are signed fact events', () => {
  const facetSecret = generateSecretKey();
  const facet = getPublicKey(facetSecret);
  const acceptance = signNostrIdentityFacetAcceptance({
    signerSecretKey: facetSecret,
    profileId,
    purposes: ['app_key'],
    rosterOpId: 'a'.repeat(64),
    acceptedAt: 44,
    clientNonce: 'accept-app-key',
  });
  const event = JSON.parse(acceptance.event_json);

  assert.equal(event.kind, KIND_NOSTR_IDENTITY_FACET_ACCEPTANCE);
  assert.equal(event.content, '');
  assert.deepEqual(event.tags.find((tag) => tag[0] === 'i' && tag[2] === 'subject'), ['i', profileId, 'subject']);
  assert.ok(event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'nostr_identity_key_acceptance'));
  assert.ok(event.tags.some((tag) => tag[0] === 'key_pubkey' && tag[1] === facet));
  assert.ok(event.tags.some((tag) => tag[0] === 'p' && tag[1] === facet));
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
        capabilities: { can_write_roots: true, can_receive_secret_wraps: true },
      },
      expected: {
        op: 'set_capabilities',
        pubkey: device,
        capabilities: { can_write_roots: true, can_receive_secret_wraps: true },
      },
    },
    {
      op: { op: 'rotate_secret_epoch', epoch: 2, wrapped_secrets: { [device]: 'wrap-device' } },
      expected: { op: 'rotate_secret_epoch', epoch: 2, wrapped_secrets: { [device]: 'wrap-device' } },
    },
    {
      op: { op: 'repair_secret_wraps', epoch: 2, wrapped_secrets: { [device]: 'wrap-device-again' } },
      expected: { op: 'repair_secret_wraps', epoch: 2, wrapped_secrets: { [device]: 'wrap-device-again' } },
    },
  ];

  for (const [index, { op, expected }] of cases.entries()) {
    const signed = signNostrIdentityRosterOp({
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
  const bootstrap = signNostrIdentityRosterOp({
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
  const addDevice = signNostrIdentityRosterOp({
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
  const rogue = signNostrIdentityRosterOp({
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

  const projection = projectNostrIdentityRoster(profileId, [bootstrap, addDevice, rogue]);

  assert.deepEqual(projection.accepted_op_ids, [bootstrap.op_id, addDevice.op_id]);
  assert.deepEqual(projection.rejected_op_ids, [rogue.op_id]);
  assert.equal(projection.active_facets[other], undefined);
});

test('representative profile uses latest kind 0 event from active identity authors', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const social = getPublicKey(generateSecretKey());
  const recovery = getPublicKey(generateSecretKey());
  const bootstrap = signNostrIdentityRosterOp({
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
  const addSocial = signNostrIdentityRosterOp({
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
  const addRecovery = signNostrIdentityRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: [bootstrap.op_id],
    createdAt: 12,
    clientNonce: 'recovery',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: recovery,
        purposes: ['recovery_phrase'],
        capabilities: { can_recover_app_keys: true },
        added_at: 12,
      },
    },
  }, 'op-recovery');
  const projection = projectNostrIdentityRoster(profileId, [bootstrap, addSocial, addRecovery]);

  assert.deepEqual(representativeProfileAuthors(projection), [admin, recovery, social].sort());
  const selected = selectLatestRepresentativeProfileEvent(projection, [
    { kind: 0, pubkey: social, created_at: 12, content: '{"name":"Old"}' },
    { kind: 0, pubkey: admin, created_at: 20, content: '{"name":"Fresh"}' },
    { kind: 0, pubkey: recovery, created_at: 30, content: '{"name":"Recovery Fresh"}' },
    { kind: 1, pubkey: social, created_at: 30, content: 'not a profile' },
  ]);

  assert.equal(selected?.pubkey, recovery);
  assert.equal(selected?.profile.name, 'Recovery Fresh');
});

test('local identity session creates a UUID profile with an active AppKey', () => {
  const appKeySecretKey = generateSecretKey();
  const session = createLocalNostrIdentitySession({
    profileId,
    appKeySecretKey,
    createdAt: 42,
    clientNonce: 'session-bootstrap',
    label: 'Browser',
  });
  const restored = restoreNostrIdentitySession(serializeNostrIdentitySession(session));
  const projection = projectNostrIdentityRoster(restored.profileId, restored.rosterOps);

  assert.equal(restored.profileId, profileId);
  assert.equal(restored.appKeyPubkey, getPublicKey(appKeySecretKey));
  assert.equal(restored.status, 'active');
  assert.equal(restored.label, 'Browser');
  assert.equal(projection.active_facets[restored.appKeyPubkey].label, undefined);
});

test('nsec login attaches a new AppKey and runs the secret rewrap hook', async () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const recoverySecret = generateSecretKey();
  const recovery = getPublicKey(recoverySecret);
  const appKeySecretKey = generateSecretKey();
  const bootstrap = signNostrIdentityRosterOp({
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
          can_receive_secret_wraps: true,
          can_decrypt_secret_epochs: true,
        },
        added_at: 10,
        label: 'Existing browser',
      },
    },
  });
  const addRecovery = signNostrIdentityRosterOp({
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
          can_decrypt_secret_epochs: true,
        },
        added_at: 11,
        label: 'Recovery nsec',
      },
    },
  });
  const signer = createNostrIdentitySignerFromNsec(nip19.nsecEncode(recoverySecret));
  const rewrapCalls = [];
  const { attachment, session } = await createAttachedNostrIdentitySession({
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
  const projection = projectNostrIdentityRoster(profileId, session.rosterOps);

  assert.equal(attachment.addedByPubkey, recovery);
  assert.equal(attachment.appKeyPubkey, getPublicKey(appKeySecretKey));
  assert.equal(attachment.appKeyNsec, nip19.nsecEncode(appKeySecretKey));
  assert.equal(attachment.rosterOp.signer_pubkey, recovery);
  assert.equal(attachment.rosterOp.content.op.facet.label, undefined);
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
  const seedSigner = createNostrIdentitySignerFromSeedPhrase({
    seedWords: generateSeedWords(),
  });
  const recoveryPubkey = await seedSigner.getPublicKey();
  const bootstrap = signNostrIdentityRosterOp({
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
  const addRecovery = signNostrIdentityRosterOp({
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
  const attachment = await attachNostrAppKeyToIdentity({
    profileId,
    signer: seedSigner,
    rosterOps: [bootstrap, addRecovery],
    appKeySecretKey: generateSecretKey(),
    createdAt: 60,
    clientNonce: 'seed-attach',
  });
  const projection = projectNostrIdentityRoster(profileId, [bootstrap, addRecovery, attachment.rosterOp]);

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
  const bootstrap = signNostrIdentityRosterOp({
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
  const addRecovery = signNostrIdentityRosterOp({
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
          can_decrypt_secret_epochs: true,
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
  const nip07Attachment = await attachNostrAppKeyToIdentity({
    profileId,
    signer: createNostrIdentitySignerFromNip07(remoteSigner),
    rosterOps: [bootstrap, addRecovery],
    appKeySecretKey: generateSecretKey(),
    createdAt: 70,
    clientNonce: 'nip07-attach',
  });
  const nip46Attachment = await attachNostrAppKeyToIdentity({
    profileId,
    signer: createNostrIdentitySignerFromNip46(remoteSigner),
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
  const bootstrap = signNostrIdentityRosterOp({
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
          can_receive_secret_wraps: true,
          can_decrypt_secret_epochs: true,
        },
        added_at: 10,
      },
    },
  });
  const addRecovery = signNostrIdentityRosterOp({
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
          can_receive_secret_wraps: true,
          can_decrypt_secret_epochs: true,
        },
        added_at: 11,
      },
    },
  });
  const addAppKey = signNostrIdentityRosterOp({
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
          can_receive_secret_wraps: true,
          can_decrypt_secret_epochs: true,
        },
        added_at: 12,
        label: 'Phone',
      },
    },
  });
  const rosterOps = [bootstrap, addRecovery, addAppKey];
  const projection = projectNostrIdentityRoster(profileId, rosterOps);
  const hookCalls = [];

  assert.equal(signerCanRemoveAppKey(projection, recovery, appKey), true);
  assert.equal(signerCanRemoveAppKey(projection, appKey, admin), false);

  const removal = await removeNostrAppKeyFromIdentity({
    profileId,
    signer: createNostrIdentitySignerFromNsec(nip19.nsecEncode(recoverySecret)),
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
  const afterRemoval = projectNostrIdentityRoster(profileId, [...rosterOps, removal.rosterOp]);

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
    removeNostrAppKeyFromIdentity({
      profileId,
      signer: createNostrIdentitySignerFromNsec(nip19.nsecEncode(appKeySecret)),
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
  const recipient = createNostrIdentitySignerFromNsec(nip19.nsecEncode(recipientSecret));
  const conversationKey = nip44.v2.utils.getConversationKey(senderSecret, recipientPubkey);
  const ciphertext = nip44.v2.encrypt('drive-content-key', conversationKey);

  assert.equal(await recipient.nip44Decrypt?.(senderPubkey, ciphertext), 'drive-content-key');
  const rewrapped = await recipient.nip44Encrypt?.(senderPubkey, 'drive-content-key');
  assert.equal(nip44.v2.decrypt(rewrapped, conversationKey), 'drive-content-key');

  const calls = [];
  const remote = createNostrIdentitySignerFromNip46({
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
  const bootstrap = signNostrIdentityRosterOp({
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
  const projection = projectNostrIdentityRoster(profileId, [bootstrap]);

  assert.equal(signerCanAttachAppKey(projection, existingPubkey), false);
  await assert.rejects(
    attachNostrAppKeyToIdentity({
      profileId,
      signer: createNostrIdentitySignerFromNsec(nip19.nsecEncode(existingSecret)),
      rosterOps: [bootstrap],
      appKeySecretKey: generateSecretKey(),
      createdAt: 80,
      clientNonce: 'writer-only-attach',
    }),
    /not authorized to attach AppKeys/,
  );
});

test('pending device approval session stores only local bootstrap material and completes from a receipt', () => {
  const adminSecret = generateSecretKey();
  const admin = getPublicKey(adminSecret);
  const adminBootstrap = signNostrIdentityRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    createdAt: 40,
    clientNonce: 'pending-session-admin',
    op: {
      op: 'add_facet',
      facet: {
        pubkey: admin,
        purposes: ['app_key'],
        capabilities: APP_KEY_ADMIN_CAPABILITIES,
        added_at: 40,
      },
    },
  });
  const session = createPendingDeviceApprovalSession({
    appKeySecretKey: generateSecretKey(),
    requestSecretKey: generateSecretKey(),
    createdAt: 43,
    label: 'New browser',
  });
  const stored = serializeNostrIdentitySession(session);
  const storedJson = JSON.stringify(stored);
  const restored = restoreNostrIdentitySession(stored);

  assert.equal(session.status, 'pending_device_approval');
  assert.equal(session.pendingDeviceApproval.bootstrap.deviceAppKeyNpub, session.appKeyNpub);
  assert.notEqual(session.pendingDeviceApproval.bootstrap.requestNpub, session.appKeyNpub);
  assert.equal(session.pendingDeviceApproval.bootstrap.label, 'New browser');
  assert.equal(Buffer.from(session.pendingDeviceApproval.bootstrap.requestSecret, 'base64url').length, 32);
  assert.equal(restored.status, 'pending_device_approval');
  assert.deepEqual(restored.pendingDeviceApproval, session.pendingDeviceApproval);
  assert.equal(storedJson.includes('requestEvent'), false);
  assert.equal(storedJson.includes('pendingDeviceLink'), false);
  assert.equal(storedJson.includes('requestedAt'), false);
  assert.throws(() => restoreNostrIdentitySession({ ...stored, schema: 1 }), /unsupported.*schema/);
  assert.throws(
    () => restoreNostrIdentitySession({ ...stored, requestEvent: '{}' }),
    /unknown field requestEvent/,
  );

  const approvalContent = approveDeviceApprovalBootstrap({
    bootstrap: session.pendingDeviceApproval.bootstrap,
    profileId,
    rosterOps: [adminBootstrap],
    approvedByPubkey: admin,
    approvedAt: 44,
    clientNonce: 'approve-pending-session',
  });
  const approval = signNostrIdentityRosterOp({
    signerSecretKey: adminSecret,
    profileId,
    parents: approvalContent.parents,
    createdAt: approvalContent.created_at,
    clientNonce: approvalContent.client_nonce,
    op: approvalContent.op,
  });
  const receiptEvent = buildDeviceApprovalReceiptEvent({
    signerSecretKey: adminSecret,
    bootstrap: session.pendingDeviceApproval.bootstrap,
    profileId,
    approvedAt: 44,
    rosterOpEvent: approval,
  });
  const requestKey = nip19.decode(session.pendingDeviceApproval.requestNsec);
  assert.equal(requestKey.type, 'nsec');
  const receipt = parseDeviceApprovalReceiptEvent(receiptEvent, {
    requestSecretKey: requestKey.data,
    bootstrap: session.pendingDeviceApproval.bootstrap,
  });
  assert.throws(
    () => completePendingDeviceApprovalSession(session, {
      receipt,
      rosterOps: [adminBootstrap],
    }),
    /roster op is missing/,
  );
  const active = completePendingDeviceApprovalSession(session, {
    receipt,
    rosterOps: [adminBootstrap, approval],
  });

  assert.equal(active.status, 'active');
  assert.equal(active.profileId, profileId);
  assert.equal(active.appKeyNpub, session.appKeyNpub);
  assert.equal(active.rosterOps.length, 2);
});

test('browser session helpers persist, restore, publish, and clear NostrIdentity sessions', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = createLocalNostrIdentitySession({
    profileId,
    appKeySecretKey: generateSecretKey(),
    createdAt: 100,
    clientNonce: 'stored-session',
    label: 'This device',
  });

  saveNostrIdentitySession(session, { storage, key: 'chat-session' });
  const restored = loadNostrIdentitySession({ storage, key: 'chat-session' });

  assert.equal(restored?.profileId, profileId);
  assert.equal(restored?.appKeyPubkey, session.appKeyPubkey);
  assert.equal(restored?.label, 'This device');
  assert.deepEqual(
    nostrIdentitySessionRosterEvents(session).map((event) => event.id),
    session.rosterOps.map((op) => op.op_id),
  );

  const published = [];
  await publishNostrIdentitySessionRosterEvents(session, (event) => {
    published.push(event.id);
  });
  assert.deepEqual(published, session.rosterOps.map((op) => op.op_id));

  clearNostrIdentitySession({ storage, key: 'chat-session' });
  assert.equal(loadNostrIdentitySession({ storage, key: 'chat-session' }), null);
});
