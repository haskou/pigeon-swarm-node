import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

export default class PrivateNetworkRelayDirectorySettings {
  private static readonly defaultActiveDiscoveryIntervalMs = 5 * 60_000;

  private static readonly defaultConnectionGraceMs = 60_000;

  private static readonly defaultPublicationIntervalMs = 60 * 60_000;

  private static readonly defaultPublicationRetryMs = 15_000;

  private static readonly defaultRoutingTimeoutMs = 15_000;

  private static readonly defaultPublicPeerWaitMs = 8000;

  private static readonly maximumPublicPeerWaitMs = 10_000;

  private isPositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
  }

  private positiveOrDefault(value: number, fallback: number): number {
    return this.isPositive(value) ? value : fallback;
  }

  public getRelayDataLimitBytes(): number {
    return pigeonEnvironment().PIGEON_RELAY_DATA_LIMIT_BYTES;
  }

  public getPublicRelayStorageLocation(): string {
    return `${pigeonEnvironment().IPFS_STORAGE_PATH}/public-relay-record-directory`;
  }

  public getRelayRecordTtlMs(): number {
    return pigeonEnvironment().PIGEON_RELAY_RECORD_TTL_MS;
  }

  public getDiscoveryIntervalMs(): number {
    return pigeonEnvironment().PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS;
  }

  public getActiveDiscoveryIntervalMs(): number {
    const environment = pigeonEnvironment();
    const configuredIntervalMs =
      environment.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS ||
      environment.PIGEON_PRIVATE_RELAY_CONNECTED_DISCOVERY_INTERVAL_MS;

    return this.positiveOrDefault(
      configuredIntervalMs,
      PrivateNetworkRelayDirectorySettings.defaultActiveDiscoveryIntervalMs,
    );
  }

  public getActiveConnectionGraceMs(): number {
    return this.positiveOrDefault(
      pigeonEnvironment().PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS,
      PrivateNetworkRelayDirectorySettings.defaultConnectionGraceMs,
    );
  }

  public getPublicationIntervalMs(): number {
    const environment = pigeonEnvironment();
    const configuredIntervalMs =
      environment.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS;

    if (this.isPositive(configuredIntervalMs)) {
      return configuredIntervalMs;
    }

    const configuredRefreshSeconds =
      environment.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS;

    if (this.isPositive(configuredRefreshSeconds)) {
      return configuredRefreshSeconds * 1000;
    }

    return PrivateNetworkRelayDirectorySettings.defaultPublicationIntervalMs;
  }

  public getPublicationRetryMs(): number {
    return PrivateNetworkRelayDirectorySettings.defaultPublicationRetryMs;
  }

  public getPublicPeerWaitMs(): number {
    const configuredWaitMs =
      pigeonEnvironment().PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS;

    if (!Number.isFinite(configuredWaitMs) || configuredWaitMs < 0) {
      return PrivateNetworkRelayDirectorySettings.defaultPublicPeerWaitMs;
    }

    return Math.min(
      configuredWaitMs,
      PrivateNetworkRelayDirectorySettings.maximumPublicPeerWaitMs,
    );
  }

  public getIPNSWindowMs(): number {
    return pigeonEnvironment().PIGEON_RELAY_RECORD_IPNS_WINDOW_MS;
  }

  public getRoutingTimeoutMs(): number {
    const environment = pigeonEnvironment();

    return this.positiveOrDefault(
      environment.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS ||
        environment.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS,
      PrivateNetworkRelayDirectorySettings.defaultRoutingTimeoutMs,
    );
  }

  public getPrivateRelayDialTimeoutMs(): number {
    const environment = pigeonEnvironment();

    return this.positiveOrDefault(
      environment.PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS ||
        environment.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS ||
        environment.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS,
      PrivateNetworkRelayDirectorySettings.defaultRoutingTimeoutMs,
    );
  }
}
