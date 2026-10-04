import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateNostrConnectUri, nostrConnectGenerateSecret } from "./nostrconnect.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("Nostr Connect pairing secrets", () => {
    it.each([true, false])("uses 256 secure random bits with global crypto available: %s", (hasGlobalCrypto) => {
        if (!hasGlobalCrypto) vi.stubGlobal("crypto", undefined);
        const secureRandom = vi.spyOn(webcrypto, "getRandomValues");
        const insecureRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);

        const secret = nostrConnectGenerateSecret();
        const uri = new URL(generateNostrConnectUri("client", secret, "wss://relay.example.com"));

        expect(secret).toMatch(/^[0-9a-f]{64}$/);
        expect(uri.searchParams.get("secret")).toBe(secret);
        expect(secureRandom).toHaveBeenCalledOnce();
        expect(secureRandom.mock.calls[0]?.[0]?.byteLength).toBe(32);
        expect(insecureRandom).not.toHaveBeenCalled();
    });

    it.each([true, false])("fails on entropy errors with global crypto available: %s", (hasGlobalCrypto) => {
        if (!hasGlobalCrypto) vi.stubGlobal("crypto", undefined);
        const failure = new Error("secure entropy unavailable");
        vi.spyOn(webcrypto, "getRandomValues").mockImplementation(() => { throw failure; });
        const insecureRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);

        expect(() => nostrConnectGenerateSecret()).toThrow(failure);
        expect(insecureRandom).not.toHaveBeenCalled();
    });
});
