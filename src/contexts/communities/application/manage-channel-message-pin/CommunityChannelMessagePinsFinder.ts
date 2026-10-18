import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { PageSlice } from '../pagination/PageSlice';
import { CommunityChannelMessagePinDetails } from './CommunityChannelMessagePinDetails';
import { CommunityChannelMessagePinsPage } from './CommunityChannelMessagePinsPage';
import { CommunityChannelMessagePinsFindMessage } from './messages/CommunityChannelMessagePinsFindMessage';

export default class CommunityChannelMessagePinsFinder {
  /** `${createdAt ISO-8601}|${messageId}`: the pin order, unique per pin in a channel. */
  public static position(details: CommunityChannelMessagePinDetails): string {
    const pin = details.getPin();

    return `${new Date(pin.getCreatedAt().valueOf()).toISOString()}|${pin.getMessageId().valueOf()}`;
  }

  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly pinRepository: CommunityChannelMessagePinRepository,
  ) {}

  public async find(
    message: CommunityChannelMessagePinsFindMessage,
  ): Promise<CommunityChannelMessagePinsPage> {
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

    const page = PageSlice.of({
      after: message.after,
      items: details,
      limit: message.limit,
      order: 'desc',
      position: CommunityChannelMessagePinsFinder.position,
    });

    return new CommunityChannelMessagePinsPage(page.items, page.nextPosition);
  }
}
