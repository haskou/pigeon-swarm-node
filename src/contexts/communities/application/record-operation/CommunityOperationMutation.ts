import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Community } from '../../domain/Community';
import { CommunityOperation } from '../../domain/operations/CommunityOperation';
import { CommunityOperationApplier } from '../../domain/operations/CommunityOperationApplier';
import { CommunityOperationArguments } from '../../domain/operations/CommunityOperationArguments';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';

export interface CommunityOperationMutationPrimitives {
  createdAt: number;
  mutation: unknown;
  parents: string[];
}

/**
 * The client-signed `communityOperations` put that carries a community change:
 * the signed proof plus the metadata the signature covers. The server rebuilds
 * the operation from the request, so the signature only verifies when the
 * client signed exactly the change this endpoint performs.
 */
export class CommunityOperationMutation {
  public readonly createdAt: number;
  public readonly parents: string[];
  public readonly proof: PublicMutationProof;

  constructor(primitives: CommunityOperationMutationPrimitives) {
    this.createdAt = primitives.createdAt;
    this.parents = primitives.parents;
    this.proof = PublicMutationProof.fromPrimitives(primitives.mutation);
  }

  /** Rebuilds the operation the client signed from the request fields. */
  public build(attributes: {
    action: CommunityOperationAction;
    args: CommunityOperationArguments;
    author: IdentityId;
    communityId: CommunityId;
    networkId: NetworkId;
  }): CommunityOperation {
    return CommunityOperation.create({
      action: attributes.action,
      args: attributes.args,
      authorIdentityId: attributes.author,
      communityId: attributes.communityId,
      createdAt: this.createdAt,
      networkId: attributes.networkId,
      parents: this.parents,
    });
  }

  /** Builds the operation and applies it to the community, so it fails when the author may not perform it. */
  public applyTo(
    community: Community,
    author: IdentityId,
    action: CommunityOperationAction,
    args: CommunityOperationArguments,
  ): CommunityOperation {
    const operation = this.build({
      action,
      args,
      author,
      communityId: community.getId(),
      networkId: community.getNetworkId(),
    });

    CommunityOperationApplier.apply(community, operation);

    return operation;
  }
}
