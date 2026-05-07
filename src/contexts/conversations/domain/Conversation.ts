import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, Signature } from '@haskou/value-objects';

import { ConversationParticipantNotFoundError } from './errors/ConversationParticipantNotFoundError';
import { MessageEventTargetAlreadyDeletedError } from './errors/MessageEventTargetAlreadyDeletedError';
import { MessageEventTargetAuthorMismatchError } from './errors/MessageEventTargetAuthorMismatchError';
import { MessageEventTargetNotFoundError } from './errors/MessageEventTargetNotFoundError';
import { ConversationMessageWasDeletedEvent } from './events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from './events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from './events/ConversationMessageWasSentEvent';
import { MessageDeleted } from './MessageDeleted';
import { MessageEdited } from './MessageEdited';
import { MessageEvent, MessageEventPrimitives } from './MessageEvent';
import { MessageEventFactory } from './MessageEventFactory';
import { MessageSent } from './MessageSent';
import {
  ConversationProjectedMessage,
  ConversationProjectionDomainService,
} from './services/ConversationProjectionDomainService';
import { Cid } from './value-objects/Cid';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageEventId } from './value-objects/MessageEventId';
import { MessageEventType } from './value-objects/MessageEventType';

export interface ConversationPrimitives {
  events: MessageEventPrimitives[];
  id: string;
  participantIds: string[];
}

export class Conversation extends AggregateRoot {
  public static fromPrimitives(
    primitives: ConversationPrimitives,
  ): Conversation {
    return new Conversation(
      new ConversationId(primitives.id),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.events.map((event) =>
        MessageEventFactory.fromPrimitives(event),
      ),
    );
  }

  constructor(
    private readonly id: ConversationId,
    private readonly participants: IdentityId[],
    private readonly events: MessageEvent[] = [],
  ) {
    super();
  }

  private assertCanChangeMessage(
    authorId: IdentityId,
    targetEventId: MessageEventId,
  ): void {
    this.assertIsParticipant(authorId);

    const target = this.findEventById(targetEventId);

    assert(target !== undefined, new MessageEventTargetNotFoundError());
    assert(
      target?.getType().isEqual(MessageEventType.SENT),
      new MessageEventTargetNotFoundError(),
    );
    assert(
      target?.getAuthorId().valueOf() === authorId.valueOf(),
      new MessageEventTargetAuthorMismatchError(),
    );
    assert(
      !this.isDeleted(targetEventId),
      new MessageEventTargetAlreadyDeletedError(),
    );
  }

  private assertIsParticipant(authorId: IdentityId): void {
    assert(
      this.participants.some(
        (participant) => participant.valueOf() === authorId.valueOf(),
      ),
      new ConversationParticipantNotFoundError(),
    );
  }

  private getLastEventIds(): MessageEventId[] {
    const lastEvent = this.events[this.events.length - 1];

    return lastEvent ? [lastEvent.getId()] : [];
  }

  private isDeleted(eventId: MessageEventId): boolean {
    return this.events.some(
      (event) =>
        event.getType().isEqual(MessageEventType.DELETED) &&
        event.getTargetEventId()?.valueOf() === eventId.valueOf(),
    );
  }

  public sendMessage(
    authorId: IdentityId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    attachmentCids: Cid[] = [],
  ): MessageSent {
    this.assertIsParticipant(authorId);

    const event = MessageSent.create(
      this.id,
      authorId,
      encryptedPayload,
      signature,
      this.getLastEventIds(),
      attachmentCids,
    );

    this.events.push(event);
    this.record(
      new ConversationMessageWasSentEvent(this.id.valueOf(), {
        eventId: event.getId().valueOf(),
      }),
    );

    return event;
  }

  public editMessage(
    authorId: IdentityId,
    targetEventId: MessageEventId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
  ): MessageEdited {
    this.assertCanChangeMessage(authorId, targetEventId);

    const event = MessageEdited.create(
      this.id,
      authorId,
      targetEventId,
      encryptedPayload,
      signature,
      this.getLastEventIds(),
    );

    this.events.push(event);
    this.record(
      new ConversationMessageWasEditedEvent(this.id.valueOf(), {
        eventId: event.getId().valueOf(),
        targetEventId: targetEventId.valueOf(),
      }),
    );

    return event;
  }

  public deleteMessage(
    authorId: IdentityId,
    targetEventId: MessageEventId,
    signature: Signature,
  ): MessageDeleted {
    this.assertCanChangeMessage(authorId, targetEventId);

    const event = MessageDeleted.create(
      this.id,
      authorId,
      targetEventId,
      signature,
      this.getLastEventIds(),
    );

    this.events.push(event);
    this.record(
      new ConversationMessageWasDeletedEvent(this.id.valueOf(), {
        eventId: event.getId().valueOf(),
        targetEventId: targetEventId.valueOf(),
      }),
    );

    return event;
  }

  public findEventById(eventId: MessageEventId): MessageEvent | undefined {
    return this.events.find(
      (event) => event.getId().valueOf() === eventId.valueOf(),
    );
  }

  public projectMessages(): ConversationProjectedMessage[] {
    return Array.from(
      new ConversationProjectionDomainService().project(this.events).values(),
    );
  }

  public toPrimitives(): ConversationPrimitives {
    return {
      events: this.events.map((event) => event.toPrimitives()),
      id: this.id.valueOf(),
      participantIds: this.participants.map((participant) =>
        participant.valueOf(),
      ),
    };
  }
}
