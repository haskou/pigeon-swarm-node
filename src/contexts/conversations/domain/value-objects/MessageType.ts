import { Enum } from '@haskou/value-objects';

export type MessageTypeValue = 'deleted' | 'edited' | 'sent';
const messageTypes: Record<string, MessageTypeValue> = {
  DELETED: 'deleted',
  EDITED: 'edited',
  SENT: 'sent',
};

export class MessageType extends Enum<MessageTypeValue> {
  public static readonly DELETED = new MessageType(messageTypes.DELETED);
  public static readonly EDITED = new MessageType(messageTypes.EDITED);
  public static readonly SENT = new MessageType(messageTypes.SENT);

  public getValues(): MessageTypeValue[] {
    return Object.values(messageTypes);
  }
}
