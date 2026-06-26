import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import { PublicRelayConfigurationOptions } from './PublicRelayConfigurationOptions';

export class PublicRelayConfiguration {
  public static fromEnvironment(
    environment = pigeonEnvironment(),
  ): PublicRelayConfiguration {
    return new PublicRelayConfiguration({
      bootstrapRelayMultiaddrs: (
        environment.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS || ''
      )
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean),
      libp2pPort: environment.PIGEON_LIBP2P_PORT,
      privateRelayRecordRefreshSeconds:
        environment.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS,
      publicHost: environment.PIGEON_PUBLIC_HOST,
      relayAutoEnabled: environment.PIGEON_RELAY_AUTO_ENABLE,
      relayDiscoveryEnabled: environment.PIGEON_RELAY_DISCOVERY_ENABLED,
      relayEnabled: environment.PIGEON_RELAY_ENABLED === true,
      relayPort: environment.PIGEON_RELAY_PORT,
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
}
