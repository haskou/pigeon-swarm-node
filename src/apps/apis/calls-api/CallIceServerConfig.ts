import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { CallTurnRuntimeConfiguration } from '@app/shared/infrastructure/network/relay/CallTurnRuntimeConfiguration';
import {
  defaultRelayRuntimeSettings,
  RelayRuntimeSettings,
} from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import { createHmac } from 'crypto';

import { CallIceServerDiagnostics } from './CallIceServerDiagnostics';
import { CallTurnSharedSecret } from './CallTurnSharedSecret';
import {
  CallIceServerResource,
  CallIceServersResource,
} from './resources/CallIceServersResource';
import { CallIceServerConfigValues } from './types/CallIceServerConfigValues';
import { CallIceServerEnvironment } from './types/CallIceServerEnvironment';
import { TurnCredentials } from './types/TurnCredentials';

export class CallIceServerConfig {
  private static readonly DEFAULT_CREDENTIAL_TTL_SECONDS = 3600;
  private static readonly DEFAULT_ICE_TRANSPORT_POLICY = 'all';
  private static readonly DEFAULT_TURN_TRANSPORTS = ['udp', 'tcp'];

  private static normalizeCredentialTtl(
    value: number | string | undefined,
  ): number {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : CallIceServerConfig.DEFAULT_CREDENTIAL_TTL_SECONDS;
  }

  private static normalizeIceTransportPolicy(
    value: string | undefined,
  ): 'all' | 'relay' {
    return value === 'all' || value === 'relay'
      ? value
      : CallIceServerConfig.DEFAULT_ICE_TRANSPORT_POLICY;
  }

  private static splitEnvironmentList(value: string | undefined): string[] {
    return (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private static unique(values: string[]): string[] {
    return [...new Set(values)];
  }

  private static getTurnTransports(
    environment: CallIceServerEnvironment,
  ): string[] {
    const configuredTransports = this.splitEnvironmentList(
      environment.CALLS_TURN_TRANSPORTS,
    );

    return configuredTransports.length > 0
      ? configuredTransports
      : CallIceServerConfig.DEFAULT_TURN_TRANSPORTS;
  }

  private static getAdvertisedTurnUrls(
    environment: CallIceServerEnvironment,
    relaySettings: RelayRuntimeSettings,
  ): string[] {
    const explicitUrls = this.splitEnvironmentList(environment.CALLS_TURN_URLS);
    const generatedUrls = CallTurnRuntimeConfiguration.fromRelaySettings(
      relaySettings,
    ).getTurnUrls(this.getTurnTransports(environment));

    return this.unique([...explicitUrls, ...generatedUrls]);
  }

  public static fromEnvironment(
    environment: CallIceServerEnvironment = pigeonEnvironment(),
    relaySettings: RelayRuntimeSettings = defaultRelayRuntimeSettings(),
  ): CallIceServerConfig {
    const turnSharedSecret = CallTurnSharedSecret.fromEnvironment(
      environment.CALLS_TURN_SHARED_SECRET,
    );

    return new CallIceServerConfig({
      iceTransportPolicy: this.normalizeIceTransportPolicy(
        environment.CALLS_ICE_TRANSPORT_POLICY,
      ),
      stunUrls: this.splitEnvironmentList(environment.CALLS_STUN_URLS),
      turnCredential: environment.CALLS_TURN_CREDENTIAL,
      turnCredentialTtlSeconds: this.normalizeCredentialTtl(
        environment.CALLS_TURN_CREDENTIAL_TTL_SECONDS,
      ),
      turnDiscoveryEnabled:
        environment.CALLS_TURN_DISCOVERY_ENABLED !== false &&
        environment.CALLS_TURN_DISCOVERY_ENABLED !== 'false',
      turnSharedSecret: turnSharedSecret.getValue(),
      turnSharedSecretConfigured: turnSharedSecret.isConfigured(),
      turnUrls: this.getAdvertisedTurnUrls(environment, relaySettings),
      turnUsername: environment.CALLS_TURN_USERNAME,
    });
  }

  public static fromRelaySettings(
    relaySettings: RelayRuntimeSettings,
    environment: CallIceServerEnvironment = pigeonEnvironment(),
  ): CallIceServerConfig {
    return CallIceServerConfig.fromEnvironment(environment, relaySettings);
  }

  public constructor(private readonly values: CallIceServerConfigValues) {}

  private createTurnCredentials(
    identityId: IdentityId,
    localTurnServer: boolean,
  ): TurnCredentials | undefined {
    if (
      localTurnServer &&
      !this.values.turnSharedSecretConfigured &&
      this.values.turnUsername &&
      this.values.turnCredential
    ) {
      return {
        credential: this.values.turnCredential,
        username: this.values.turnUsername,
      };
    }

    if (
      !this.values.turnSharedSecretConfigured ||
      !this.values.turnSharedSecret
    ) {
      return undefined;
    }

    const expiresAt =
      Math.floor(Date.now() / 1000) + this.values.turnCredentialTtlSeconds;
    const username = `${expiresAt}:${identityId.valueOf()}`;
    const credential = createHmac('sha1', this.values.turnSharedSecret)
      .update(username)
      .digest('base64');

    return {
      credential,
      username,
    };
  }

  private getTurnUrls(connectedRelayTurnUrls: string[]): string[] {
    if (this.values.turnUrls.length > 0) {
      return this.values.turnUrls;
    }

    if (!this.values.turnDiscoveryEnabled) {
      return [];
    }

    return CallIceServerConfig.unique(connectedRelayTurnUrls);
  }

  public toResource(
    identityId: IdentityId,
    connectedRelayTurnUrls: string[] = [],
  ): CallIceServersResource {
    const iceServers: CallIceServerResource[] = [];
    const turnUrls = this.getTurnUrls(connectedRelayTurnUrls);
    const diagnostics = new CallIceServerDiagnostics(
      turnUrls,
      this.values.turnUrls.length > 0,
      this.values.turnSharedSecretConfigured,
    ).toResource();

    if (turnUrls.length > 0) {
      const credentials = this.createTurnCredentials(
        identityId,
        this.values.turnUrls.length > 0,
      );

      if (credentials) {
        iceServers.push({
          credential: credentials.credential,
          urls: turnUrls,
          username: credentials.username,
        });
      }
    }

    if (this.values.stunUrls.length > 0) {
      iceServers.push({
        urls: this.values.stunUrls,
      });
    }

    return {
      diagnostics,
      iceServers,
      iceTransportPolicy: this.values.iceTransportPolicy,
    };
  }
}
