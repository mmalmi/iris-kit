# Iris Kit

Shared Iris packages for standalone apps.

Source: <https://git.iris.to/#/npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/iris-kit>

## Packages

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

## Verification

```bash
pnpm test
```

The test gate also checks that GitHub-hosted package archives retain their
pinned URLs and SHA-512 integrity hashes in `pnpm-lock.yaml`. NDK and its cache
are packed, installed into an isolated ESM project, compiled with NodeNext,
`strict`, and `skipLibCheck: false`, then loaded by Node.js.
