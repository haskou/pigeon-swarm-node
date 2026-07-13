import CommunityChannelCallStartCoordinator from '@app/contexts/calls/application/start-call/CommunityChannelCallStartCoordinator';
import { Call } from '@app/contexts/calls/domain/Call';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { mock } from 'jest-mock-extended';

describe('CommunityChannelCallStartCoordinator', () => {
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('voice-1');

  it('serializes starts for the same community channel', async () => {
    const coordinator = new CommunityChannelCallStartCoordinator();
    const firstCall = mock<Call>();
    const secondCall = mock<Call>();
    let releaseFirst = (): void => undefined;
    let secondStarted = false;
    const first = coordinator.coordinate(communityId, channelId, async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      return firstCall;
    });
    const second = coordinator.coordinate(communityId, channelId, () => {
      secondStarted = true;

      return Promise.resolve(secondCall);
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);

    releaseFirst();

    await expect(first).resolves.toBe(firstCall);
    await expect(second).resolves.toBe(secondCall);
    expect(secondStarted).toBe(true);
  });

  it('does not serialize starts for different community channels', async () => {
    const coordinator = new CommunityChannelCallStartCoordinator();
    const firstCall = mock<Call>();
    const secondCall = mock<Call>();
    let releaseFirst = (): void => undefined;
    let secondStarted = false;
    const first = coordinator.coordinate(communityId, channelId, async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      return firstCall;
    });
    const second = coordinator.coordinate(
      communityId,
      new CommunityChannelId('voice-2'),
      () => {
        secondStarted = true;

        return Promise.resolve(secondCall);
      },
    );

    await expect(second).resolves.toBe(secondCall);
    expect(secondStarted).toBe(true);

    releaseFirst();
    await expect(first).resolves.toBe(firstCall);
  });

  it('releases the next start when the previous start fails', async () => {
    const coordinator = new CommunityChannelCallStartCoordinator();
    const nextCall = mock<Call>();
    const failure = new Error('start failed');
    const failed = coordinator.coordinate(communityId, channelId, () =>
      Promise.reject(failure),
    );
    const next = coordinator.coordinate(communityId, channelId, () =>
      Promise.resolve(nextCall),
    );

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe(nextCall);
  });
});
