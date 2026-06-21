import { CommunityChannelDraft } from '../../domain/CommunityChannelDraft';
import CommunityChannelDraftRepository from '../../domain/repositories/CommunityChannelDraftRepository';
import { CommunityChannelDraftsFindMessage } from './messages/CommunityChannelDraftsFindMessage';

export default class CommunityChannelDraftsFinder {
  constructor(
    private readonly draftRepository: CommunityChannelDraftRepository,
  ) {}

  public find(
    message: CommunityChannelDraftsFindMessage,
  ): Promise<CommunityChannelDraft[]> {
    return this.draftRepository.findByIdentity(message.identityId);
  }
}
