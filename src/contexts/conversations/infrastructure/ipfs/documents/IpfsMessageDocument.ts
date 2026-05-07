import { PrimitiveOf } from '@haskou/value-objects';

import { Message } from '../../../domain/Message';

export interface IpfsMessageDocument extends PrimitiveOf<Message> {
  schemaVersion: 1;
}
