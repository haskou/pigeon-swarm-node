import { IdentityPresenceViewModel } from '@app/apps/apis/presence-api/view-model/IdentityPresenceViewModel';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { PresenceStatus } from '@app/contexts/presence/domain/value-objects/PresenceStatus';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe('IdentityPresenceViewModel', () => {
  async function presenceOf(owner: KeyPair): Promise<IdentityPresence> {
    return IdentityPresence.fromPrimitives({
      identityId: new IdentityId(owner.toPrimitives().publicKey).valueOf(),
      lastActivityAt: 1770000000000,
      lastHeartbeatAt: 1770000000000,
      preferenceUpdatedAt: 1770000000000,
      selectedStatus: 'available',
      status: 'available',
      updatedAt: 1770000000000,
    });
  }

  it('hides the real status from a viewer who shares no conversation or community', async () => {
    const owner = await KeyPair.generate();
    const viewer = await KeyPair.generate();

    const resource = new IdentityPresenceViewModel(
      await presenceOf(owner),
      new IdentityId(viewer.toPrimitives().publicKey),
    ).toResource();

    expect(resource).toEqual({
      identityId: new IdentityId(owner.toPrimitives().publicKey).valueOf(),
      status: PresenceStatus.DISCONNECTED.valueOf(),
      updatedAt: 1770000000000,
    });
  });

  it('shows the real status to a viewer who shares a conversation or community', async () => {
    const owner = await KeyPair.generate();
    const viewer = await KeyPair.generate();

    const resource = new IdentityPresenceViewModel(
      await presenceOf(owner),
      new IdentityId(viewer.toPrimitives().publicKey),
      true,
    ).toResource();

    expect(resource).toMatchObject({ status: 'available' });
  });

  it('always shows an identity its own presence', async () => {
    const owner = await KeyPair.generate();

    const resource = new IdentityPresenceViewModel(
      await presenceOf(owner),
      new IdentityId(owner.toPrimitives().publicKey),
    ).toResource();

    expect(resource).toMatchObject({ status: 'available' });
  });
});
