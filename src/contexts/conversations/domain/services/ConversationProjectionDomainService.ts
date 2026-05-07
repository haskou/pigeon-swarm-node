import { Message } from '../Message';
import { MessageDeleted } from '../MessageDeleted';
import { MessageEdited } from '../MessageEdited';
import { MessageSent } from '../MessageSent';
import { EncryptedMessagePayload } from '../value-objects/EncryptedMessagePayload';
import { MessageEventId } from '../value-objects/MessageEventId';
import { MessageEventType } from '../value-objects/MessageEventType';

export interface ConversationProjectedMessage {
  deleted: boolean;
  encryptedPayload: string;
  eventId: string;
}

export class ConversationProjectionDomainService {
  private applyDeleted(
    projection: Map<string, ConversationProjectedMessage>,
    event: MessageDeleted,
  ): void {
    const message = this.getTarget(projection, event.getTargetEventId());
    message.deleted = true;
  }

  private applyEdited(
    projection: Map<string, ConversationProjectedMessage>,
    event: MessageEdited,
  ): void {
    const message = this.getTarget(projection, event.getTargetEventId());
    message.encryptedPayload = this.getPayload(event).valueOf();
  }

  private applySent(
    projection: Map<string, ConversationProjectedMessage>,
    event: MessageSent,
  ): void {
    projection.set(event.getId().valueOf(), {
      deleted: false,
      encryptedPayload: event.getEncryptedPayload().valueOf(),
      eventId: event.getId().valueOf(),
    });
  }

  private getPayload(event: MessageEdited): EncryptedMessagePayload {
    return event.getEncryptedPayload();
  }

  private getTarget(
    projection: Map<string, ConversationProjectedMessage>,
    eventId: MessageEventId,
  ): ConversationProjectedMessage {
    return projection.get(eventId.valueOf()) as ConversationProjectedMessage;
  }

  public project(events: Message[]): Map<string, ConversationProjectedMessage> {
    const projection = new Map<string, ConversationProjectedMessage>();

    events.forEach((event) => {
      if (event.getType().isEqual(MessageEventType.SENT)) {
        this.applySent(projection, event as MessageSent);
      }

      if (event.getType().isEqual(MessageEventType.EDITED)) {
        this.applyEdited(projection, event as MessageEdited);
      }

      if (event.getType().isEqual(MessageEventType.DELETED)) {
        this.applyDeleted(projection, event as MessageDeleted);
      }
    });

    return projection;
  }
}
