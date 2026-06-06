import { Timestamp } from '@haskou/value-objects';

import { MessageId } from '../value-objects/MessageId';

export type MessageEditOptions = {
  createdAt?: Timestamp;
  id?: MessageId;
  previousMessageIds?: MessageId[];
};
