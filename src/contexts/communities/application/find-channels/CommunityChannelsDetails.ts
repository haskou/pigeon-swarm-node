import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { Community } from '../../domain/Community';
import { CommunityChannelThreadSummary } from '../../domain/CommunityChannelThreadSummary';

export class CommunityChannelsDetails {
  constructor(
    private readonly community: Community,
    private readonly actorIdentityId: IdentityId,
    private readonly connectedIdentityIdsByChannelId: Map<string, string[]>,
    private readonly threadSummariesByChannelId: Map<
      string,
      CommunityChannelThreadSummary[]
    >,
  ) {}

  public getActorIdentityId(): IdentityId {
    return this.actorIdentityId;
  }

  public getCommunity(): Community {
    return this.community;
  }

  public getConnectedIdentityIdsByChannelId(): Map<string, string[]> {
    return new Map(this.connectedIdentityIdsByChannelId);
  }

  public getThreadSummariesByChannelId(): Map<
    string,
    CommunityChannelThreadSummary[]
  > {
    return new Map(this.threadSummariesByChannelId);
  }
}
