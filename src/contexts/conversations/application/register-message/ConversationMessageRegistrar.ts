import { assert, PublicKey, Signature } from '@haskou/value-objects';

import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { InvalidMessageSignatureError } from '../../domain/errors/InvalidMessageSignatureError';
import { RemoteMessageCandidateMismatchError } from '../../domain/errors/RemoteMessageCandidateMismatchError';
import { Message } from '../../domain/Message';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { MessageSignatureDomainService } from '../../domain/services/MessageSignatureDomainService';
import { RegisterConversationMessage } from './messages/RegisterConversationMessage';

export default class ConversationMessageRegistrar {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly signatureService: MessageSignatureDomainService,
  ) {}

  private assertCandidateMatchesAnnouncement(
    message: RegisterConversationMessage,
    candidate: Message,
  ): void {
    assert(
      candidate.getConversationId().isEqual(message.conversationId),
      new RemoteMessageCandidateMismatchError(),
    );
    assert(
      candidate.getId().isEqual(message.messageId),
      new RemoteMessageCandidateMismatchError(),
    );
  }

  public async register(message: RegisterConversationMessage): Promise<void> {
    const conversation = await this.repository.findById(message.conversationId);

    assert(
      conversation !== undefined,
      new ConversationNotFoundError(message.conversationId),
    );

    const candidate = await this.repository.findCandidateMessageById(
      message.conversationId,
      message.messageId,
    );

    assert(
      candidate !== undefined,
      new ConversationNotFoundError(message.conversationId),
    );

    this.assertCandidateMatchesAnnouncement(message, candidate);

    const isValidSignature = this.signatureService.isValidSignature(
      PublicKey.fromPEM(candidate.getAuthorId().toString()),
      candidate.toPrimitives(),
      new Signature(candidate.toPrimitives().signature),
    );

    assert(isValidSignature, new InvalidMessageSignatureError());

    conversation.registerMessage(candidate);
    await this.repository.save(conversation);
  }
}
