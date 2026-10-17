import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { assert } from '@haskou/value-objects';

import { ConversationOperationLimitExceededError } from '../errors/ConversationOperationLimitExceededError';
import { ConversationOperationArguments } from './ConversationOperationArguments';

/**
 * Bounds on what one identity can make every replica of a conversation store.
 * Every limit is decided from the signed record itself, never from the clock
 * or the arrival order, so every node refuses exactly the same operations.
 */
export class ConversationOperationLimits {
  /** Canonical JSON size of `args`; a 1:1 participant pair fits. */
  public static readonly MAX_ARGUMENT_BYTES = 4_096;

  /**
   * Levels `args` may nest, `args` itself counting as depth 0. The operation
   * digest refuses a value deeper than `PublicMutationProof.MAX_PAYLOAD_DEPTH`
   * below the operation, and `args` sits one level below it, so deeper
   * arguments are refused here, as a limit, before the digest is taken.
   */
  public static readonly MAX_ARGUMENT_DEPTH =
    PublicMutationProof.MAX_PAYLOAD_DEPTH - 1;

  public static assertArguments(args: ConversationOperationArguments): void {
    assert(
      Buffer.byteLength(JSON.stringify(args)) <=
        ConversationOperationLimits.MAX_ARGUMENT_BYTES,
      new ConversationOperationLimitExceededError(),
    );
    assert(
      PublicMutationProof.depthOf(args) <=
        ConversationOperationLimits.MAX_ARGUMENT_DEPTH,
      new ConversationOperationLimitExceededError(),
    );
  }
}
