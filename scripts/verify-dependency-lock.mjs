import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const lockfile = await readFile(new URL("pnpm-lock.yaml", root), "utf8");

const dependencies = [
  {
    packageName: "@hashtree/core",
    consumer: "@iris/hashtree-app",
    consumerManifest: "packages/hashtree-app/package.json",
    url: "https://github.com/mmalmi/hashtree/releases/download/hashtree-ts-runtime-v0.4.0/hashtree-core-0.2.0.tgz",
    integrity:
      "sha512-NmGRguZhaboIcvHJlF1CF4YYugcvEWY1LX6KRLPzIoXxHG83jynO1wx9ai5ug3AUyhEZYaU6ssOiOzlRGto2JA==",
  },
  {
    packageName: "nostr-pubsub",
    consumer: "@iris/nostr-pubsub",
    consumerManifest: "packages/nostr-pubsub/package.json",
    url: "https://github.com/mmalmi/nostr-pubsub/releases/download/nostr-pubsub-ts-v0.1.5/nostr-pubsub-0.1.5.tgz",
    integrity:
      "sha512-zza+r1FWKMopO4XUxLD0GfnBvUOpNju9Pr4nKCZ8np8xqo0sKDaCcbM/VvZmjNd2/iHdtyducpkrmAXnqUt+9w==",
  },
];

for (const dependency of dependencies) {
  const consumer = JSON.parse(
    await readFile(new URL(dependency.consumerManifest, root), "utf8"),
  );
  const declared =
    consumer.dependencies?.[dependency.packageName]
    ?? consumer.devDependencies?.[dependency.packageName];
  if (declared !== dependency.url) {
    throw new Error(
      `${dependency.consumer} must load ${dependency.packageName} from ${dependency.url}`,
    );
  }

  const packageKey = `${dependency.packageName}@${dependency.url}`;
  const packageStart = lockfile.indexOf(packageKey);
  const packageEnd = packageStart < 0 ? -1 : lockfile.indexOf("\n\n", packageStart);
  const resolution = packageStart < 0
    ? ""
    : lockfile.slice(packageStart, packageEnd < 0 ? undefined : packageEnd);
  if (!resolution.includes(`tarball: ${dependency.url}`)
    || !resolution.includes(`integrity: ${dependency.integrity}`)) {
    throw new Error(
      `${dependency.packageName} is missing its pinned GitHub URL or SHA-512 integrity in pnpm-lock.yaml`,
    );
  }
}

if (manifest.scripts?.test?.startsWith("pnpm verify:dependency-lock") !== true) {
  throw new Error("The normal test gate must verify GitHub dependency integrity");
}

console.log(`Verified ${dependencies.length} GitHub dependency lock entries`);
