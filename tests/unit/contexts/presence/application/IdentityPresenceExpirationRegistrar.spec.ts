import IdentityPresenceExpirationRegistrar from '@app/contexts/presence/application/expire/IdentityPresenceExpirationRegistrar';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import LocalRealtimeEventPublisher from '@app/shared/infrastructure/websocket/LocalRealtimeEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityPresenceExpirationRegistrar', () => {
  let repository: MockProxy<IdentityPresenceRepository>;
  let localPublisher: MockProxy<LocalRealtimeEventPublisher>;
  let registrar: IdentityPresenceExpirationRegistrar;

  beforeEach(() => {
    repository = mock<IdentityPresenceRepository>();
    localPublisher = mock<LocalRealtimeEventPublisher>();
    registrar = new IdentityPresenceExpirationRegistrar(
      repository,
      localPublisher,
    );
  });

  it('disconnects an expired lease and tells only local realtime clients', async () => {
    repository.findPotentiallyExpired.mockResolvedValue([
      IdentityPresence.fromPrimitives({
        identityId:
          'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
        lastHeartbeatAt: 1,
        preferenceUpdatedAt: 1,
        selectedStatus: 'available',
        status: 'available',
        updatedAt: 1,
      }),
    ]);

    await registrar.expire();

    expect(repository.save.mock.calls[0][0].isConnected()).toBe(false);
    expect(localPublisher.publish).toHaveBeenCalledTimes(1);
    expect(localPublisher.publish.mock.calls[0][0][0].attributes).toEqual(
      expect.objectContaining({ status: 'disconnected' }),
    );
  });
});
