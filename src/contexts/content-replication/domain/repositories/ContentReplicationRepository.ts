import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ContentReplication } from '../ContentReplication';
import { ContentId } from '../value-objects/ContentId';

export default abstract class ContentReplicationRepository {
  /** Live registrations: replaced and deleted ones are not listed. */
  public abstract findAll(): Promise<ContentReplication[]>;

  public abstract findByCid(cid: ContentId): Promise<ContentReplication[]>;

  public abstract save(
    content: ContentReplication,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract delete(
    ownerIdentityId: IdentityId,
    networkId: NetworkId,
    cid: ContentId,
    proof: PublicMutationProof,
  ): Promise<void>;
}
