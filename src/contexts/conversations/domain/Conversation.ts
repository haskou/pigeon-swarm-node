import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import {
  assert,
  PrimitiveOf,
  Signature,
  Timestamp,
} from '@haskou/value-objects';

import { ConversationParticipantNotFoundError } from './errors/ConversationParticipantNotFoundError';
import { MessageTargetAlreadyDeletedError } from './errors/MessageTargetAlreadyDeletedError';
import { MessageTargetAuthorMismatchError } from './errors/MessageTargetAuthorMismatchError';
import { MessageTargetNotFoundError } from './errors/MessageTargetNotFoundError';
import { ConversationMessageWasDeletedEvent } from './events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from './events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from './events/ConversationMessageWasSentEvent';
import { Message } from './Message';
import { MessageDeleted } from './MessageDeleted';
import { MessageEdited } from './MessageEdited';
import { MessageFactory } from './MessageFactory';
import { MessageSent } from './MessageSent';
import { AttachmentExternalIdentifier } from './value-objects/AttachmentExternalIdentifier';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageId } from './value-objects/MessageId';
import { MessageType } from './value-objects/MessageType';

export class Conversation extends AggregateRoot {
  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): Conversation {
    return new Conversation(
      new ConversationId(primitives.id),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.messages.map((message) =>
        MessageFactory.fromPrimitives(message),
      ),
    );
  }

  constructor(
    private readonly id: ConversationId,
    private readonly participants: IdentityId[],
    private readonly messages: Message[] = [],
  ) {
    super();
  }

  private assertCanChangeMessage(
    authorId: IdentityId,
    targetMessageId: MessageId,
  ): void {
    this.assertIsParticipant(authorId);

    const target = this.findMessageById(targetMessageId);

    assert(target, new MessageTargetNotFoundError());
    assert(
      target?.getType().isEqual(MessageType.SENT),
      new MessageTargetNotFoundError(),
    );
    assert(
      target?.getAuthorId().isEqual(authorId),
      new MessageTargetAuthorMismatchError(),
    );
    assert(
      !this.isDeleted(targetMessageId),
      new MessageTargetAlreadyDeletedError(),
    );
  }

  private assertIsParticipant(authorId: IdentityId): void {
    assert(
      this.participants.some((participant) => participant.isEqual(authorId)),
      new ConversationParticipantNotFoundError(),
    );
  }

  private getLastMessageIds(): MessageId[] {
    const lastMessage = this.messages[this.messages.length - 1];

    return lastMessage ? [lastMessage.getId()] : [];
  }

  private isDeleted(messageId: MessageId): boolean {
    return this.messages.some(
      (message) =>
        message.getType().isEqual(MessageType.DELETED) &&
        message.getTargetMessageId()?.isEqual(messageId),
    );
  }

  public sendMessage(
    authorId: IdentityId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    attachmentExternalIdentifiers: AttachmentExternalIdentifier[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageId = MessageId.generate(),
  ): MessageSent {
    this.assertIsParticipant(authorId);

    const message = MessageSent.create(
      this.id,
      authorId,
      encryptedPayload,
      signature,
      this.getLastMessageIds(),
      attachmentExternalIdentifiers,
      createdAt,
      id,
    );

    this.messages.push(message);
    this.record(
      new ConversationMessageWasSentEvent(this.id.valueOf(), {
        messageId: message.getId().valueOf(),
      }),
    );

    return message;
  }

  public registerMessage(message: Message): void {
    if (this.findMessageById(message.getId())) {
      return;
    }

    if (message.getType().isEqual(MessageType.SENT)) {
      this.assertIsParticipant(message.getAuthorId());
    } else {
      const targetMessageId = message.getTargetMessageId();

      assert(targetMessageId, new MessageTargetNotFoundError());
      this.assertCanChangeMessage(message.getAuthorId(), targetMessageId);
    }

    this.messages.push(message);
  }

  public editMessage(
    authorId: IdentityId,
    targetMessageId: MessageId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
  ): MessageEdited {
    this.assertCanChangeMessage(authorId, targetMessageId);

    const message = MessageEdited.create(
      this.id,
      authorId,
      targetMessageId,
      encryptedPayload,
      signature,
      this.getLastMessageIds(),
    );

    this.messages.push(message);
    this.record(
      new ConversationMessageWasEditedEvent(this.id.valueOf(), {
        messageId: message.getId().valueOf(),
        targetMessageId: targetMessageId.valueOf(),
      }),
    );

    return message;
  }

  public deleteMessage(
    authorId: IdentityId,
    targetMessageId: MessageId,
    signature: Signature,
    createdAt: Timestamp = Timestamp.now(),
    id: MessageId = MessageId.generate(),
  ): MessageDeleted {
    this.assertCanChangeMessage(authorId, targetMessageId);

    const message = MessageDeleted.create(
      this.id,
      authorId,
      targetMessageId,
      signature,
      [targetMessageId],
      createdAt,
      id,
    );

    this.messages.push(message);
    this.record(
      new ConversationMessageWasDeletedEvent(this.id.valueOf(), {
        messageId: message.getId().valueOf(),
        targetMessageId: targetMessageId.valueOf(),
      }),
    );

    return message;
  }

  public findMessageById(messageId: MessageId): Message | undefined {
    return this.messages.find((message) => message.getId().isEqual(messageId));
  }

  public hasParticipant(identityId: IdentityId): boolean {
    return this.participants.some((participant) =>
      participant.isEqual(identityId),
    );
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      messages: this.messages.map((message) => message.toPrimitives()),
      participantIds: this.participants.map((participant) =>
        participant.valueOf(),
      ),
    };
  }
}
