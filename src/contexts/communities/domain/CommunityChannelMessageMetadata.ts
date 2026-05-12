import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';
import { CommunityId } from './value-objects/CommunityId';

export class CommunityChannelMessageMetadata {
  constructor(
    private readonly id: CommunityChannelMessageId,
    private readonly communityId: CommunityId,
    private readonly channelId: CommunityChannelId,
    private readonly authorIdentityId: IdentityId,
    private readonly createdAt: Timestamp,
  ) {}

  public getId(): CommunityChannelMessageId {
    return this.id;
  }

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getChannelId(): CommunityChannelId {
    return this.channelId;
  }

  public getAuthorIdentityId(): IdentityId {
    return this.authorIdentityId;
  }

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }
}
