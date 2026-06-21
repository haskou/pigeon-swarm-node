import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';

export class CommunityChannelMessagePin {
  constructor(
    private readonly messageId: CommunityChannelMessageId,
    private readonly pinnedByIdentityId: IdentityId,
    private readonly createdAt: Timestamp,
  ) {}

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public getMessageId(): CommunityChannelMessageId {
    return this.messageId;
  }

  public getPinnedByIdentityId(): IdentityId {
    return this.pinnedByIdentityId;
  }
}
