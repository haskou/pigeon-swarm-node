import { Enum } from '@haskou/value-objects';

export type MessageTypeValue = 'deleted' | 'edited' | 'sent';

export class MessageType extends Enum<MessageTypeValue> {
  public static readonly DELETED = new MessageType('deleted');
  public static readonly EDITED = new MessageType('edited');
  public static readonly SENT = new MessageType('sent');

  public getValues(): MessageTypeValue[] {
    return ['deleted', 'edited', 'sent'];
  }
}
