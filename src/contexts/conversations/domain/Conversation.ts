import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import {
  assert,
  PrimitiveOf,
  Signature,
  Timestamp,
} from '@haskou/value-objects';

import { Message } from './entities/messages/Message';
import { MessageDeleted } from './entities/messages/MessageDeleted';
import { MessageEdited } from './entities/messages/MessageEdited';
import { MessageFactory } from './entities/messages/MessageFactory';
import { MessageMetadata } from './entities/messages/MessageMetadata';
import { MessagePoll } from './entities/messages/MessagePoll';
import { MessageSent } from './entities/messages/MessageSent';
import { ConversationParticipantNotFoundError } from './errors/ConversationParticipantNotFoundError';
import { MessageTargetAlreadyDeletedError } from './errors/MessageTargetAlreadyDeletedError';
import { MessageTargetAuthorMismatchError } from './errors/MessageTargetAuthorMismatchError';
import { MessageTargetNotFoundError } from './errors/MessageTargetNotFoundError';
import { ConversationMessageWasDeletedEvent } from './events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from './events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasPinnedEvent } from './events/ConversationMessageWasPinnedEvent';
import { ConversationMessageWasSentEvent } from './events/ConversationMessageWasSentEvent';
import { ConversationMessageWasUnpinnedEvent } from './events/ConversationMessageWasUnpinnedEvent';
import { ConversationId } from './value-objects/ConversationId';
import { ConversationType } from './value-objects/ConversationType';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { GroupConversationName } from './value-objects/GroupConversationName';
import { MessageEditOptions } from './value-objects/MessageEditOptions';
import { MessageId } from './value-objects/MessageId';
import { MessagePollOptions } from './value-objects/MessagePollOptions';
import { MessageSendOptions } from './value-objects/MessageSendOptions';
import { MessageType } from './value-objects/MessageType';

export class Conversation extends AggregateRoot {
  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): Conversation {
    return new Conversation(
      new ConversationId(primitives.id),
      new NetworkId(primitives.networkId),
      new ConversationType(primitives.type),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.name ? new GroupConversationName(primitives.name) : undefined,
      primitives.messages.map((message) =>
        MessageFactory.fromPrimitives(message),
      ),
    );
  }

  constructor(
    private readonly id: ConversationId,
    private readonly networkId: NetworkId,
    private readonly type: ConversationType,
    private readonly participants: IdentityId[],
    private readonly name: GroupConversationName | undefined = undefined,
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

  private participantIdValues(): string[] {
    return this.participants.map((participant) => participant.valueOf());
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
    options: MessageSendOptions = MessageSendOptions.empty(),
  ): MessageSent {
    this.assertIsParticipant(authorId);
    this.assertCanReplyToMessage(options.getReplyToMessageId());
    const messagePreviousMessageIds = options.getPreviousMessageIds();
    this.assertPreviousMessagesExist(messagePreviousMessageIds);

    const message = MessageSent.create(
      new MessageMetadata(
        options.getId(),
        this.id,
        authorId,
        messagePreviousMessageIds,
        options.getCreatedAt(),
        signature,
        options.getReplyToMessageId(),
      ),
      encryptedPayload,
      options.getAttachments(),
    );

    this.messages.push(message);
    this.record(
      new ConversationMessageWasSentEvent(this.id.valueOf(), {
        authorId: authorId.valueOf(),
        conversationName: this.name?.valueOf(),
        conversationType: this.type.valueOf(),
        message: message.toPrimitives(),
        messageId: message.getId().valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.participantIdValues(),
      }),
    );

    return message;
  }

  public registerMessage(message: Message): void {
    if (this.findMessageById(message.getId())) {
      return;
    }

    if (
      message.getType().isEqual(MessageType.SENT) ||
      message.getType().isEqual(MessageType.POLL)
    ) {
      this.assertIsParticipant(message.getAuthorId());
      this.assertCanReplyToMessage(message.getReplyToMessageId());
      this.assertPreviousMessagesExist(message.getPreviousMessageIds());
    } else {
      const targetMessageId = message.getTargetMessageId();

      assert(targetMessageId, new MessageTargetNotFoundError());
      this.assertCanChangeMessage(message.getAuthorId(), targetMessageId);
    }

    this.messages.push(message);
  }

  public addPollMessage(
    authorId: IdentityId,
    pollId: PollId,
    signature: Signature,
    options: MessagePollOptions = MessagePollOptions.empty(),
  ): MessagePoll {
    this.assertIsParticipant(authorId);
    const previousMessageIds = options.getPreviousMessageIds(
      this.getLastMessageIds(),
    );

    this.assertPreviousMessagesExist(previousMessageIds);

    const message = MessagePoll.create(
      new MessageMetadata(
        options.getId(new MessageId(pollId.valueOf())),
        this.id,
        authorId,
        previousMessageIds,
        options.getCreatedAt(),
        signature,
      ),
      pollId,
    );

    this.messages.push(message);

    return message;
  }

  public editMessage(
    authorId: IdentityId,
    targetMessageId: MessageId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    options: MessageEditOptions = MessageEditOptions.empty(),
  ): MessageEdited {
    this.assertCanChangeMessage(authorId, targetMessageId);
    const previousMessageIds = options.getPreviousMessageIds(targetMessageId);

    this.assertPreviousMessagesExist(previousMessageIds);

    const message = MessageEdited.create(
      new MessageMetadata(
        options.getId(),
        this.id,
        authorId,
        previousMessageIds,
        options.getCreatedAt(),
        signature,
      ),
      targetMessageId,
      encryptedPayload,
    );

    this.messages.push(message);
    this.record(
      new ConversationMessageWasEditedEvent(this.id.valueOf(), {
        message: message.toPrimitives(),
        messageId: message.getId().valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.participantIdValues(),
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
      new MessageMetadata(
        id,
        this.id,
        authorId,
        [targetMessageId],
        createdAt,
        signature,
      ),
      targetMessageId,
    );

    this.messages.push(message);
    this.record(
      new ConversationMessageWasDeletedEvent(this.id.valueOf(), {
        message: message.toPrimitives(),
        messageId: message.getId().valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.participantIdValues(),
        targetMessageId: targetMessageId.valueOf(),
      }),
    );

    return message;
  }

  public pinMessage(actorId: IdentityId, messageId: MessageId): void {
    this.assertIsParticipant(actorId);
    this.record(
      new ConversationMessageWasPinnedEvent(this.id.valueOf(), {
        messageId: messageId.valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.participantIdValues(),
        pinnedByIdentityId: actorId.valueOf(),
      }),
    );
  }

  public unpinMessage(actorId: IdentityId, messageId: MessageId): void {
    this.assertIsParticipant(actorId);
    this.record(
      new ConversationMessageWasUnpinnedEvent(this.id.valueOf(), {
        messageId: messageId.valueOf(),
        networkId: this.networkId.valueOf(),
        participantIds: this.participantIdValues(),
        unpinnedByIdentityId: actorId.valueOf(),
      }),
    );
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

  public getParticipantIds(): IdentityId[] {
    return [...this.participants];
  }

  public isGroup(): boolean {
    return this.type.isGroup();
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
      name: this.name?.valueOf(),
      networkId: this.networkId.valueOf(),
      participantIds: this.participantIdValues(),
      type: this.type.toPrimitives(),
    };
  }
}
