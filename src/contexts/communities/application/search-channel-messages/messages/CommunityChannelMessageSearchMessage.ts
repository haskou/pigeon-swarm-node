import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessageSearchMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly limit: number;
  public readonly query: string;

  constructor(
    communityId: string,
    channelId: string,
    actorIdentityId: string,
    query: string | undefined,
    limit: number | undefined,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.limit = Math.min(Math.max(limit ?? 20, 1), 50);
    this.query = query ?? '';
  }
}
