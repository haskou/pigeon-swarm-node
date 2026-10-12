import CommunityChannelDraftRepository from '../../domain/repositories/CommunityChannelDraftRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelDraftSaveMessage } from './messages/CommunityChannelDraftSaveMessage';

export default class CommunityChannelDraftSaver {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly draftRepository: CommunityChannelDraftRepository,
  ) {}

  public async save(message: CommunityChannelDraftSaveMessage): Promise<void> {
    const community = await this.communityRepository.requireById(
      message.communityId,
    );

    community.viewTextChannel(message.actorIdentityId, message.channelId);
    await this.draftRepository.save(
      message.actorIdentityId,
      message.communityId,
      message.channelId,
      message.encryptedPayload,
      message.updatedAt,
    );
  }
}
