import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { CommunityChannelDraft } from '../../domain/CommunityChannelDraft';
import CommunityChannelDraftRepository from '../../domain/repositories/CommunityChannelDraftRepository';
import { CommunityChannelDraftsPage } from './CommunityChannelDraftsPage';
import { CommunityChannelDraftsFindMessage } from './messages/CommunityChannelDraftsFindMessage';

export default class CommunityChannelDraftsFinder {
  /**
   * `["updatedAt fixed-width timestamp","communityId","channelId"]` as JSON: the ids may hold
   * any character, so a JSON array is the only unambiguous encoding of the tuple.
   */
  public static position(draft: CommunityChannelDraft): string {
    return JSON.stringify([
      PageTimestamp.of(draft.getUpdatedAt().valueOf()),
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
