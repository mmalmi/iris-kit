import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packDir = resolve(process.argv[2] ?? join(root, "dist-runtime"));
const fixtureDir = mkdtempSync(join(tmpdir(), "iris-kit-packed-consumer-"));
const useReleasedPackages = process.env.IRIS_KIT_RELEASED_CONSUMER === "1";
const releaseBaseUrl = "https://github.com/mmalmi/iris-kit/releases/download/runtime-v0.2.2";

function packedPackage(pattern) {
    const matches = readdirSync(packDir).filter((name) => pattern.test(name));
    if (matches.length !== 1) {
        throw new Error(`Expected exactly one ${pattern} package in ${packDir}, found ${matches.length}`);
    }
    return join(packDir, matches[0]);
}

const ndk = packedPackage(/^ndk-\d.*\.tgz$/);
const ndkCache = packedPackage(/^ndk-cache-\d.*\.tgz$/);
const ndkSpecifier = useReleasedPackages ? `${releaseBaseUrl}/${basename(ndk)}` : `file:${ndk}`;
const ndkCacheSpecifier = useReleasedPackages
    ? `${releaseBaseUrl}/${basename(ndkCache)}`
    : `file:${ndkCache}`;

writeFileSync(
    join(fixtureDir, "package.json"),
    JSON.stringify(
        {
            name: "iris-kit-packed-consumer",
            private: true,
            type: "module",
            dependencies: {
                ndk: ndkSpecifier,
                "ndk-cache": ndkCacheSpecifier,
                typescript: "5.9.3",
            },
            overrides: useReleasedPackages ? undefined : {
                "ndk-cache": {
                    ndk: ndkSpecifier,
                },
            },
        },
        null,
        2,
    ),
);
writeFileSync(
    join(fixtureDir, "tsconfig.json"),
    JSON.stringify(
        {
            compilerOptions: {
                lib: ["DOM", "ES2022"],
                module: "NodeNext",
                moduleResolution: "NodeNext",
                outDir: "dist",
                skipLibCheck: false,
                strict: true,
                target: "ES2022",
                types: [],
            },
            include: ["index.ts"],
        },
        null,
        2,
    ),
);
writeFileSync(
    join(fixtureDir, "index.ts"),
    `import NDK, { NDKEvent, nip19, nip49, type NDKCacheAdapter } from "ndk";
import NDKCacheAdapterDexie from "ndk-cache";

const ndkConstructor: typeof NDK = NDK;
const eventConstructor: typeof NDKEvent = NDKEvent;
const cacheConstructor: new (...args: never[]) => NDKCacheAdapter = NDKCacheAdapterDexie;
const note = nip19.noteEncode("00".repeat(32));

if (nip19.decode(note).type !== "note") throw new Error("NDK runtime mismatch");
if (
    typeof ndkConstructor !== "function"
    || typeof eventConstructor !== "function"
    || typeof nip49.encrypt !== "function"
    || typeof cacheConstructor !== "function"
) {
    throw new Error("NDK package exports are incomplete");
}
`,
);

try {
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], {
        cwd: fixtureDir,
        stdio: "inherit",
    });
    execFileSync(join(fixtureDir, "node_modules", ".bin", "tsc"), ["--project", "tsconfig.json"], {
        cwd: fixtureDir,
        stdio: "inherit",
    });
    execFileSync(process.execPath, [join(fixtureDir, "dist", "index.js")], {
        cwd: fixtureDir,
        stdio: "inherit",
    });
    const source = useReleasedPackages ? "Released" : "Packed";
    process.stdout.write(`${source} NodeNext consumer passed: ${basename(ndk)}, ${basename(ndkCache)}\n`);
    if (process.env.IRIS_KIT_KEEP_CONSUMER !== "1") rmSync(fixtureDir, { recursive: true, force: true });
} catch (error) {
    process.stderr.write(`Packed consumer preserved at ${fixtureDir}\n`);
    throw error;
}
