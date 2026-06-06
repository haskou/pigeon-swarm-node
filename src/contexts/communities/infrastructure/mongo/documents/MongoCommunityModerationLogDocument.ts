import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityModerationLogEntry } from '../../../domain/entities/moderation/CommunityModerationLogEntry';

export interface MongoCommunityModerationLogDocument extends Omit<
  PrimitiveOf<CommunityModerationLogEntry>,
  'id'
> {
  _id: string;
}
