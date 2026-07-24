import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import {
  defaultRelayRuntimeSettings,
  RelayRuntimeSettings,
} from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';

import { CallTurnSharedSecret } from './CallTurnSharedSecret';
import { CallIceServerEnvironment } from './types/CallIceServerEnvironment';

export class CallRelayConfiguration {
  private static readonly DEFAULT_RECORD_TTL_MS = 10 * 60 * 1000;
  private static readonly DEFAULT_TURN_TRANSPORTS = ['udp', 'tcp'];

  public static fromEnvironment(
    environment: CallIceServerEnvironment = pigeonEnvironment(),
    relaySettings: RelayRuntimeSettings = defaultRelayRuntimeSettings(),
  ): CallRelayConfiguration {
    return new CallRelayConfiguration(environment, relaySettings);
  }

  public static fromRelaySettings(
    relaySettings: RelayRuntimeSettings,
    environment: CallIceServerEnvironment = pigeonEnvironment(),
  ): CallRelayConfiguration {
    return new CallRelayConfiguration(environment, relaySettings);
  }

  public constructor(
    private readonly environment: CallIceServerEnvironment,
    private readonly relaySettings: RelayRuntimeSettings,
  ) {}

  private splitEnvironmentList(value: string | undefined): string[] {
    return (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private getPublicHost(): string | undefined {
    return this.relaySettings.publicHost;
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
    const port = this.relaySettings.callsRelay.port;

    if (!publicHost || port === undefined) {
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

  public getTurnSharedSecret(): string {
    return CallTurnSharedSecret.fromEnvironment(
      this.environment.CALLS_TURN_SHARED_SECRET,
    ).getValue();
  }

  public usesDefaultTurnSharedSecret(): boolean {
    return CallTurnSharedSecret.fromEnvironment(
      this.environment.CALLS_TURN_SHARED_SECRET,
    ).usesDefaultValue();
  }

  public canPublishLocalRelay(): boolean {
    return this.isDiscoveryEnabled() && this.getAdvertisedTurnUrls().length > 0;
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
