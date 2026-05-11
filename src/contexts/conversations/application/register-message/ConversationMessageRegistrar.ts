import { PublicKey, Signature } from '@haskou/value-objects';

import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { InvalidMessageSignatureError } from '../../domain/errors/InvalidMessageSignatureError';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { MessageSignatureDomainService } from '../../domain/services/MessageSignatureDomainService';
import { RegisterConversationMessage } from './messages/RegisterConversationMessage';

export default class ConversationMessageRegistrar {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly signatureService: MessageSignatureDomainService,
  ) {}

  public async register(message: RegisterConversationMessage): Promise<void> {
    const conversation = await this.repository.findById(message.conversationId);

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    const candidate = await this.repository.findCandidateMessageById(
      message.conversationId,
      message.messageId,
    );

    if (!candidate) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    const isValidSignature = this.signatureService.isValidSignature(
      PublicKey.fromPEM(candidate.getAuthorId().toString()),
      candidate.toPrimitives(),
      new Signature(candidate.toPrimitives().signature),
    );

    if (!isValidSignature) {
      throw new InvalidMessageSignatureError();
    }

    conversation.registerMessage(candidate);
    await this.repository.save(conversation);
  }
}
