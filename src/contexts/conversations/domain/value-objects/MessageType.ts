import { Enum } from '@haskou/value-objects';

const messageTypes = {
  DELETED: 'deleted',
  EDITED: 'edited',
  POLL: 'poll',
  SENT: 'sent',
} as const;

export class MessageType extends Enum<string> {
  public static readonly DELETED = new MessageType(messageTypes.DELETED);
  public static readonly EDITED = new MessageType(messageTypes.EDITED);
  public static readonly POLL = new MessageType(messageTypes.POLL);
  public static readonly SENT = new MessageType(messageTypes.SENT);

  public getValues(): string[] {
    return Object.values(messageTypes);
  }
}
