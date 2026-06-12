import ConversationMessagePinRepository from '../../domain/repositories/ConversationMessagePinRepository';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { MessageId } from '../../domain/value-objects/MessageId';
import ConversationMessagePinAccess from './ConversationMessagePinAccess';
import { ConversationMessagePinResource } from './ConversationMessagePinResource';
import { ConversationMessagePinsFindMessage } from './messages/ConversationMessagePinsFindMessage';

export default class ConversationMessagePinsFinder {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly pinRepository: ConversationMessagePinRepository,
    private readonly access: ConversationMessagePinAccess,
  ) {}

  public async find(
    message: ConversationMessagePinsFindMessage,
  ): Promise<ConversationMessagePinResource[]> {
    await this.access.findReadableConversation(
      message.conversationId,
      message.identityId,
    );

    const pins = await this.pinRepository.findByConversation(
      message.conversationId,
    );
    const resources: ConversationMessagePinResource[] = [];

    for (const pin of pins) {
      const pinnedMessage = await this.conversationRepository.findMessageById(
        message.conversationId,
        new MessageId(pin.messageId),
      );

      if (pinnedMessage) {
        resources.push({
          createdAt: pin.createdAt,
          message: pinnedMessage,
          messageId: pin.messageId,
          pinnedByIdentityId: pin.pinnedByIdentityId,
        });
      }
    }

    return resources;
  }
}
