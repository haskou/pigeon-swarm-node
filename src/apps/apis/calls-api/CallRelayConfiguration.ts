import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import { CallIceServerEnvironment } from './types/CallIceServerEnvironment';

export class CallRelayConfiguration {
  private static readonly DEFAULT_RECORD_TTL_MS = 10 * 60 * 1000;
  private static readonly DEFAULT_TURN_TRANSPORTS = ['udp', 'tcp'];

  public static fromEnvironment(
    environment: CallIceServerEnvironment = pigeonEnvironment(),
  ): CallRelayConfiguration {
    return new CallRelayConfiguration(environment);
  }

  public constructor(private readonly environment: CallIceServerEnvironment) {}

  private splitEnvironmentList(value: string | undefined): string[] {
    return (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private getPublicHost(): string | undefined {
    return (
      this.environment.CALLS_TURN_PUBLIC_HOST ||
      this.environment.PIGEON_PUBLIC_HOST
    );
  }

  private getTurnTransports(): string[] {
    const configuredTransports = this.splitEnvironmentList(
      this.environment.CALLS_TURN_TRANSPORTS,
    );

    return configuredTransports.length > 0
      ? configuredTransports
      : CallRelayConfiguration.DEFAULT_TURN_TRANSPORTS;
  }

  private getGeneratedTurnUrls(): string[] {
    const publicHost = this.getPublicHost();
    const port = Number(this.environment.CALLS_TURN_PORT);

    if (!publicHost || !Number.isInteger(port) || port <= 0) {
      return [];
    }

    return this.getTurnTransports().map(
      (transport) => `turn:${publicHost}:${port}?transport=${transport}`,
    );
  }

  public isDiscoveryEnabled(): boolean {
    return (
      this.environment.CALLS_TURN_DISCOVERY_ENABLED !== false &&
      this.environment.CALLS_TURN_DISCOVERY_ENABLED !== 'false'
    );
  }

  public getAdvertisedTurnUrls(): string[] {
    return [
      ...new Set([
        ...this.splitEnvironmentList(this.environment.CALLS_TURN_URLS),
        ...this.getGeneratedTurnUrls(),
      ]),
    ];
  }

  public getTurnSharedSecret(): string | undefined {
    return this.environment.CALLS_TURN_SHARED_SECRET;
  }

  public canPublishLocalRelay(): boolean {
    return (
      this.isDiscoveryEnabled() &&
      Boolean(this.environment.CALLS_TURN_SHARED_SECRET) &&
      this.getAdvertisedTurnUrls().length > 0
    );
  }

  public getRecordTtlMs(): number {
    const ttl = Number(this.environment.CALLS_TURN_RECORD_TTL_MS);

    return Number.isFinite(ttl) && ttl > 0
      ? ttl
      : CallRelayConfiguration.DEFAULT_RECORD_TTL_MS;
  }

  public getPublicationIntervalMs(): number {
    const interval = Number(
      this.environment.CALLS_TURN_PUBLICATION_INTERVAL_MS,
    );

    return Number.isFinite(interval) && interval > 0
      ? interval
      : Math.floor(this.getRecordTtlMs() / 2);
  }
}
