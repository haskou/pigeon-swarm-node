import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityModerationLogEntry } from '../../../domain/entities/moderation/CommunityModerationLogEntry';

export interface OrbitDBCommunityModerationLogDocument
  extends PrimitiveOf<CommunityModerationLogEntry>, Record<string, unknown> {
  deleted?: boolean;
}
