import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';
import { CommunityId } from './value-objects/CommunityId';

/**
 * Replicated record id of a channel message. The author is part of it so that
 * another identity can never write over a message that is not theirs.
 */
export class CommunityChannelMessageRecordId {
  public static of(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    authorIdentityId: IdentityId,
  ): string {
    return `community:${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}:${authorIdentityId.valueOf()}`;
  }
}
