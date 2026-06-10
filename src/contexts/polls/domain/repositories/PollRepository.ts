import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';

import { Poll } from '../Poll';
import { PollId } from '../value-objects/PollId';

export default abstract class PollRepository {
  public abstract findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]>;

  public abstract findByGroupConversation(
    conversationId: ConversationId,
    limit: number,
    beforeCreatedAt?: number,
  ): Promise<Poll[]>;

  public abstract findById(id: PollId): Promise<Poll | undefined>;
  public abstract save(poll: Poll): Promise<void>;
}
