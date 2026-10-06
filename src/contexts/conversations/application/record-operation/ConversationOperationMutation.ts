import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ConversationOperation } from '../../domain/operations/ConversationOperation';
import { ConversationOperationArguments } from '../../domain/operations/ConversationOperationArguments';
import { ConversationId } from '../../domain/value-objects/ConversationId';
import { ConversationOperationAction } from '../../domain/value-objects/ConversationOperationAction';
import { ConversationOperationMutationPrimitives } from './ConversationOperationMutationPrimitives';

/**
 * The client-signed `conversationOperations` put that carries a conversation
 * change: the signed proof plus the metadata the signature covers. The server
 * rebuilds the operation from the request, so the signature only verifies when
 * the client signed exactly the change this endpoint performs.
 */
export class ConversationOperationMutation {
  public readonly createdAt: number;
  public readonly parents: string[];
  public readonly proof: PublicMutationProof;

  constructor(primitives: ConversationOperationMutationPrimitives) {
    this.createdAt = primitives.createdAt;
    this.parents = primitives.parents;
    this.proof = PublicMutationProof.fromPrimitives(primitives.mutation);
  }

  /** Rebuilds the operation the client signed from the request fields. */
  public build(attributes: {
    action: ConversationOperationAction;
    args: ConversationOperationArguments;
    author: IdentityId;
    conversationId: ConversationId;
    networkId: NetworkId;
  }): ConversationOperation {
    return ConversationOperation.create({
      action: attributes.action,
      args: attributes.args,
      authorIdentityId: attributes.author,
      conversationId: attributes.conversationId,
      createdAt: this.createdAt,
      networkId: attributes.networkId,
      parents: this.parents,
    });
  }
}
