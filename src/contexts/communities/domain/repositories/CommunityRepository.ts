import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../Community';
import { CommunityOperation } from '../operations/CommunityOperation';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityRepository {
  public abstract findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]>;

  public abstract findById(id: CommunityId): Promise<Community | undefined>;
  public abstract findByMember(identityId: IdentityId): Promise<Community[]>;
  /** The operations nobody built on yet: the parents of the next operation. */
  public abstract findFrontier(id: CommunityId): Promise<string[]>;
  /** Appends an operation the client already signed. */
  public abstract save(
    operation: CommunityOperation,
    proof: PublicMutationProof,
  ): Promise<void>;
}
