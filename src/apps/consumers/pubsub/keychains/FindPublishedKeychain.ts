import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

// A keychain publication can reach this node before its keychain is resolvable
// here: the replicated keychain document or its routing record has not arrived,
// or the replicated state is still replaying. That miss is expected, so the
// handler completes and the WebSocket fanout of the event proceeds. The keychain
// is recorded when the replicated document is projected into the metadata index,
// or on a later lookup that finds a routing record. The event is not retried.
export async function findPublishedKeychain(
  finder: CurrentKeychainFinder,
  event: DomainEvent,
): Promise<void> {
  try {
    await finder.find(new CurrentKeychainFindMessage(event.aggregateId));
  } catch (error: unknown) {
    if (
      !(error instanceof KeychainNotFoundError) &&
      !(error instanceof ReplicatedStateNotReadyError)
    ) {
      throw error;
    }

    Kernel.logger?.debug?.(
      'Keychain publication arrived before its keychain was resolvable',
    );
  }
}
