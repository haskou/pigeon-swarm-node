import type { RelayRuntimeSettingsInput } from './RelayRuntimeSettingsInput';

export type RelayRuntimeSettings = {
  callsRelay: {
    port?: number;
  };
  manualRelayMultiaddrs: string[];
  privateRelay: {
    enabled: boolean;
    portEnd?: number;
    portStart?: number;
    publicRecordDiscoveryEnabled: boolean;
    publicRecordPublicationEnabled: boolean;
  };
  publicHost?: string;
  publicRelay: {
    autoEnabled: boolean;
    discoveryEnabled: boolean;
    enabled: boolean;
    libp2pPort: number;
    port: number;
  };
};

const defaultSettings: RelayRuntimeSettings = {
  callsRelay: {},
  manualRelayMultiaddrs: [],
  privateRelay: {
    enabled: false,
    publicRecordDiscoveryEnabled: false,
    publicRecordPublicationEnabled: false,
  },
  publicRelay: {
    autoEnabled: false,
    discoveryEnabled: false,
    enabled: false,
    libp2pPort: 4001,
    port: 4011,
  },
};

export function normalizeRelayRuntimeSettings(
  settings: RelayRuntimeSettingsInput = {},
): RelayRuntimeSettings {
  return {
    callsRelay: {
      ...defaultSettings.callsRelay,
      ...(settings.callsRelay || {}),
    },
    manualRelayMultiaddrs: [...(settings.manualRelayMultiaddrs || [])],
    privateRelay: {
      ...defaultSettings.privateRelay,
      ...(settings.privateRelay || {}),
    },
    publicHost: settings.publicHost,
    publicRelay: {
      ...defaultSettings.publicRelay,
      ...(settings.publicRelay || {}),
    },
  };
}

export function defaultRelayRuntimeSettings(): RelayRuntimeSettings {
  return normalizeRelayRuntimeSettings();
}

export function relayRuntimeSettingsKey(
  settings: RelayRuntimeSettings,
): string {
  return JSON.stringify(settings);
}
