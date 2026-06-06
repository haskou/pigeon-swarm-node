import { Enum } from '@haskou/value-objects';

import { messageTypes } from './types/MessageTypes';
import { MessageTypeValue } from './types/MessageTypeValue';

export { MessageTypeValue } from './types/MessageTypeValue';

export class MessageType extends Enum<MessageTypeValue> {
  public static readonly DELETED = new MessageType(messageTypes.DELETED);
  public static readonly EDITED = new MessageType(messageTypes.EDITED);
  public static readonly POLL = new MessageType(messageTypes.POLL);
  public static readonly SENT = new MessageType(messageTypes.SENT);

  public getValues(): MessageTypeValue[] {
    return Object.values(messageTypes);
  }
}
