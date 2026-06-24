# @iris/identity

Shared IrisProfile identity helpers for roster facts, AppKeys, login signers, and device-link sessions.

## IrisProfile Fact Events

Roster operations and facet acceptances are Nostr fact events:

- `kind`: `7368`
- `content`: empty string
- subject tag: `["i", profileId, "subject"]`
- parent links: `["prev", opId]`

Roster operation facts use `type=iris_profile_roster_op` plus `schema`, `actor_pubkey`, `client_nonce`, `created_at`, and `op`.

Supported roster ops:

- `add_facet`: `facet_pubkey`, optional `facet_profile_id`, repeated `facet_purpose`, repeated `facet_capability`, `facet_added_at`, optional `facet_label`
- `tombstone_facet`: `target_pubkey`, optional `reason`
- `set_capabilities`: `target_pubkey`, repeated `capability`
- `rotate_key_epoch`: `key_epoch`, repeated `wrapped_dck`
- `repair_key_wraps`: `key_epoch`, repeated `wrapped_dck`

Facet acceptance facts use `type=iris_profile_facet_acceptance` plus `schema`, `facet_pubkey`, repeated `purpose`, optional `roster_op_id`, `client_nonce`, and `accepted_at`.

## AppKey Attach Flow

Apps should create their own AppKey and attach it to the IrisProfile with `attachIrisAppKeyToProfile` or `createAttachedIrisIdentitySession`.

The identity signer can come from:

- `createIrisIdentitySignerFromNsec(nsec)`
- `createIrisIdentitySignerFromSeedPhrase({ seedWords, passphrase })`
- `createIrisIdentitySignerFromNip07(window.nostr)`
- `createIrisIdentitySignerFromNip46(remoteSigner)`
- `createIrisIdentitySignerFromCustom(...)`

The attach helper signs an `add_facet` roster fact with the existing identity signer, signs a facet acceptance with the new AppKey, and returns the new AppKey as `npub` and `nsec`. When existing app secrets need access repair, pass `rewrapSecrets`; the hook receives the new AppKey pubkey, the signed roster op, the facet acceptance, existing roster ops, and the projected pre-attach roster.

For existing identities, the signer must be an active facet with `can_admin_profile` or `can_recover_app_keys`, unless `requireSignerAuthorization` is explicitly disabled.
