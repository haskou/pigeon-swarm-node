import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair, Timestamp } from '@haskou/value-objects';

describe('IdentityPresence', () => {
  it('keeps presence online when one heartbeat is skipped', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const presence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: '550e8400-e29b-41d4-a716-446655440002',
      preferenceUpdatedAt: 1770000000000,
      selectedStatus: 'available',
      lastActivityAt: 1770000000000,
      lastHeartbeatAt: 1770000000000,
      status: 'available',
      updatedAt: 1770000000000,
    });

    presence.refreshDerivedStatus(
      ['network-id'],
      new Timestamp(1770000020000),
    );

    expect(presence.toPrimitives().status).toBe('available');
  });

  it('marks presence as disconnected after more than 20 seconds without heartbeat', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const presence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: '550e8400-e29b-41d4-a716-446655440002',
      preferenceUpdatedAt: 1770000000000,
      selectedStatus: 'available',
      lastActivityAt: 1770000000000,
      lastHeartbeatAt: 1770000000000,
      status: 'available',
      updatedAt: 1770000000000,
    });

    presence.refreshDerivedStatus(
      ['network-id'],
      new Timestamp(1770000020001),
    );

    expect(presence.toPrimitives().status).toBe('disconnected');
  });
});
