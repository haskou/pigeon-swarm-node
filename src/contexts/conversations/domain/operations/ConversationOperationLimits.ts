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

  public static assertArguments(args: ConversationOperationArguments): void {
    assert(
      Buffer.byteLength(JSON.stringify(args)) <=
        ConversationOperationLimits.MAX_ARGUMENT_BYTES,
      new ConversationOperationLimitExceededError(),
    );
  }
}
