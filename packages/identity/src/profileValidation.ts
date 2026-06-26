import type { Event } from 'nostr-tools';
import type { SignedIrisProfileRosterOp } from './profile.ts';
import { stableStringify } from './profileJson.ts';
import { parseIrisProfileRosterOpEvent } from './profileEvents.ts';
import { normalizeIrisProfileRosterOpContent } from './profileNormalize.ts';

export interface IrisProfileRosterOpsContainer {
  roster_ops?: SignedIrisProfileRosterOp[];
}

export function validateSignedIrisProfileRosterOps(container: IrisProfileRosterOpsContainer): void {
  for (const signed of container.roster_ops ?? []) {
    validateSignedIrisProfileRosterOp(signed);
  }
}

export function signedIrisProfileRosterOpIsValid(signed: SignedIrisProfileRosterOp): boolean {
  try {
    validateSignedIrisProfileRosterOp(signed);
    return true;
  } catch {
    return false;
  }
}

export function validateSignedIrisProfileRosterOp(signed: SignedIrisProfileRosterOp): void {
  try {
    const parsed = parseIrisProfileRosterOpEvent(JSON.parse(signed.event_json) as Event);
    if (
      parsed.op_id !== signed.op_id
      || parsed.signer_pubkey !== signed.signer_pubkey
      || stableStringify(normalizeIrisProfileRosterOpContent(parsed.content))
        !== stableStringify(normalizeIrisProfileRosterOpContent(signed.content))
    ) {
      throw new Error('op event_json does not match op fields');
    }
  } catch (error) {
    throw new Error(`IrisProfile roster ${error instanceof Error ? error.message : String(error)}`);
  }
}
