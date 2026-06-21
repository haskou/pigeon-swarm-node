import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import { CommunityChannelMessagesPage } from '../find-channel-messages/CommunityChannelMessagesPage';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityChannelMessageSearchMessage } from './messages/CommunityChannelMessageSearchMessage';

export default class CommunityChannelMessageSearchFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
  ) {}

  public async find(
    message: CommunityChannelMessageSearchMessage,
  ): Promise<CommunityChannelMessagesPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.searchTextChannelMessages(
      message.actorIdentityId,
      message.channelId,
    );
    const messages = await this.messageRepository.searchPublicByChannel(
      message.communityId,
      message.channelId,
      message.query,
      message.limit,
    );
    const reactions = await this.reactionRepository.findByMessageIds(
      message.communityId,
      message.channelId,
      messages.map((channelMessage) => channelMessage.getId()),
    );

    return new CommunityChannelMessagesPage(
      messages,
      reactions,
      [],
      message.limit,
    );
  }
}
