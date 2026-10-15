import { assert } from '@haskou/value-objects';

import { ConversationOperationLimitExceededError } from '../errors/ConversationOperationLimitExceededError';
import { ConversationOperationArguments } from './ConversationOperationArguments';

/**
 * Bounds on what one identity can make every replica of a conversation store
 * and fold. Every limit is decided from the signed record itself, never from
 * the clock or the arrival order, so every node refuses or skips exactly the
 * same operations.
 */
export class ConversationOperationLimits {
  /** Canonical JSON size of `args`; a 1:1 participant pair fits. */
  public static readonly MAX_ARGUMENT_BYTES = 4_096;

  /** Operations one identity may sign in one conversation, for its whole life. */
  public static readonly MAX_OPERATIONS_PER_AUTHOR: number = 1_000;

  public static assertArguments(args: ConversationOperationArguments): void {
    assert(
      Buffer.byteLength(JSON.stringify(args)) <=
        ConversationOperationLimits.MAX_ARGUMENT_BYTES,
      new ConversationOperationLimitExceededError(),
    );
  }

  public static isAuthorQuotaReached(count: number): boolean {
    return count >= ConversationOperationLimits.MAX_OPERATIONS_PER_AUTHOR;
  }
}
