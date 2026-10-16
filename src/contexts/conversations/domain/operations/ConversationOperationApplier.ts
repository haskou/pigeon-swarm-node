import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperation } from './ConversationOperation';
import { ConversationOperationArgumentReader } from './ConversationOperationArgumentReader';
import { ConversationRoster } from './ConversationRoster';

/**
 * Turns the genesis of a 1:1 conversation into its roster. Its arguments
 * (every key is required) are type 'one-to-one' and participantIds: exactly
 * the two identities, strictly ascending, the author one of them.
 *
 * Group rosters live in MLS, so a group genesis is refused before it gets
 * here, and no other action exists: a 1:1 roster is immutable.
 */
export class ConversationOperationApplier {
  /** An identity in the exact form the network exchanges: no PEM header. */
  private static identity(value: string): string {
    assert(
      new IdentityId(value).valueOf() === value,
      new InvalidConversationOperationError(),
    );

    return value;
  }

  private static participants(reader: ConversationOperationArgumentReader) {
    const participantIds = reader
      .stringArray('participantIds')
      .map((participantId) =>
        ConversationOperationApplier.identity(participantId),
      );

    assert(
      participantIds.every(
        (participantId, index) =>
          index === 0 || participantIds[index - 1] < participantId,
      ),
      new InvalidConversationOperationError(),
    );

    return participantIds;
  }

  /** The roster a genesis operation creates. */
  public static create(genesis: ConversationOperation): ConversationRoster {
    assert(genesis.isGenesis(), new InvalidConversationOperationError());
    const args = genesis.getArguments();

    assert(args.type === 'one-to-one', new InvalidConversationOperationError());

    const author = genesis.getAuthorIdentityId().valueOf();
    const participantIds = ConversationOperationApplier.participants(
      new ConversationOperationArgumentReader(args, ['participantIds', 'type']),
    );

    assert(
      participantIds.length === 2 && participantIds.includes(author),
      new InvalidConversationOperationError(),
    );

    return new ConversationRoster(
      genesis.getConversationId().valueOf(),
      genesis.getNetworkId().valueOf(),
      author,
      participantIds,
    );
  }
}
