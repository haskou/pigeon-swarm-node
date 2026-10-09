import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { MLSRecord } from '../MLSRecord';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class MLSRecordRepository {
  public abstract findByCommunity(
    communityId: CommunityId,
  ): Promise<MLSRecord[]>;

  /** Idempotent: storing the same record again is a no-op. */
  public abstract save(
    record: MLSRecord,
    proof: PublicMutationProof,
  ): Promise<void>;
}
