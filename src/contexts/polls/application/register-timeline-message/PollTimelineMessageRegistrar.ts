import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageMetadata } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMetadata';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';

import { PollTimelineMessageRegisterMessage } from './messages/PollTimelineMessageRegisterMessage';

/**
 * Community channels keep their timeline on the node, so a poll there becomes a
 * channel message. A group conversation timeline lives only in the members'
 * opaque mailboxes: the node writes nothing for it.
 */
export default class PollTimelineMessageRegistrar {
  constructor(
    private readonly communityMessageRepository: CommunityChannelMessageRepository,
  ) {}

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
      message.proof,
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
      groupConversation: () => Promise.resolve(),
    });
  }
}
