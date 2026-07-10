# @iris/identity

Compatibility/session helpers for NostrIdentity AppKeys, login signers, and device approval.
Canonical NostrIdentity wire types, fact-event builders/parsers, projections, and secret-epoch
helpers live in `nostr-social-graph` and are re-exported from this package for migration.

## NostrIdentity Fact Events

Roster operations and facet acceptances are Nostr fact events (`kind` `7368`) defined by
`nostr-social-graph`. App-key facet labels are not public roster facts. Private device names
should be stored as encrypted payload facts such as `encrypted_device_labels`, tied to a
profile `secret_epoch` and carrying encrypted `{ schema, profileId, secretEpoch, labels, updatedAt }`.

Supported shared-secret roster ops use neutral secret terminology:

- `rotate_secret_epoch`: `secret_epoch`, repeated `wrapped_secret`
- `repair_secret_wraps`: `secret_epoch`, repeated `wrapped_secret`

## AppKey Attach Flow

Apps should create their own AppKey and attach it to the NostrIdentity with `attachNostrAppKeyToIdentity` or `createAttachedNostrIdentitySession`.

The identity signer can come from:

- `createNostrIdentitySignerFromNsec(nsec)`
- `createNostrIdentitySignerFromSeedPhrase({ seedWords, passphrase })`
- `createNostrIdentitySignerFromNip07(window.nostr)`
- `createNostrIdentitySignerFromNip46(remoteSigner)`
- `createNostrIdentitySignerFromCustom(...)`

The attach helper signs an `add_facet` roster fact with the existing identity signer, signs a facet acceptance with the new AppKey, and returns the new AppKey as `npub` and `nsec`. When existing app secrets need access repair, pass `rewrapSecrets`; the hook receives the new AppKey pubkey, the signed roster op, the facet acceptance, existing roster ops, and the projected pre-attach roster.

For existing identities, the signer must be an active facet with `can_admin_profile` or `can_recover_app_keys`, unless `requireSignerAuthorization` is explicitly disabled.

## Browser Session Wrapper

Browser apps can use this package for local account/session state while importing protocol helpers from the canonical `nostr-social-graph` exports:

- `createLocalNostrIdentitySession(...)`
- `createAttachedNostrIdentitySession(...)`
- `createPendingDeviceApprovalSession(...)`
- `completePendingDeviceApprovalSession(...)`
- `loadNostrIdentitySession(...)`
- `saveNostrIdentitySession(...)`
- `clearNostrIdentitySession(...)`
- `publishNostrIdentitySessionRosterEvents(...)`

Pending approval sessions keep the stable AppKey secret, a distinct ephemeral request key, and the strict approval bootstrap locally. The QR/link bootstrap contains only the stable npub, request npub, 32-byte secret, and an optional label of at most 16 UTF-8 bytes. It is the complete approval input: no request event is published, fetched, or stored. Only the encrypted approval receipt and its signed roster result are transported back.

Public roster facts do not carry human device labels; UI labels belong in encrypted payload facts or local session state.
