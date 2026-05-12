import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
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

type MessageSendOptions = {
  attachmentExternalIdentifiers?: AttachmentExternalIdentifier[];
  createdAt?: Timestamp;
  id?: MessageId;
  previousMessageIds?: MessageId[];
  replyToMessageId?: MessageId;
};

export class Conversation extends AggregateRoot {
  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): Conversation {
    return new Conversation(
      new ConversationId(primitives.id),
      new NetworkId(primitives.networkId),
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
    private readonly networkId: NetworkId,
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

  private assertCanReplyToMessage(replyToMessageId?: MessageId): void {
    if (!replyToMessageId) {
      return;
    }

    const target = this.findMessageById(replyToMessageId);

    assert(target, new MessageTargetNotFoundError());
    assert(
      target?.getType().isEqual(MessageType.SENT),
      new MessageTargetNotFoundError(),
    );
    assert(
      !this.isDeleted(replyToMessageId),
      new MessageTargetAlreadyDeletedError(),
    );
  }

  private assertPreviousMessagesExist(previousMessageIds: MessageId[]): void {
    previousMessageIds.forEach((messageId) => {
      assert(this.findMessageById(messageId), new MessageTargetNotFoundError());
    });
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
    options: MessageSendOptions = {},
  ): MessageSent {
    this.assertIsParticipant(authorId);
    this.assertCanReplyToMessage(options.replyToMessageId);
    const messagePreviousMessageIds = options.previousMessageIds ?? [];
    this.assertPreviousMessagesExist(messagePreviousMessageIds);

    const message = MessageSent.create({
      attachmentExternalIdentifiers: options.attachmentExternalIdentifiers,
      authorId,
      conversationId: this.id,
      createdAt: options.createdAt,
      encryptedPayload,
      id: options.id,
      previousMessageIds: messagePreviousMessageIds,
      replyToMessageId: options.replyToMessageId,
      signature,
    });

    this.messages.push(message);
    this.record(
      new ConversationMessageWasSentEvent(this.id.valueOf(), {
        authorId: authorId.valueOf(),
        messageId: message.getId().valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.toPrimitives().participantIds,
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
      this.assertCanReplyToMessage(message.getReplyToMessageId());
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

    const message = MessageEdited.create({
      authorId,
      conversationId: this.id,
      encryptedPayload,
      previousMessageIds: this.getLastMessageIds(),
      signature,
      targetMessageId,
    });

    this.messages.push(message);
    this.record(
      new ConversationMessageWasEditedEvent(this.id.valueOf(), {
        messageId: message.getId().valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.toPrimitives().participantIds,
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

    const message = MessageDeleted.create({
      authorId,
      conversationId: this.id,
      createdAt,
      id,
      previousMessageIds: [targetMessageId],
      signature,
      targetMessageId,
    });

    this.messages.push(message);
    this.record(
      new ConversationMessageWasDeletedEvent(this.id.valueOf(), {
        messageId: message.getId().valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.toPrimitives().participantIds,
        targetMessageId: targetMessageId.valueOf(),
      }),
    );

    return message;
  }

  public findMessageById(messageId: MessageId): Message | undefined {
    return this.messages.find((message) => message.getId().isEqual(messageId));
  }

  public getId(): ConversationId {
    return this.id;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
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
      networkId: this.networkId.valueOf(),
      participantIds: this.participants.map((participant) =>
        participant.valueOf(),
      ),
    };
  }
}
