import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import ConversationDraftAccess from './ConversationDraftAccess';
import { ConversationDraftSaveMessage } from './messages/ConversationDraftSaveMessage';

export default class ConversationDraftSaver {
  constructor(
    private readonly draftRepository: ConversationDraftRepository,
    private readonly access: ConversationDraftAccess,
  ) {}

  public async save(message: ConversationDraftSaveMessage): Promise<void> {
    await this.access.assertCanRead(message.conversationId, message.identityId);
    await this.draftRepository.save(
      message.identityId,
      message.conversationId,
      message.encryptedPayload,
      message.updatedAt,
    );
  }
}
