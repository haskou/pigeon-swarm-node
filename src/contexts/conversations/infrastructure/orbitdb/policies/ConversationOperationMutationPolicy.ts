import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import { ConversationOperation } from '../../../domain/operations/ConversationOperation';
import { ConversationOperationApplier } from '../../../domain/operations/ConversationOperationApplier';

/**
 * Admits a signed conversation operation only when it is the valid genesis of
 * a 1:1 conversation. Group rosters live in MLS: the group genesis and the
 * member and admin changes older nodes still replicate do not decode, so they
 * are refused before their proof is checked.
 */
export default class ConversationOperationMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['action', 'authorIdentityId', 'conversationId', 'id', 'networkId'],
    ['createdAt'],
    'conversation_operation',
    { arrays: ['parents'], objects: ['args'] },
  );

  public readonly collection = 'conversationOperations';

  public readonly scopeType = 'conversation_operation';

  private toOperation(record: Record<string, unknown>): ConversationOperation {
    try {
      return ConversationOperation.fromPrimitives(record);
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const operation = this.toOperation(record);

    return {
      authorIdentityId: operation.getAuthorIdentityId().valueOf(),
      recordId: operation.getId(),
      store: this.collection,
    };
  }

  public assertPermitted(
    record: Record<string, unknown>,
    _authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (isDeletion) throw new InvalidPublicMutationError();

      ConversationOperationApplier.create(this.toOperation(record));
      resolve();
    });
  }
}
