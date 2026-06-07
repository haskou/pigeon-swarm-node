export class PublicRelayConfiguration {
  private static readonly DEFAULT_LIBP2P_PORT = 4001;
  private static readonly DEFAULT_RELAY_PORT = 4011;
  private static readonly DEFAULT_RELAY_RECORD_TTL_SECONDS = 300;

  public static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): PublicRelayConfiguration {
    return new PublicRelayConfiguration(
      environment.PIGEON_RELAY_ENABLED === 'true',
      Number(
        environment.PIGEON_LIBP2P_PORT ||
          PublicRelayConfiguration.DEFAULT_LIBP2P_PORT,
      ),
      Number(
        environment.PIGEON_RELAY_PORT ||
          PublicRelayConfiguration.DEFAULT_RELAY_PORT,
      ),
      environment.PIGEON_PUBLIC_HOST,
      environment.PIGEON_RELAY_DISCOVERY_ENABLED !== 'false',
      Number(
        environment.PIGEON_RELAY_RECORD_TTL_SECONDS ||
          PublicRelayConfiguration.DEFAULT_RELAY_RECORD_TTL_SECONDS,
      ),
      (environment.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS || '')
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean),
    );
  }

  constructor(
    private readonly relayEnabled: boolean,
    private readonly libp2pPort: number,
    private readonly relayPort: number,
    private readonly publicHost: string | undefined,
    private readonly relayDiscoveryEnabled: boolean,
    private readonly relayRecordTtlSeconds: number,
    private readonly bootstrapRelayMultiaddrs: string[],
  ) {}

  public isRelayEnabled(): boolean {
    return this.relayEnabled;
  }

  public isRelayDiscoveryEnabled(): boolean {
    return this.relayDiscoveryEnabled;
  }

  public getLibp2pPort(): number {
    return this.libp2pPort;
  }

  public getRelayPort(): number {
    return this.relayPort;
  }

  public getPublicHost(): string | undefined {
    return this.publicHost;
  }

  public getRelayRecordTtlMs(): number {
    return this.relayRecordTtlSeconds * 1000;
  }

  public getBootstrapRelayMultiaddrs(): string[] {
    return [...this.bootstrapRelayMultiaddrs];
  }

  public hasPublicHost(): boolean {
    return Boolean(this.publicHost);
  }
}
