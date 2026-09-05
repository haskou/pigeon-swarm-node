import { CallIceServerConfig } from '@app/apps/apis/calls-api/CallIceServerConfig';
import { CallTurnSharedSecret } from '@app/apps/apis/calls-api/CallTurnSharedSecret';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { normalizeRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import { createHmac } from 'crypto';

describe('CallIceServerConfig', () => {
  it.each([undefined, '', CallTurnSharedSecret.REJECTED_PUBLIC_SECRET])(
    'should not issue local or discovered TURN credentials with a missing or public secret',
    (secret) => {
      const local = CallIceServerConfig.fromEnvironment({
        CALLS_TURN_SHARED_SECRET: secret,
        CALLS_TURN_URLS: 'turn:relay.example.test:3478',
      }).toResource(identityId);
      const discovered = CallIceServerConfig.fromEnvironment({
        CALLS_TURN_SHARED_SECRET: secret,
      }).toResource(identityId, ['turn:remote.example.test:3478']);
      expect(local.iceServers).toEqual([]);
      expect(discovered.iceServers).toEqual([]);
    },
  );
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should preserve direct ICE fallback when TURN is advertised by default', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_CREDENTIAL: 'turn-password',
      CALLS_TURN_URLS:
        'turn:turn.example.test:3478?transport=udp, turn:turn.example.test:3478?transport=tcp',
      CALLS_TURN_USERNAME: 'turn-user',
    }).toResource(identityId);

    expect(resource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'local-configuration',
        nonPublicTurnUrls: [],
      },
      iceServers: [
        {
          credential: 'turn-password',
          urls: [
            'turn:turn.example.test:3478?transport=udp',
            'turn:turn.example.test:3478?transport=tcp',
          ],
          username: 'turn-user',
        },
      ],
      iceTransportPolicy: 'all',
    });
  });

  it('should flag loopback and private TURN hosts as unreachable across relays', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
      CALLS_TURN_URLS: [
        'turn:turn.example.test:3478?transport=udp',
        'turn:127.0.0.1:3478?transport=udp',
        'turn:10.0.0.5:3478?transport=udp',
        'turn:192.168.1.10:3478?transport=udp',
        'turn:coturn.local:3478?transport=udp',
      ].join(','),
    }).toResource(identityId);

    expect(resource.diagnostics).toEqual({
      turnSharedSecretConfigured: true,
      turnSource: 'local-configuration',
      nonPublicTurnUrls: [
        'turn:127.0.0.1:3478?transport=udp',
        'turn:10.0.0.5:3478?transport=udp',
        'turn:192.168.1.10:3478?transport=udp',
        'turn:coturn.local:3478?transport=udp',
      ],
    });
  });

  it('should flag bracketed IPv6 TURN hosts as unreachable across relays', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
      CALLS_TURN_URLS: [
        'turn:[2001:db8::1]:3478?transport=udp',
        'turn:[::1]:3478?transport=udp',
        'turn:[fc00::1]:3478?transport=udp',
        'turn:[fe80::1]:3478?transport=udp',
      ].join(','),
    }).toResource(identityId);

    expect(resource.diagnostics.nonPublicTurnUrls).toEqual([
      'turn:[::1]:3478?transport=udp',
      'turn:[fc00::1]:3478?transport=udp',
      'turn:[fe80::1]:3478?transport=udp',
    ]);
  });

  it('should generate temporary coturn REST credentials when shared secret exists', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_CREDENTIAL_TTL_SECONDS: '600',
      CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
      CALLS_TURN_URLS: 'turn:turn.example.test:3478?transport=udp',
    }).toResource(identityId);
    const username = `1770000600:${identityId.valueOf()}`;
    const credential = createHmac('sha1', 'turn-shared-secret')
      .update(username)
      .digest('base64');

    expect(resource.iceServers[0]).toEqual({
      credential,
      urls: ['turn:turn.example.test:3478?transport=udp'],
      username,
    });
  });

  it('should derive local TURN urls from the public host and configured TURN port', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const resource = CallIceServerConfig.fromEnvironment(
      {
        CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
      },
      normalizeRelayRuntimeSettings({
        callsRelay: {
          port: 4199,
        },
        privateRelay: {
          enabled: true,
          portEnd: 4205,
          portStart: 4201,
        },
        publicHost: 'relay.example.test',
      }),
    ).toResource(identityId);
    const username = `1770003600:${identityId.valueOf()}`;
    const credential = createHmac('sha1', 'turn-shared-secret')
      .update(username)
      .digest('base64');

    expect(resource.iceServers[0]).toEqual({
      credential,
      urls: [
        'turn:relay.example.test:4199?transport=udp',
        'turn:relay.example.test:4199?transport=tcp',
      ],
      username,
    });
  });

  it('should prefer local TURN urls over connected relay urls', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const discoveredUrl = 'turn:remote-relay.example.test:4199?transport=udp';
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
      CALLS_TURN_URLS: 'turn:local-relay.example.test:4199?transport=udp',
    }).toResource(identityId, [discoveredUrl]);

    expect(resource.iceServers[0].urls).toEqual([
      'turn:local-relay.example.test:4199?transport=udp',
    ]);

    const staticCredentialResource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_CREDENTIAL: 'turn-password',
      CALLS_TURN_URLS: 'turn:local-relay.example.test:4199?transport=udp',
      CALLS_TURN_USERNAME: 'turn-user',
    }).toResource(identityId, [discoveredUrl]);

    expect(staticCredentialResource.iceServers[0].urls).toEqual([
      'turn:local-relay.example.test:4199?transport=udp',
    ]);
  });

  it('should use the connected relay TURN urls when no local relay is configured', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const connectedRelayTurnUrls = [
      'turn:connected-relay.example.test:4199?transport=udp',
      'turn:connected-relay.example.test:4199?transport=tcp',
    ];
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
    }).toResource(identityId, connectedRelayTurnUrls);

    expect(resource.iceServers[0]).toEqual({
      credential: createHmac('sha1', 'turn-shared-secret')
        .update(`1770003600:${identityId.valueOf()}`)
        .digest('base64'),
      urls: connectedRelayTurnUrls,
      username: `1770003600:${identityId.valueOf()}`,
    });
  });

  it('should not reuse local static credentials for a connected relay', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const connectedRelayUrl =
      'turn:connected-relay.example.test:4199?transport=udp';
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_CREDENTIAL: 'local-turn-password',
      CALLS_TURN_USERNAME: 'local-turn-user',
    }).toResource(identityId, [connectedRelayUrl]);
    expect(resource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'connected-relay-record',
        nonPublicTurnUrls: [],
      },
      iceServers: [],
      iceTransportPolicy: 'all',
    });
  });

  it('should omit local TURN without private or static credentials', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const resource = CallIceServerConfig.fromEnvironment(
      {},
      normalizeRelayRuntimeSettings({
        callsRelay: {
          port: 4199,
        },
        privateRelay: {
          enabled: true,
          portEnd: 4205,
          portStart: 4201,
        },
        publicHost: 'relay.example.test',
      }),
    ).toResource(identityId);
    expect(resource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'local-configuration',
        nonPublicTurnUrls: [],
      },
      iceServers: [],
      iceTransportPolicy: 'all',
    });
  });

  it('should not advertise a persisted TURN listener when its sidecar configuration is incomplete', () => {
    const connectedRelayUrl =
      'turn:connected-relay.example.test:4199?transport=udp';
    const resource = CallIceServerConfig.fromEnvironment(
      {
        CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
      },
      normalizeRelayRuntimeSettings({
        callsRelay: {
          port: 4199,
        },
        publicHost: 'relay.example.test',
      }),
    ).toResource(identityId, [connectedRelayUrl]);

    expect(resource.iceServers[0]?.urls).toEqual([connectedRelayUrl]);
  });

  it('should preserve explicit external TURN urls when the local sidecar is disabled', () => {
    const explicitUrl = 'turn:external-relay.example.test:3478?transport=udp';
    const resource = CallIceServerConfig.fromEnvironment(
      {
        CALLS_TURN_SHARED_SECRET: 'turn-shared-secret',
        CALLS_TURN_URLS: explicitUrl,
      },
      normalizeRelayRuntimeSettings({
        callsRelay: {
          port: 4199,
        },
        publicHost: 'relay.example.test',
      }),
    ).toResource(identityId);

    expect(resource.iceServers[0]?.urls).toEqual([explicitUrl]);
  });

  it('should include STUN only when explicitly configured', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_ICE_TRANSPORT_POLICY: 'all',
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
    }).toResource(identityId);

    expect(resource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'none',
        nonPublicTurnUrls: [],
      },
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'all',
    });
  });

  it('should use the default all transport policy without TURN servers', () => {
    const emptyResource = CallIceServerConfig.fromEnvironment({}).toResource(
      identityId,
    );
    const stunResource = CallIceServerConfig.fromEnvironment({
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
    }).toResource(identityId);

    expect(emptyResource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'none',
        nonPublicTurnUrls: [],
      },
      iceServers: [],
      iceTransportPolicy: 'all',
    });
    expect(stunResource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'none',
        nonPublicTurnUrls: [],
      },
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'all',
    });
  });

  it('should respect explicit relay-only transport policy without TURN servers', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_ICE_TRANSPORT_POLICY: 'relay',
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
    }).toResource(identityId);

    expect(resource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'none',
        nonPublicTurnUrls: [],
      },
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'relay',
    });
  });

  it('should preserve relay-only policy when TURN credentials are unavailable', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_ICE_TRANSPORT_POLICY: 'relay',
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
      CALLS_TURN_URLS: 'turn:turn.example.test:3478?transport=udp',
    }).toResource(identityId);
    expect(resource).toEqual({
      diagnostics: {
        turnSharedSecretConfigured: false,
        turnSource: 'local-configuration',
        nonPublicTurnUrls: [],
      },
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'relay',
    });
  });
});
