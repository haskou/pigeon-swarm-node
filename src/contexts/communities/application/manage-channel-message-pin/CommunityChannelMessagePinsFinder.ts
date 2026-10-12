import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelMessagePinDetails } from './CommunityChannelMessagePinDetails';
import { CommunityChannelMessagePinsFindMessage } from './messages/CommunityChannelMessagePinsFindMessage';

export default class CommunityChannelMessagePinsFinder {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly pinRepository: CommunityChannelMessagePinRepository,
  ) {}

  public async find(
    message: CommunityChannelMessagePinsFindMessage,
  ): Promise<CommunityChannelMessagePinDetails[]> {
    const community = await this.communityRepository.requireById(
      message.communityId,
    );

    community.viewTextChannel(message.actorIdentityId, message.channelId);

    const pins = await this.pinRepository.findByChannel(
      message.communityId,
      message.channelId,
    );
    const details: CommunityChannelMessagePinDetails[] = [];

    for (const pin of pins) {
      try {
        const pinnedMessage = await this.messageRepository.requireById(
          message.communityId,
          message.channelId,
          pin.getMessageId(),
        );

        details.push(new CommunityChannelMessagePinDetails(pin, pinnedMessage));
      } catch (error) {
        if (!(error instanceof CommunityChannelMessageNotFoundError))
          throw error;
      }
    }

    return details;
  }
}
