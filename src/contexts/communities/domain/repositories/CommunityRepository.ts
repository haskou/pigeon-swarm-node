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

  public abstract requireById(id: CommunityId): Promise<Community>;
  public abstract hasById(id: CommunityId): Promise<boolean>;
  /**
   * The community folded from the causal past of `frontier`; throws when a head is unknown
   * and rejects with CommunityNotFoundError when no active community exists at that frontier.
   */
  public abstract requireAtFrontier(
    id: CommunityId,
    frontier: string[],
  ): Promise<Community>;

  public abstract findByMember(identityId: IdentityId): Promise<Community[]>;
  /** The operations nobody built on yet: the parents of the next operation. */
  public abstract findFrontier(id: CommunityId): Promise<string[]>;
  /**
   * Every admitted operation of the community, the ones the fold skipped
   * included, sorted by digest: at most `limit` of them after the `after`
   * digest (exclusive). A community without a replicated log has none.
   */
  public abstract findOperations(
    id: CommunityId,
    after: string | undefined,
    limit: number,
  ): Promise<CommunityOperation[]>;

  /**
   * The frontier of every community of one network held on this node, deleted
   * ones included: equal results on two nodes mean equal community state.
   */
  public abstract findFrontiersByNetwork(
    networkId: string,
  ): Promise<Array<{ communityId: CommunityId; frontier: string[] }>>;

  /** Appends an operation the client already signed. */
  public abstract save(
    operation: CommunityOperation,
    proof: PublicMutationProof,
  ): Promise<void>;
}
