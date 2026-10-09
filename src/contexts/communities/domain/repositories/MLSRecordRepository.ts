import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@hasku/value-objects';

import { MLSRecord } from '../MLSRecord';
import { CommunityId } from '../value-objects/CommunityId';
import { MLSRecordId } from '../value-objects/MLSRecordId';
import { MLSRecordKind } from '../value-objects/MLSRecordKind';

export interface MLSRecordsPage {
  records: MLSRecord[];
  nextAfterId?: string;
}

export default abstract class MLSRecordRepository {
  public abstract save(
    recordId: MLSRecordId,
    communityId: CommunityId,
    groupId: string,
    kind: MLSRecordKind,
    payload: string,
    authorIdentityId: IdentityId,
    createdAt: Timestamp,
    proof: PublicMutationProof,
    epoch?: number,
    recipientIdentityId?: IdentityId,
  ): Promise<void>;

  public abstract findByCommunity(
    communityId: CommunityId,
    groupId?: string,
    kind?: string,
    limit?: number,
    afterEpochAndId?: { epoch: number; id: string },
  ): Promise<MLSRecordsPage>;
}
