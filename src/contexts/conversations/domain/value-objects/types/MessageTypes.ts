import { MessageTypeValue } from './MessageTypeValue';

export const messageTypes: Record<string, MessageTypeValue> = {
  DELETED: 'deleted',
  EDITED: 'edited',
  POLL: 'poll',
  SENT: 'sent',
};
