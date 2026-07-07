import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';

import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityChannelMessagesPage } from './CommunityChannelMessagesPage';
import { CommunityChannelMessagesFindMessage } from './messages/CommunityChannelMessagesFindMessage';
import { CommunityChannelThreadMessagesFindMessage } from './messages/CommunityChannelThreadMessagesFindMessage';

export default class CommunityChannelMessagesFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
    private readonly pollRepository: PollRepository,
  ) {}

  private messageIds(
    messages: CommunityChannelMessage[],
  ): Array<ReturnType<CommunityChannelMessage['getId']>> {
    return messages.map((message) => message.getId());
  }

  public async find(
    message: CommunityChannelMessagesFindMessage,
  ): Promise<CommunityChannelMessagesPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewTextChannel(message.actorIdentityId, message.channelId);
    const messages = await this.messageRepository.findByChannel(
      message.communityId,
      message.channelId,
      message.limit,
      message.beforeMessageId,
    );
    const reactions = await this.reactionRepository.findByMessageIds(
      message.communityId,
      message.channelId,
      this.messageIds(messages),
    );
    const upperBound = messages.at(-1)?.getCreatedAt().valueOf();
    const polls =
      message.beforeMessageId && messages.length === 0
        ? []
        : await this.pollRepository.findByCommunityChannel(
            message.communityId,
            message.channelId,
            message.limit,
            message.beforeMessageId ? upperBound : undefined,
          );

    return new CommunityChannelMessagesPage(
      messages,
      reactions,
      polls,
      message.limit,
    );
  }

  public async findThread(
    message: CommunityChannelThreadMessagesFindMessage,
  ): Promise<CommunityChannelMessagesPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewTextChannel(message.actorIdentityId, message.channelId);
    const messages = await this.messageRepository.findThreadMessages(
      message.communityId,
      message.channelId,
      message.messageId,
      message.limit,
    );
    const reactions = await this.reactionRepository.findByMessageIds(
      message.communityId,
      message.channelId,
      this.messageIds(messages),
    );

    return new CommunityChannelMessagesPage(
      messages,
      reactions,
      [],
      message.limit,
    );
  }
}
