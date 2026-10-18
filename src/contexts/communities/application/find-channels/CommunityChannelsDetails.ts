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
    private readonly pageChannelIds: string[],
    private readonly nextPosition: string | undefined,
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

  /** The ids of the channels on this page, text channels first. */
  public getPageChannelIds(): string[] {
    return [...this.pageChannelIds];
  }

  /** The position to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.nextPosition;
  }

  public getThreadSummariesByChannelId(): Map<
    string,
    CommunityChannelThreadSummary[]
  > {
    return new Map(this.threadSummariesByChannelId);
  }
}
