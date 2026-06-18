import type { IrisProfileId } from './profile.ts';
import { isUuid } from './profileJson.ts';

export function irisProfileRosterOpDTag(profileId: IrisProfileId, clientNonce: string): string {
  return `iris-profile/${profileId}/roster-op/${clientNonce}`;
}

export function irisProfileFacetAcceptanceDTag(profileId: IrisProfileId, clientNonce: string): string {
  return `iris-profile/${profileId}/facet-acceptance/${clientNonce}`;
}

export function parseIrisProfileRosterOpDTag(dTag: string): { profileId: IrisProfileId; nonce: string } {
  const rest = dTag.startsWith('iris-profile/') ? dTag.slice('iris-profile/'.length) : '';
  const split = rest.indexOf('/roster-op/');
  if (split <= 0) throw new Error(`invalid IrisProfile roster d tag: ${dTag}`);
  const profileId = rest.slice(0, split);
  const nonce = rest.slice(split + '/roster-op/'.length);
  if (!isUuid(profileId) || !nonce || nonce.includes('/')) {
    throw new Error(`invalid IrisProfile roster d tag: ${dTag}`);
  }
  return { profileId, nonce };
}

export function parseIrisProfileFacetAcceptanceDTag(dTag: string): { profileId: IrisProfileId; nonce: string } {
  const rest = dTag.startsWith('iris-profile/') ? dTag.slice('iris-profile/'.length) : '';
  const split = rest.indexOf('/facet-acceptance/');
  if (split <= 0) throw new Error(`invalid IrisProfile facet acceptance d tag: ${dTag}`);
  const profileId = rest.slice(0, split);
  const nonce = rest.slice(split + '/facet-acceptance/'.length);
  if (!isUuid(profileId) || !nonce || nonce.includes('/')) {
    throw new Error(`invalid IrisProfile facet acceptance d tag: ${dTag}`);
  }
  return { profileId, nonce };
}
