import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageMetadata } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMetadata';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessagePollOptions } from '@app/contexts/conversations/domain/value-objects/MessagePollOptions';

import { PollTimelineMessageRegisterMessage } from './messages/PollTimelineMessageRegisterMessage';

export default class PollTimelineMessageRegistrar {
  constructor(
    private readonly conversationRepository: ConversationRepository,

    private readonly communityMessageRepository: CommunityChannelMessageRepository,
  ) {}

  private async registerConversationTimelineMessage(
    message: PollTimelineMessageRegisterMessage,
  ): Promise<void> {
    const scope = message.poll.getScope();
    const conversationId = scope.getConversationId();

    if (!conversationId) {
      return;
    }
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
  ): Promise<void> {
    const scope = message.poll.getScope();
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();

    if (!communityId || !channelId) {
      return;
    }
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
    await this.registerConversationTimelineMessage(message);
    await this.registerCommunityChannelTimelineMessage(message);
  }
}
