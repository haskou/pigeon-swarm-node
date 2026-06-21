import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityMessagesSearchResult } from './CommunityMessagesSearchResult';
import { CommunityMessagesSearchMessage } from './messages/CommunityMessagesSearchMessage';

export default class CommunityMessagesSearcher {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
  ) {}

  public async search(
    message: CommunityMessagesSearchMessage,
  ): Promise<CommunityMessagesSearchResult> {
    const community = await this.communityFinder.findById(message.communityId);
    const visibleTextChannelIds = community.visibleTextChannelIdsFor(
      message.actorIdentityId,
    );

    community.searchMessages();
    const messages = await this.messageRepository.searchPublicByChannels(
      message.communityId,
      visibleTextChannelIds,
      message.query,
      message.limit,
    );
    const reactions = await this.reactionRepository.findByMessageIdsInChannels(
      message.communityId,
      visibleTextChannelIds,
      messages.map((channelMessage) => channelMessage.getId()),
    );

    return new CommunityMessagesSearchResult(messages, reactions);
  }
}
