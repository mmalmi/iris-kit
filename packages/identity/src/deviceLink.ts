import {
  createNostrIdentityDeviceLinkInvite,
  encodeNostrIdentityDeviceLinkInvite,
  parseNostrIdentityDeviceLinkInvite,
  isCompleteNostrIdentityDeviceLinkInviteInput,
  createNostrIdentityDeviceLinkRequest,
  signNostrIdentityDeviceLinkRequestEvent,
  parseNostrIdentityDeviceLinkRequestEvent,
  approveNostrIdentityDeviceLinkRequest,
  createNostrIdentityDeviceApprovalRequest,
  encodeNostrIdentityDeviceApprovalRequest,
  parseNostrIdentityDeviceApprovalRequest,
  approveNostrIdentityDeviceApprovalRequest,
  buildNostrIdentityDeviceApprovalReceiptEvent,
  parseNostrIdentityDeviceApprovalReceiptEvent,
  parseNostrIdentityDeviceApprovalReceiptRosterOp,
  nostrIdentityRosterOpMatchesDeviceApprovalReceipt,
  pubkeyToNpub,
  npubToPubkey,
  type AdminNostrIdentityDeviceLinkInvite,
  type LocalNostrIdentityDeviceApprovalRequest,
  type NostrIdentityDeviceApprovalReceipt,
  type NostrIdentityDeviceApprovalRequest,
  type NostrIdentityDeviceApprovalRequestedResource,
  type NostrIdentityDeviceLinkInvite,
  type NostrIdentityDeviceLinkRequest,
  type NostrIdentityDeviceLinkRequestScope,
  type SignedNostrIdentityDeviceLinkRequest,
} from 'nostr-social-graph';

export * from 'nostr-social-graph';

export const DEVICE_LINK_INVITE_PREFIX = 'https://drive.iris.to/invite/';
export const DEVICE_LINK_INVITE_WEB_PREFIX = DEVICE_LINK_INVITE_PREFIX;
export const DEVICE_LINK_INVITE_VERSION = 1;
export const DEVICE_APPROVAL_REQUEST_PREFIX = 'https://drive.iris.to/approve-device/';
export const DEVICE_APPROVAL_REQUEST_WEB_PREFIX = DEVICE_APPROVAL_REQUEST_PREFIX;
export const DEVICE_APPROVAL_REQUEST_VERSION = 1;
export { KIND_NOSTR_IDENTITY_DEVICE_LINK_REQUEST as KIND_DEVICE_LINK_REQUEST } from 'nostr-social-graph';

export type DeviceLinkInvite = NostrIdentityDeviceLinkInvite;
export type AdminDeviceLinkInvite = AdminNostrIdentityDeviceLinkInvite;
export type DeviceLinkRequest = NostrIdentityDeviceLinkRequest;
export type SignedDeviceLinkRequest = SignedNostrIdentityDeviceLinkRequest;
export type DeviceLinkRequestScope = NostrIdentityDeviceLinkRequestScope;
export type DeviceApprovalRequest = NostrIdentityDeviceApprovalRequest;
export type LocalDeviceApprovalRequest = LocalNostrIdentityDeviceApprovalRequest;
export type DeviceApprovalReceipt = NostrIdentityDeviceApprovalReceipt;
export type DeviceApprovalRequestedResource = NostrIdentityDeviceApprovalRequestedResource;

export const createDeviceLinkInvite = createNostrIdentityDeviceLinkInvite;
export const createDeviceLinkRequest = createNostrIdentityDeviceLinkRequest;
export const signDeviceLinkRequestEvent = signNostrIdentityDeviceLinkRequestEvent;
export const parseDeviceLinkRequestEvent = parseNostrIdentityDeviceLinkRequestEvent;
export const approveDeviceLinkRequest = approveNostrIdentityDeviceLinkRequest;
export const createDeviceApprovalRequest = createNostrIdentityDeviceApprovalRequest;
export const approveDeviceApprovalRequest = approveNostrIdentityDeviceApprovalRequest;
export const buildDeviceApprovalReceiptEvent = buildNostrIdentityDeviceApprovalReceiptEvent;
export const parseDeviceApprovalReceiptEvent = parseNostrIdentityDeviceApprovalReceiptEvent;
export const parseDeviceApprovalReceiptRosterOp = parseNostrIdentityDeviceApprovalReceiptRosterOp;
export const rosterOpMatchesDeviceApprovalReceipt = nostrIdentityRosterOpMatchesDeviceApprovalReceipt;
export { pubkeyToNpub, npubToPubkey };

export function encodeDeviceLinkInvite(invite: DeviceLinkInvite): string {
  return encodeNostrIdentityDeviceLinkInvite(invite, { prefix: DEVICE_LINK_INVITE_PREFIX });
}

export function parseDeviceLinkInvite(input: string): DeviceLinkInvite | null {
  return parseNostrIdentityDeviceLinkInvite(input, {
    prefixes: [DEVICE_LINK_INVITE_PREFIX],
  });
}

export function isCompleteDeviceLinkInviteInput(input: string): boolean {
  return isCompleteNostrIdentityDeviceLinkInviteInput(input, {
    prefixes: [DEVICE_LINK_INVITE_PREFIX],
  });
}

export function deviceLinkInviteWebUrl(inviteUrl: string): string {
  return inviteUrl.replace(DEVICE_LINK_INVITE_PREFIX, DEVICE_LINK_INVITE_WEB_PREFIX);
}

export function encodeDeviceApprovalRequest(request: DeviceApprovalRequest): string {
  return encodeNostrIdentityDeviceApprovalRequest(request, { prefix: DEVICE_APPROVAL_REQUEST_PREFIX });
}

export function parseDeviceApprovalRequest(input: string): DeviceApprovalRequest | null {
  return parseNostrIdentityDeviceApprovalRequest(input, {
    prefixes: [DEVICE_APPROVAL_REQUEST_PREFIX],
  });
}

export function isCompleteDeviceApprovalRequestInput(input: string): boolean {
  return parseDeviceApprovalRequest(input) !== null;
}

export function deviceApprovalRequestWebUrl(requestUrl: string): string {
  return requestUrl.replace(DEVICE_APPROVAL_REQUEST_PREFIX, DEVICE_APPROVAL_REQUEST_WEB_PREFIX);
}
