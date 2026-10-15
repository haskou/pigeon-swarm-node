import { assert } from '@haskou/value-objects';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperation } from './ConversationOperation';
import { ConversationOperationApplier } from './ConversationOperationApplier';
import { ConversationRoster } from './ConversationRoster';
import { ConversationState } from './ConversationState';

/**
 * Deterministic roster of a 1:1 conversation: a pure function of the set of
 * verified operations. Only a genesis decodes, and a genesis has no parents.
 * The geneses are taken by ascending digest and the first valid one wins, so
 * every node converges without any wall clock.
 */
export class ConversationStateFold {
  /** Folds every operation of one conversation into its current roster. */
  public static fold(operations: ConversationOperation[]): ConversationState {
    const byHash = new Map(
      operations.map((operation) => [operation.getHash(), operation]),
    );
    const skipped: string[] = [];
    let roster: ConversationRoster | undefined;

    for (const hash of [...byHash.keys()].sort()) {
      try {
        // A conversation has exactly one genesis.
        assert(!roster, new InvalidConversationOperationError());
        roster = ConversationOperationApplier.create(
          byHash.get(hash) as ConversationOperation,
        );
      } catch {
        skipped.push(hash);
      }
    }

    return { roster, skipped };
  }
}
