import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const lockfile = await readFile(new URL("pnpm-lock.yaml", root), "utf8");

const dependencies = [
  {
    packageName: "@hashtree/core",
    consumer: "@iris/hashtree-app",
    consumerManifest: "packages/hashtree-app/package.json",
    url: "https://github.com/mmalmi/hashtree/releases/download/hashtree-core-ts-v0.1.8/hashtree-core-0.1.8.tgz",
    integrity:
      "sha512-+V3kHSyDe9Wmdnhew+1JGFUoGELLmFPXXvXtjIcNPVGsn/hYAWIXINPQrSRI2DYer8Uy5One7LLfzn0XMssC5w==",
  },
  {
    packageName: "nostr-pubsub",
    consumer: "@iris/nostr-pubsub",
    consumerManifest: "packages/nostr-pubsub/package.json",
    url: "https://github.com/mmalmi/nostr-pubsub/releases/download/nostr-pubsub-ts-v0.1.4/nostr-pubsub-0.1.4.tgz",
    integrity:
      "sha512-Rm0e+UC1YBnjPjgHED0t+S6+ytUjz9l1ld1AiFiilpC2OU1HDZxtUUrJTjupoe97v6NUUhywkoNNLrZ9LHB9HA==",
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

  const resolution = `tarball: ${dependency.url}, integrity: ${dependency.integrity}`;
  if (!lockfile.includes(resolution)) {
    throw new Error(
      `${dependency.packageName} is missing its pinned GitHub URL or SHA-512 integrity in pnpm-lock.yaml`,
    );
  }
}

if (manifest.scripts?.test?.startsWith("pnpm verify:dependency-lock") !== true) {
  throw new Error("The normal test gate must verify GitHub dependency integrity");
}

console.log(`Verified ${dependencies.length} GitHub dependency lock entries`);
