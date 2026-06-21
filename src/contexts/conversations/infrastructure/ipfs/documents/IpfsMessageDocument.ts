import { PrimitiveOf } from '@haskou/value-objects';

import { Message } from '../../../domain/entities/messages/Message';

export interface IpfsMessageDocument extends PrimitiveOf<Message> {
  schemaVersion: 1;
}
