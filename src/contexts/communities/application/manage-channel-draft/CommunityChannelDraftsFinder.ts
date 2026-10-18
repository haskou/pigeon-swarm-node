import { CommunityChannelDraft } from '../../domain/CommunityChannelDraft';
import CommunityChannelDraftRepository from '../../domain/repositories/CommunityChannelDraftRepository';
import { PageSlice } from '../pagination/PageSlice';
import { CommunityChannelDraftsPage } from './CommunityChannelDraftsPage';
import { CommunityChannelDraftsFindMessage } from './messages/CommunityChannelDraftsFindMessage';

export default class CommunityChannelDraftsFinder {
  /**
   * `["updatedAt ISO-8601","communityId","channelId"]` as JSON: the ids may hold
   * any character, so a JSON array is the only unambiguous encoding of the tuple.
   */
  public static position(draft: CommunityChannelDraft): string {
    return JSON.stringify([
      new Date(draft.getUpdatedAt().valueOf()).toISOString(),
      draft.getCommunityId().valueOf(),
      draft.getChannelId().valueOf(),
    ]);
  }

  constructor(
    private readonly draftRepository: CommunityChannelDraftRepository,
  ) {}

  public async find(
    message: CommunityChannelDraftsFindMessage,
  ): Promise<CommunityChannelDraftsPage> {
    const drafts = await this.draftRepository.findByIdentity(
      message.identityId,
    );
    const page = PageSlice.of({
      after: message.after,
      items: drafts,
      limit: message.limit,
      order: 'desc',
      position: CommunityChannelDraftsFinder.position,
    });

    return new CommunityChannelDraftsPage(page.items, page.nextPosition);
  }
}
