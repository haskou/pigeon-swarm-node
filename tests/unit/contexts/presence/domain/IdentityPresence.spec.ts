import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('IdentityPresence', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
  );

  const connectedPresence = (): IdentityPresence =>
    IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      preferenceUpdatedAt: 1770000000000,
      selectedStatus: 'available',
      lastActivityAt: 1770000000000,
      lastHeartbeatAt: 1770000000000,
      status: 'available',
      updatedAt: 1770000000000,
    });

  it('keeps presence online when one heartbeat is skipped', () => {
    const presence = connectedPresence();

    presence.refreshDerivedStatus(new Timestamp(1770000020000));

    expect(presence.toPrimitives().status).toBe('available');
  });

  it('marks presence as disconnected after more than 20 seconds without heartbeat', () => {
    const presence = connectedPresence();

    presence.refreshDerivedStatus(new Timestamp(1770000020001));

    expect(presence.toPrimitives().status).toBe('disconnected');
  });

  it('records presence changes without naming a node or a network', () => {
    const presence = IdentityPresence.disconnected(identityId);

    presence.recordHeartbeat(true, new Timestamp(1770000000000));

    const [event] = presence.pullDomainEvents();

    expect(Object.keys(event.attributes).sort()).toEqual([
      'identityId',
      'lastActivityAt',
      'lastHeartbeatAt',
      'preferenceUpdatedAt',
      'selectedStatus',
      'status',
      'updatedAt',
    ]);
  });
});
