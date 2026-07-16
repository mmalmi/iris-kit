# Changelog

## Unreleased

## Runtime 0.2.0 - 2026-07-16

- Published immutable Iris Kit packages for standalone consumers: `ndk@0.2.0`,
  `ndk-cache@0.2.0`, `@iris/identity@0.3.0`,
  `@iris/hashtree-app@0.1.1`, `@iris/svelte-ui@0.1.0`, and
  `@iris/release-tools@0.1.0`.
- Packaged NDK and its Dexie cache as built JavaScript and declarations so
  consumers no longer need to build sibling source directories.
- Allowed `@iris/hashtree-app` to consume compatible Hashtree core releases
  through `0.2.x`, and pinned its tests to the immutable core `0.2.0` asset.
- Replaced the identity package's local social-graph development link with the
  immutable `nostr-social-graph@2.0.0` artifact.
