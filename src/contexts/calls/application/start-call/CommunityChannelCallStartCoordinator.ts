import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';

import { Call } from '../../domain/Call';

type PendingCommunityChannelCallStart = {
  channelId: CommunityChannelId;
  communityId: CommunityId;
  tail: Promise<void>;
};

export default class CommunityChannelCallStartCoordinator {
  private readonly pendingStarts: PendingCommunityChannelCallStart[] = [];

  private findPendingStart(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): PendingCommunityChannelCallStart | undefined {
    return this.pendingStarts.find(
      (pendingStart) =>
        pendingStart.communityId.isEqual(communityId) &&
        pendingStart.channelId.isEqual(channelId),
    );
  }

  private removePendingStart(
    pendingStart: PendingCommunityChannelCallStart,
    tail: Promise<void>,
  ): void {
    if (pendingStart.tail !== tail) {
      return;
    }

    const index = this.pendingStarts.indexOf(pendingStart);

    if (index >= 0) {
      this.pendingStarts.splice(index, 1);
    }
  }

  public async coordinate(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    start: () => Promise<Call>,
  ): Promise<Call> {
    const pendingStart = this.findPendingStart(communityId, channelId) ?? {
      channelId,
      communityId,
      tail: Promise.resolve(),
    };
    const previous = pendingStart.tail;
    let release = (): void => undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => turn);

    pendingStart.tail = tail;

    if (!this.pendingStarts.includes(pendingStart)) {
      this.pendingStarts.push(pendingStart);
    }

    await previous;

    try {
      return await start();
    } finally {
      release();
      this.removePendingStart(pendingStart, tail);
    }
  }
}
