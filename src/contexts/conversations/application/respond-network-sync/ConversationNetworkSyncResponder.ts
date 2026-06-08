import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import ConversationSyncResponder from '../respond-sync/ConversationSyncResponder';
import { ConversationSyncResponseMessage } from '../respond-sync/messages/ConversationSyncResponseMessage';
import { ConversationNetworkSyncResponseMessage } from './messages/ConversationNetworkSyncResponseMessage';

export default class ConversationNetworkSyncResponder {
  private static readonly CONVERSATION_CANDIDATE_LIMIT = 100;

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly conversationSyncResponder: ConversationSyncResponder,
  ) {}

  public async respond(
    message: ConversationNetworkSyncResponseMessage,
  ): Promise<void> {
    const conversations = await this.conversationRepository.findByNetworkId(
      message.networkId,
      ConversationNetworkSyncResponder.CONVERSATION_CANDIDATE_LIMIT,
    );

    for (const conversation of conversations) {
      await this.conversationSyncResponder.respond(
        new ConversationSyncResponseMessage(
          conversation.getId().valueOf(),
          message.networkId.valueOf(),
          message.requestId,
        ),
      );
    }
  }
}
