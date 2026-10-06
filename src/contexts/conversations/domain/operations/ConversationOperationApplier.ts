import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperationAction } from '../value-objects/ConversationOperationAction';
import { GroupConversationName } from '../value-objects/GroupConversationName';
import { ConversationOperation } from './ConversationOperation';
import { ConversationOperationArgumentReader } from './ConversationOperationArgumentReader';
import { ConversationOperationLimits } from './ConversationOperationLimits';
import { ConversationRoster } from './ConversationRoster';

/**
 * Turns one operation into a change of the conversation roster. The roster
 * decides whether the author is allowed to perform it, so a signed operation
 * never carries authority on its own: it only wins when the roster it applies
 * to grants the permission.
 *
 * Arguments per action (every key is required):
 * - conversation_created, group: type 'group', nonce, name, participantIds
 *   (strictly ascending, unique, the author included, 2 to
 *   `MAX_GROUP_PARTICIPANTS`)
 * - conversation_created, 1:1: type 'one-to-one', participantIds (exactly the
 *   two identities, strictly ascending, the author one of them)
 * - member_added, member_removed, admin_promoted, admin_demoted: identityId
 * - member_left: none
 *
 * A 1:1 roster accepts no other action than its genesis, so it is immutable.
 */
export class ConversationOperationApplier {
  private static readonly HANDLERS: Record<
    string,
    (roster: ConversationRoster, operation: ConversationOperation) => void
  > = {
    [ConversationOperationAction.ADMIN_DEMOTED.valueOf()]: (roster, op) =>
      roster.demoteAdmin(
        op.getAuthorIdentityId().valueOf(),
        ConversationOperationApplier.target(op),
      ),
    [ConversationOperationAction.ADMIN_PROMOTED.valueOf()]: (roster, op) =>
      roster.promoteAdmin(
        op.getAuthorIdentityId().valueOf(),
        ConversationOperationApplier.target(op),
      ),
    [ConversationOperationAction.MEMBER_ADDED.valueOf()]: (roster, op) =>
      roster.addMember(
        op.getAuthorIdentityId().valueOf(),
        ConversationOperationApplier.target(op),
      ),
    [ConversationOperationAction.MEMBER_LEFT.valueOf()]: (roster, op) => {
      new ConversationOperationArgumentReader(op.getArguments(), []);
      roster.leave(op.getAuthorIdentityId().valueOf());
    },
    [ConversationOperationAction.MEMBER_REMOVED.valueOf()]: (roster, op) =>
      roster.removeMember(
        op.getAuthorIdentityId().valueOf(),
        ConversationOperationApplier.target(op),
      ),
  };

  private static target(operation: ConversationOperation): string {
    return ConversationOperationApplier.identity(
      new ConversationOperationArgumentReader(operation.getArguments(), [
        'identityId',
      ]).string('identityId'),
    );
  }

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

  private static createGroup(
    operation: ConversationOperation,
    reader: ConversationOperationArgumentReader,
  ): ConversationRoster {
    const author = operation.getAuthorIdentityId().valueOf();
    const participantIds = ConversationOperationApplier.participants(reader);

    reader.string('nonce');
    assert(
      participantIds.length >= 2 &&
        participantIds.length <=
          ConversationOperationLimits.MAX_GROUP_PARTICIPANTS &&
        participantIds.includes(author),
      new InvalidConversationOperationError(),
    );

    return new ConversationRoster(
      operation.getConversationId().valueOf(),
      operation.getNetworkId().valueOf(),
      'group',
      author,
      participantIds,
      [],
      new GroupConversationName(reader.string('name')).valueOf(),
    );
  }

  private static createOneToOne(
    operation: ConversationOperation,
    reader: ConversationOperationArgumentReader,
  ): ConversationRoster {
    const author = operation.getAuthorIdentityId().valueOf();
    const participantIds = ConversationOperationApplier.participants(reader);

    assert(
      participantIds.length === 2 && participantIds.includes(author),
      new InvalidConversationOperationError(),
    );

    return new ConversationRoster(
      operation.getConversationId().valueOf(),
      operation.getNetworkId().valueOf(),
      'one-to-one',
      author,
      participantIds,
    );
  }

  /** The roster a genesis operation creates. */
  public static create(genesis: ConversationOperation): ConversationRoster {
    assert(genesis.isGenesis(), new InvalidConversationOperationError());
    const args = genesis.getArguments();

    if (args.type === 'group') {
      return ConversationOperationApplier.createGroup(
        genesis,
        new ConversationOperationArgumentReader(args, [
          'name',
          'nonce',
          'participantIds',
          'type',
        ]),
      );
    }

    assert(args.type === 'one-to-one', new InvalidConversationOperationError());

    return ConversationOperationApplier.createOneToOne(
      genesis,
      new ConversationOperationArgumentReader(args, ['participantIds', 'type']),
    );
  }

  /** Applies a non genesis operation; throws when it is not permitted. */
  public static apply(
    roster: ConversationRoster,
    operation: ConversationOperation,
  ): void {
    const handler =
      ConversationOperationApplier.HANDLERS[operation.getAction().valueOf()];

    assert(
      handler &&
        !operation.isGenesis() &&
        operation.getConversationId().valueOf() === roster.getId() &&
        operation.getNetworkId().valueOf() === roster.getNetworkId(),
      new InvalidConversationOperationError(),
    );
    handler(roster, operation);
  }
}
