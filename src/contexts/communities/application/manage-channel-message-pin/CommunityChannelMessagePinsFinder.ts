import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
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
    const community = await this.communityRepository.findById(
      message.communityId,
    );

    if (!community) {
      throw new CommunityNotFoundError();
    }

    community.viewTextChannel(message.actorIdentityId, message.channelId);

    const pins = await this.pinRepository.findByChannel(
      message.communityId,
      message.channelId,
    );
    const details: CommunityChannelMessagePinDetails[] = [];

    for (const pin of pins) {
      const pinnedMessage = await this.messageRepository.findById(
        message.communityId,
        message.channelId,
        pin.getMessageId(),
      );

      if (pinnedMessage) {
        details.push(new CommunityChannelMessagePinDetails(pin, pinnedMessage));
      }
    }

    return details;
  }
}
