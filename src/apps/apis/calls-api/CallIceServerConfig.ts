import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { createHmac } from 'crypto';

import {
  CallIceServerResource,
  CallIceServersResource,
} from './resources/CallIceServersResource';
import { CallIceServerConfigValues } from './types/CallIceServerConfigValues';
import { CallIceServerEnvironment } from './types/CallIceServerEnvironment';
import { TurnCredentials } from './types/TurnCredentials';

export class CallIceServerConfig {
  private static readonly DEFAULT_CREDENTIAL_TTL_SECONDS = 3600;
  private static readonly DEFAULT_ICE_TRANSPORT_POLICY = 'relay';
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

  private static isConfiguredIceTransportPolicy(
    value: string | undefined,
  ): boolean {
    return value === 'all' || value === 'relay';
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

  private static getTurnPublicHost(
    environment: CallIceServerEnvironment,
  ): string | undefined {
    return environment.CALLS_TURN_PUBLIC_HOST || environment.PIGEON_PUBLIC_HOST;
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
  ): string[] {
    const explicitUrls = this.splitEnvironmentList(environment.CALLS_TURN_URLS);
    const publicHost = this.getTurnPublicHost(environment);
    const port = Number(environment.CALLS_TURN_PORT);

    if (!publicHost || !Number.isInteger(port) || port <= 0) {
      return explicitUrls;
    }

    const generatedUrls = this.getTurnTransports(environment).map(
      (transport) => `turn:${publicHost}:${port}?transport=${transport}`,
    );

    return this.unique([...explicitUrls, ...generatedUrls]);
  }

  public static fromEnvironment(
    environment: CallIceServerEnvironment = pigeonEnvironment(),
  ): CallIceServerConfig {
    return new CallIceServerConfig({
      iceTransportPolicy: this.normalizeIceTransportPolicy(
        environment.CALLS_ICE_TRANSPORT_POLICY,
      ),
      iceTransportPolicyConfigured: this.isConfiguredIceTransportPolicy(
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
      turnSharedSecret: environment.CALLS_TURN_SHARED_SECRET,
      turnUrls: this.getAdvertisedTurnUrls(environment),
      turnUsername: environment.CALLS_TURN_USERNAME,
    });
  }

  public constructor(private readonly values: CallIceServerConfigValues) {}

  private iceTransportPolicyFor(turnUrls: string[]): 'all' | 'relay' {
    if (
      turnUrls.length === 0 &&
      this.values.iceTransportPolicy === 'relay' &&
      !this.values.iceTransportPolicyConfigured
    ) {
      return 'all';
    }

    return this.values.iceTransportPolicy;
  }

  private createTurnCredentials(identityId: IdentityId): TurnCredentials {
    if (!this.values.turnSharedSecret) {
      return {
        credential: this.values.turnCredential,
        username: this.values.turnUsername,
      };
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

  public toResource(
    identityId: IdentityId,
    discoveredTurnUrls: string[] = [],
  ): CallIceServersResource {
    const iceServers: CallIceServerResource[] = [];
    const turnUrls =
      this.values.turnDiscoveryEnabled && this.values.turnSharedSecret
        ? CallIceServerConfig.unique([
            ...this.values.turnUrls,
            ...discoveredTurnUrls,
          ])
        : this.values.turnUrls;

    if (turnUrls.length > 0) {
      const credentials = this.createTurnCredentials(identityId);

      iceServers.push({
        credential: credentials.credential,
        urls: turnUrls,
        username: credentials.username,
      });
    }

    if (this.values.stunUrls.length > 0) {
      iceServers.push({
        urls: this.values.stunUrls,
      });
    }

    return {
      iceServers,
      iceTransportPolicy: this.iceTransportPolicyFor(turnUrls),
    };
  }
}
