# Iris Kit

Shared Iris packages for standalone apps.

Source: <https://git.iris.to/#/npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/iris-kit>

## Packages

- `@iris/svelte-ui`: shared Svelte identity UI.
- `@iris/release-tools`: release helpers used by standalone web apps.
- `@iris/hashtree-app`: shared Hashtree app helpers and small UI components.
- `ndk` and `ndk-cache`: local Iris-maintained NDK packages used by NDK-based apps.

App-specific routing, profile fetching, badges, media behavior, and release scripts stay in the app repos unless they become broadly reusable.

## Verification

```bash
pnpm test
```
