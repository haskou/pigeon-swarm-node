import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageMetadata } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMetadata';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';

import { PollTimelineMessageRegisterMessage } from './messages/PollTimelineMessageRegisterMessage';

/** Community channels keep their timeline on the node, so a poll becomes a channel message. */
export default class PollTimelineMessageRegistrar {
  constructor(
    private readonly communityMessageRepository: CommunityChannelMessageRepository,
  ) {}

  public async register(
    message: PollTimelineMessageRegisterMessage,
  ): Promise<void> {
    const scope = message.poll.getScope();

    await this.communityMessageRepository.save(
      CommunityChannelMessage.poll(
        new CommunityChannelMessageMetadata(
          new CommunityChannelMessageId(message.poll.getId().valueOf()),
          scope.getCommunityId(),
          scope.getChannelId(),
          message.actorIdentityId,
          message.poll.getCreatedAt(),
        ),
        message.poll.getId(),
      ),
      message.proof,
    );
  }
}
