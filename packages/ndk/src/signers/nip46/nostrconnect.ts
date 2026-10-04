import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";

export interface NostrConnectUriParams {
    clientPubkey: string;
    relays: string[];
    secret: string;
    perms?: string[];
    name?: string;
    url?: string;
    image?: string;
}
/**
 * Options for generating a nostrconnect:// URI.
 */
export interface NostrConnectOptions {
    name?: string;
    url?: string;
    image?: string;
    perms?: string; // comma-separated list
}

export function nostrConnectGenerateSecret(): string {
    return bytesToHex(randomBytes(32));
}

/**
 * Generates a nostrconnect:// URI for NIP-46 connection.
 * @param pubkey The public key of the client (hex).
 * @param secret The random secret string.
 * @param relay The relay URL to include.
 * @param options Metadata options for the client.
 * @returns The nostrconnect:// URI string.
 */
export function generateNostrConnectUri(
    pubkey: string,
    secret: string,
    relay?: string,
    options?: NostrConnectOptions,
): string {
    const meta = {
        name: options?.name ? encodeURIComponent(options.name) : "",
        url: options?.url ? encodeURIComponent(options.url) : "",
        image: options?.image ? encodeURIComponent(options.image) : "",
        perms: options?.perms ? encodeURIComponent(options.perms) : "",
    };

    let uri = `nostrconnect://${pubkey}?image=${meta.image}&url=${meta.url}&name=${meta.name}&perms=${meta.perms}&secret=${encodeURIComponent(secret)}`;
    if (relay) {
        uri += `&relay=${encodeURIComponent(relay)}`;
    }
    return uri;
}
