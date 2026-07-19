import { CallIceServerConfig } from '@app/apps/apis/calls-api/CallIceServerConfig';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { normalizeRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import { createHmac } from 'crypto';

describe('CallIceServerConfig', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should expose TURN servers with relay-only transport by default', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_CREDENTIAL: 'turn-password',
      CALLS_TURN_URLS:
        'turn:turn.example.test:3478?transport=udp, turn:turn.example.test:3478?transport=tcp',
      CALLS_TURN_USERNAME: 'turn-user',
    }).toResource(identityId);

    expect(resource).toEqual({
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
      iceTransportPolicy: 'relay',
    });
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

  it('should not use connected relay TURN urls without a shared secret', () => {
    const connectedRelayUrl =
      'turn:connected-relay.example.test:4199?transport=udp';
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_TURN_CREDENTIAL: 'turn-password',
      CALLS_TURN_USERNAME: 'turn-user',
    }).toResource(identityId, [connectedRelayUrl]);

    expect(resource).toEqual({
      iceServers: [],
      iceTransportPolicy: 'all',
    });
  });

  it('should include STUN only when explicitly configured', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_ICE_TRANSPORT_POLICY: 'all',
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
    }).toResource(identityId);

    expect(resource).toEqual({
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'all',
    });
  });

  it('should not return default relay-only transport policy without TURN servers', () => {
    const emptyResource = CallIceServerConfig.fromEnvironment({}).toResource(
      identityId,
    );
    const stunResource = CallIceServerConfig.fromEnvironment({
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
    }).toResource(identityId);

    expect(emptyResource).toEqual({
      iceServers: [],
      iceTransportPolicy: 'all',
    });
    expect(stunResource).toEqual({
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
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'relay',
    });
  });

  it('should respect explicit relay-only transport policy without TURN credentials', () => {
    const resource = CallIceServerConfig.fromEnvironment({
      CALLS_ICE_TRANSPORT_POLICY: 'relay',
      CALLS_STUN_URLS: 'stun:stun.example.test:3478',
      CALLS_TURN_URLS: 'turn:turn.example.test:3478?transport=udp',
    }).toResource(identityId);

    expect(resource).toEqual({
      iceServers: [
        {
          urls: ['stun:stun.example.test:3478'],
        },
      ],
      iceTransportPolicy: 'relay',
    });
  });
});
