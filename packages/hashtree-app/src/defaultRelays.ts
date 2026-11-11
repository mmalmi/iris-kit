const RELAY_DITTO = 'wss://relay.ditto.pub';
const RELAY_DAMUS = 'wss://relay.damus.io';
const RELAY_PRIMAL = 'wss://relay.primal.net';
const RELAY_SNORT = 'wss://relay.snort.social';
const RELAY_TEMP = 'wss://temp.iris.to';

const IRIS_HASHTREE_APP_BASE_RELAYS = [
  RELAY_DITTO,
  RELAY_DAMUS,
  RELAY_PRIMAL,
  RELAY_SNORT,
  RELAY_TEMP,
];

export const DEFAULT_PUBLIC_RELAYS = [...IRIS_HASHTREE_APP_BASE_RELAYS];

export const DEFAULT_TREE_ROOT_RELAYS = [...IRIS_HASHTREE_APP_BASE_RELAYS];

export const DEFAULT_HISTORY_RELAYS = [
  RELAY_DITTO,
  RELAY_DAMUS,
  RELAY_PRIMAL,
  RELAY_SNORT,
  RELAY_TEMP,
];

export const DEFAULT_E2E_PRODUCTION_RELAYS = [...IRIS_HASHTREE_APP_BASE_RELAYS];

/**
 * Relays that used to be in the defaults and no longer answer. A viewer may
 * still have a saved list that includes them: an app that treats "exactly the
 * shipped set" specially (the public graph bootstrap, for one) should treat a
 * saved list that differs only by these the same way.
 */
export const RETIRED_PUBLIC_RELAYS = ['wss://relay.nostr.band'];
