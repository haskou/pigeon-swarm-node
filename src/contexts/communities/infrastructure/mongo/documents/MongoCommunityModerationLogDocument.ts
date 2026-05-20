import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityModerationLogEntry } from '../../../domain/CommunityModerationLogEntry';

export interface MongoCommunityModerationLogDocument extends Omit<
  PrimitiveOf<CommunityModerationLogEntry>,
  'id'
> {
  _id: string;
}
