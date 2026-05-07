import { Enum } from '@haskou/value-objects';

export type MessageEventTypeValue = 'deleted' | 'edited' | 'sent';

export class MessageEventType extends Enum<MessageEventTypeValue> {
  public static readonly DELETED = new MessageEventType('deleted');
  public static readonly EDITED = new MessageEventType('edited');
  public static readonly SENT = new MessageEventType('sent');

  public getValues(): MessageEventTypeValue[] {
    return ['deleted', 'edited', 'sent'];
  }
}
