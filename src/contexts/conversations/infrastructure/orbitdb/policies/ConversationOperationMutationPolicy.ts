import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import { ConversationOperation } from '../../../domain/operations/ConversationOperation';
import { ConversationOperationLedger } from '../../../domain/operations/ConversationOperationLedger';

/**
 * Admits a signed conversation operation only when its author was permitted
 * to perform it in the history the operation builds on. Every admitted
 * operation is remembered here, so the parents of a replicated batch are
 * found whatever the order it arrives in; an operation whose parents have not
 * replicated yet is refused and retried by the registry.
 */
export default class ConversationOperationMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['action', 'authorIdentityId', 'conversationId', 'id', 'networkId'],
    ['createdAt'],
    'conversation_operation',
    { arrays: ['parents'], objects: ['args'] },
  );

  private readonly ledgers = new Map<string, ConversationOperationLedger>();

  public readonly collection = 'conversationOperations';

  public readonly scopeType = 'conversation_operation';

  private toOperation(record: Record<string, unknown>): ConversationOperation {
    try {
      return ConversationOperation.fromPrimitives(record);
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  private ledgerOf(
    operation: ConversationOperation,
  ): ConversationOperationLedger {
    const conversationId = operation.getConversationId().valueOf();
    const ledger =
      this.ledgers.get(conversationId) ?? new ConversationOperationLedger();

    this.ledgers.set(conversationId, ledger);

    return ledger;
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

      const operation = this.toOperation(record);
      const ledger = this.ledgerOf(operation);

      if (!ledger.has(operation)) ledger.admit(operation);
      resolve();
    });
  }
}
