# Iris Kit

Shared Iris packages for standalone apps.

Source: <https://git.iris.to/#/npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/iris-kit>

## Packages

- `@iris/profile-events`: dependency-free helpers for editing a Nostr profile and comparing signed profile and follow-list payloads.
- `@iris/svelte-ui`: shared Svelte identity UI.
- `@iris/release-tools`: release helpers used by standalone web apps.
- `@iris/hashtree-app`: shared Hashtree app helpers and small UI components.
- `ndk` and `ndk-cache`: local Iris-maintained NDK packages used by NDK-based apps.

App-specific routing, profile fetching, badges, media behavior, and release scripts stay in the app repos unless they become broadly reusable.

`@iris/svelte-ui` provides `ContactMemoryPanel`, `FavoriteStar`, and an
account-scoped `createContactMemoryStore` adapter for private saved names and
favorites. Its pure `contactMemory.ts` is copied from nostr-social-graph commit
`fc3d39b` until that API is published. Public profile names remain separate;
applications record an interaction, show the accepted name, and approve changes
against the latest metadata. Favorites never confer social checkmarks.
The adapter uses app-provided storage and does not synchronize between origins.
An app may temporarily consume a committed, checksum-locked package archive
from a verified Iris Kit commit while the next public package release is pending.

Use `@iris/svelte-ui/PublicProfileEditor.svelte` with the signed profile
event. An undefined event means loading; null represents a confirmed empty
history. Render the editor keyed by the active account. Its `onsave(edits, base)`
callback receives the original event and only changed fields.
Apps using `AppNostrClient` can call `readOwnProfileHead(client, pubkey)` and
return `saveOwnProfileEdits(client, pubkey, base, edits)` from that callback.
Both functions are exported from `@iris/hashtree-app/profileEdits`.

For numeric JSON fields, use the raw profile helpers from `@iris/profile-events`.
`readRawProfileFields(content)` returns each field's original JSON text, including
quotes around strings. Edit those values and use `diffRawProfileFields`,
`conflictingRawProfileFields`, and `buildRawProfileDraft` to compare, rebase
and sign them without numeric conversion. An undefined edit removes the field.
`formatRawProfileFields` formats the full object for a text editor.
`compareRawProfileEvents` returns the exact previous and next text in its field changes.

## Native web releases

Launcher-facing release profiles set `nativeReleaseGate: true`. Set
`IRIS_NATIVE_RELEASE_GATE` to the absolute path of the approved Iris Sites
release runner. Set `HTREE_BIN` to an installed Hashtree CLI executable when
a repository normally publishes through Cargo. A gated release finishes its
standard build and test steps, verifies and promotes through the native runner,
then deploys the same output to its Cloudflare target when configured.

## Verification

```bash
pnpm test
```

The test gate also checks that GitHub-hosted package archives retain their
pinned URLs and SHA-512 integrity hashes in `pnpm-lock.yaml`. NDK and its cache
are packed, installed into an isolated ESM project, compiled with NodeNext,
`strict`, and `skipLibCheck: false`, then loaded by Node.js.
