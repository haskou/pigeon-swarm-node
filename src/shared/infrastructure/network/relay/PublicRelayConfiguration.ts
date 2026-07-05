import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import { PublicRelayConfigurationOptions } from './PublicRelayConfigurationOptions';
import {
  defaultRelayRuntimeSettings,
  RelayRuntimeSettings,
} from './RelayRuntimeSettings';

export class PublicRelayConfiguration {
  public static fromEnvironment(
    environment = pigeonEnvironment(),
  ): PublicRelayConfiguration {
    return PublicRelayConfiguration.fromRuntimeSettings(
      defaultRelayRuntimeSettings(),
      environment,
    );
  }

  public static fromRuntimeSettings(
    settings: RelayRuntimeSettings,
    environment = pigeonEnvironment(),
  ): PublicRelayConfiguration {
    return new PublicRelayConfiguration({
      bootstrapRelayMultiaddrs: settings.manualRelayMultiaddrs,
      libp2pPort: settings.publicRelay.libp2pPort,
      privateRelayRecordRefreshSeconds:
        environment.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS,
      publicHost: settings.publicHost,
      relayAutoEnabled: settings.publicRelay.autoEnabled,
      relayDiscoveryEnabled: settings.publicRelay.discoveryEnabled,
      relayEnabled: settings.publicRelay.enabled,
      relayPort: settings.publicRelay.port,
      relayRecordTtlSeconds: environment.PIGEON_RELAY_RECORD_TTL_SECONDS,
    });
  }

  constructor(private readonly options: PublicRelayConfigurationOptions) {}

  public isRelayEnabled(): boolean {
    return this.options.relayEnabled;
  }

  public isRelayAutoEnabled(): boolean {
    return this.options.relayAutoEnabled;
  }

  public isRelayDiscoveryEnabled(): boolean {
    return this.options.relayDiscoveryEnabled;
  }

  public getLibp2pPort(): number {
    return this.options.libp2pPort;
  }

  public getPrivateRelayRecordRefreshMs(): number {
    return this.options.privateRelayRecordRefreshSeconds * 1000;
  }

  public getRelayPort(): number {
    return this.options.relayPort;
  }

  public getPublicHost(): string | undefined {
    return this.options.publicHost;
  }

  public getRelayRecordTtlMs(): number {
    return this.options.relayRecordTtlSeconds * 1000;
  }

  public getBootstrapRelayMultiaddrs(): string[] {
    return [...this.options.bootstrapRelayMultiaddrs];
  }

  public hasPublicHost(): boolean {
    return Boolean(this.options.publicHost);
  }

  public toKey(): string {
    return JSON.stringify(this.options);
  }
}
