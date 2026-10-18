import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { ConversationDraft } from '../../domain/ConversationDraft';
import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraftPosition } from './ConversationDraftPosition';
import { ConversationDraftsFindMessage } from './messages/ConversationDraftsFindMessage';

export default class ConversationDraftsFinder {
  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public async find(
    message: ConversationDraftsFindMessage,
  ): Promise<PageSlice<ConversationDraft>> {
    const drafts = await this.draftRepository.findByIdentity(
      message.identityId,
    );

    return PageSlice.of({
      after: message.after,
      items: drafts,
      limit: message.limit,
      order: 'desc',
      position: (draft) => ConversationDraftPosition.of(draft),
    });
  }
}
