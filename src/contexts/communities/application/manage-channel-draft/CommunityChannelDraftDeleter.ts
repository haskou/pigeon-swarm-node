import CommunityChannelDraftRepository from '../../domain/repositories/CommunityChannelDraftRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelDraftDeleteMessage } from './messages/CommunityChannelDraftDeleteMessage';

export default class CommunityChannelDraftDeleter {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly draftRepository: CommunityChannelDraftRepository,
  ) {}

  public async delete(
    message: CommunityChannelDraftDeleteMessage,
  ): Promise<void> {
    const community = await this.communityRepository.requireById(
      message.communityId,
    );

    community.viewTextChannel(message.actorIdentityId, message.channelId);
    await this.draftRepository.delete(
      message.actorIdentityId,
      message.communityId,
      message.channelId,
    );
  }
}
