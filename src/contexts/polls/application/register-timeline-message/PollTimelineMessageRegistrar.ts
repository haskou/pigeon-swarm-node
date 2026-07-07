import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageMetadata } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMetadata';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessagePollOptions } from '@app/contexts/conversations/domain/value-objects/MessagePollOptions';

import { PollTimelineMessageRegisterMessage } from './messages/PollTimelineMessageRegisterMessage';

export default class PollTimelineMessageRegistrar {
  constructor(
    private readonly conversationRepository: ConversationRepository,

    private readonly communityMessageRepository: CommunityChannelMessageRepository,
  ) {}

  private async registerConversationTimelineMessage(
    message: PollTimelineMessageRegisterMessage,
    conversationId: ConversationId,
  ): Promise<void> {
    const conversation =
      await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      return;
    }
    conversation.addPollMessage(
      message.actorIdentityId,
      message.poll.getId(),
      message.signature,
      new MessagePollOptions(message.poll.getCreatedAt()),
    );
    await this.conversationRepository.save(conversation);
  }

  private async registerCommunityChannelTimelineMessage(
    message: PollTimelineMessageRegisterMessage,
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void> {
    await this.communityMessageRepository.save(
      CommunityChannelMessage.poll(
        new CommunityChannelMessageMetadata(
          new CommunityChannelMessageId(message.poll.getId().valueOf()),
          communityId,
          channelId,
          message.actorIdentityId,
          message.poll.getCreatedAt(),
        ),
        message.poll.getId(),
      ),
    );
  }

  public async register(
    message: PollTimelineMessageRegisterMessage,
  ): Promise<void> {
    await message.poll.getScope().match<Promise<void>>({
      communityChannel: (communityId, channelId) =>
        this.registerCommunityChannelTimelineMessage(
          message,
          communityId,
          channelId,
        ),
      groupConversation: (conversationId) =>
        this.registerConversationTimelineMessage(message, conversationId),
    });
  }
}
