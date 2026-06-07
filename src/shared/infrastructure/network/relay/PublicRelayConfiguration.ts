import { PublicRelayConfigurationOptions } from './PublicRelayConfigurationOptions';

export class PublicRelayConfiguration {
  private static readonly DEFAULT_LIBP2P_PORT = 4001;
  private static readonly DEFAULT_RELAY_PORT = 4011;
  private static readonly DEFAULT_RELAY_RECORD_TTL_SECONDS = 300;

  public static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): PublicRelayConfiguration {
    return new PublicRelayConfiguration({
      bootstrapRelayMultiaddrs: (
        environment.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS || ''
      )
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean),
      libp2pPort: Number(
        environment.PIGEON_LIBP2P_PORT ||
          PublicRelayConfiguration.DEFAULT_LIBP2P_PORT,
      ),
      publicHost: environment.PIGEON_PUBLIC_HOST,
      relayAutoEnabled: environment.PIGEON_RELAY_AUTO_ENABLE === 'true',
      relayDiscoveryEnabled:
        environment.PIGEON_RELAY_DISCOVERY_ENABLED !== 'false',
      relayEnabled: environment.PIGEON_RELAY_ENABLED === 'true',
      relayPort: Number(
        environment.PIGEON_RELAY_PORT ||
          PublicRelayConfiguration.DEFAULT_RELAY_PORT,
      ),
      relayRecordTtlSeconds: Number(
        environment.PIGEON_RELAY_RECORD_TTL_SECONDS ||
          PublicRelayConfiguration.DEFAULT_RELAY_RECORD_TTL_SECONDS,
      ),
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
