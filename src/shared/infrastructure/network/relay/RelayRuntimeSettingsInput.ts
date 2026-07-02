import type { RelayRuntimeSettings } from './RelayRuntimeSettings';

export type RelayRuntimeSettingsInput = Partial<
  Omit<RelayRuntimeSettings, 'callsRelay' | 'privateRelay' | 'publicRelay'>
> & {
  callsRelay?: Partial<RelayRuntimeSettings['callsRelay']>;
  privateRelay?: Partial<RelayRuntimeSettings['privateRelay']>;
  publicRelay?: Partial<RelayRuntimeSettings['publicRelay']>;
};
