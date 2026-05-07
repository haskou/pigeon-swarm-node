import { Message } from '../Message';
import { MessageDeleted } from '../MessageDeleted';
import { MessageEdited } from '../MessageEdited';
import { MessageSent } from '../MessageSent';
import { EncryptedMessagePayload } from '../value-objects/EncryptedMessagePayload';
import { MessageId } from '../value-objects/MessageId';
import { MessageType } from '../value-objects/MessageType';

export interface ConversationProjectedMessage {
  deleted: boolean;
  encryptedPayload: string;
  messageId: string;
}

export class ConversationProjectionDomainService {
  private applyDeleted(
    projection: Map<string, ConversationProjectedMessage>,
    message: MessageDeleted,
  ): void {
    const projectedMessage = this.getTarget(
      projection,
      message.getTargetMessageId(),
    );
    projectedMessage.deleted = true;
  }

  private applyEdited(
    projection: Map<string, ConversationProjectedMessage>,
    message: MessageEdited,
  ): void {
    const projectedMessage = this.getTarget(
      projection,
      message.getTargetMessageId(),
    );
    projectedMessage.encryptedPayload = this.getPayload(message).valueOf();
  }

  private applySent(
    projection: Map<string, ConversationProjectedMessage>,
    message: MessageSent,
  ): void {
    projection.set(message.getId().valueOf(), {
      deleted: false,
      encryptedPayload: message.getEncryptedPayload().valueOf(),
      messageId: message.getId().valueOf(),
    });
  }

  private getPayload(message: MessageEdited): EncryptedMessagePayload {
    return message.getEncryptedPayload();
  }

  private getTarget(
    projection: Map<string, ConversationProjectedMessage>,
    messageId: MessageId,
  ): ConversationProjectedMessage {
    return projection.get(messageId.valueOf()) as ConversationProjectedMessage;
  }

  public project(
    messages: Message[],
  ): Map<string, ConversationProjectedMessage> {
    const projection = new Map<string, ConversationProjectedMessage>();

    messages.forEach((message) => {
      if (message.getType().isEqual(MessageType.SENT)) {
        this.applySent(projection, message as MessageSent);
      }

      if (message.getType().isEqual(MessageType.EDITED)) {
        this.applyEdited(projection, message as MessageEdited);
      }

      if (message.getType().isEqual(MessageType.DELETED)) {
        this.applyDeleted(projection, message as MessageDeleted);
      }
    });

    return projection;
  }
}
