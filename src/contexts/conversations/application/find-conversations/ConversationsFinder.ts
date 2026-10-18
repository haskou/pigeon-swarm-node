import { DatedConversation } from '@app/contexts/conversations/domain/DatedConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { ConversationPosition } from './ConversationPosition';
import { ConversationsFindMessage } from './messages/ConversationsFindMessage';

/** One page of the requester's conversations, newest first. */
export default class ConversationsFinder {
  constructor(private readonly repository: ConversationRepository) {}

  public async find(
    message: ConversationsFindMessage,
  ): Promise<PageSlice<DatedConversation>> {
    const conversations = await this.repository.findByParticipant(
      message.requesterIdentityId,
    );

    return PageSlice.of({
      after: message.after,
      items: conversations,
      limit: message.limit,
      order: 'desc',
      position: (dated) => ConversationPosition.of(dated),
    });
  }
}
