import { CallIceServerConfig } from '@app/apps/apis/calls-api/CallIceServerConfig';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
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
      CALLS_TURN_URLS: 'turn:turn.example.test:3478?transport=udp, turn:turn.example.test:3478?transport=tcp',
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
});
