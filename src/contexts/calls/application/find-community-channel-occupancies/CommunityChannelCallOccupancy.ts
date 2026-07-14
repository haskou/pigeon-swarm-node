import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CommunityChannelCallOccupancy {
  private readonly connectedIdentityIds: IdentityId[] = [];

  constructor(private readonly channelId: CommunityChannelId) {}

  public addConnectedIdentity(identityId: IdentityId): void {
    if (
      this.connectedIdentityIds.some((connectedIdentityId) =>
        connectedIdentityId.isEqual(identityId),
      )
    ) {
      return;
    }

    this.connectedIdentityIds.push(identityId);
  }

  public belongsTo(channelId: CommunityChannelId): boolean {
    return this.channelId.isEqual(channelId);
  }

  public getChannelId(): CommunityChannelId {
    return this.channelId;
  }

  public getConnectedIdentityIds(): IdentityId[] {
    return [...this.connectedIdentityIds];
  }
}
