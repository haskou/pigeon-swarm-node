import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';

import { legacyGroupChange } from '../../../../../../support/legacyGroupChange';
import { legacyGroupGenesis } from '../../../../../../support/legacyGroupGenesis';
import {
  alice,
  bob,
  creator,
  networkId,
  oneToOneGenesis,
  operation,
} from '../../../domain/operations/ConversationOperationFixtures';

describe('ConversationOperationMutationPolicy', () => {
  let policy: ConversationOperationMutationPolicy;

  beforeEach(() => {
    policy = new ConversationOperationMutationPolicy();
  });

  function record(op: ConversationOperation): Record<string, unknown> {
    return { ...op.toPrimitives() };
  }

  function admit(op: ConversationOperation): Promise<void> {
    return policy.assertPermitted(
      record(op),
      op.getAuthorIdentityId().valueOf(),
      false,
    );
  }

  describe('expectationOf', () => {
    it('binds the proof to the operation id, its author and the operations store', () => {
      const created = oneToOneGenesis();

      expect(policy.expectationOf(record(created))).toEqual({
        authorIdentityId: creator.valueOf(),
        recordId: created.getId(),
        store: 'conversationOperations',
      });
    });

    it('refuses a record with an unexpected field', () => {
      expect(() =>
        policy.expectationOf({ ...record(oneToOneGenesis()), extra: true }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a record whose content does not hash to its id', () => {
      expect(() =>
        policy.expectationOf({
          ...record(oneToOneGenesis()),
          createdAt: 99,
        }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a record whose id was swapped for another operation', () => {
      const later = operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        { ...oneToOneGenesis().getArguments() },
        [],
        2,
      );

      expect(() =>
        policy.expectationOf({
          ...record(later),
          id: oneToOneGenesis().getId(),
        }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a tombstone', () => {
      expect(() =>
        policy.expectationOf({ ...record(oneToOneGenesis()), removed: true }),
      ).toThrow(InvalidPublicMutationError);
    });
  });

  describe('assertPermitted', () => {
    it('refuses to delete an operation', async () => {
      await expect(
        policy.assertPermitted(
          record(oneToOneGenesis()),
          creator.valueOf(),
          true,
        ),
      ).rejects.toThrow(InvalidPublicMutationError);
    });

    it('admits the genesis of a 1:1 conversation', async () => {
      await expect(admit(oneToOneGenesis())).resolves.toBeUndefined();
    });
  });

  describe('a member or admin change replicated by an older node', () => {
    const oneToOne = oneToOneGenesis();
    const group = legacyGroupGenesis({
      creatorIdentityId: creator.valueOf(),
      networkId: networkId.valueOf(),
      participantIds: [creator.valueOf(), alice.valueOf()],
    });
    const genesisOf = {
      group: {
        conversationId: String(group.conversationId),
        hash: String(group.id).split(':op:')[1],
      },
      'one-to-one': {
        conversationId: oneToOne.getConversationId().valueOf(),
        hash: oneToOne.getHash(),
      },
    };
    const changes = (['group', 'one-to-one'] as const).flatMap((type) =>
      (
        [
          ['member_added', creator, { identityId: bob.valueOf() }],
          ['member_removed', creator, { identityId: alice.valueOf() }],
          ['member_left', alice, {}],
          ['admin_promoted', creator, { identityId: alice.valueOf() }],
          ['admin_demoted', creator, { identityId: alice.valueOf() }],
        ] as const
      ).map(([action, author, args]) => ({
        action,
        author: author.valueOf(),
        record: legacyGroupChange({
          action,
          args,
          authorIdentityId: author.valueOf(),
          conversationId: genesisOf[type].conversationId,
          networkId: networkId.valueOf(),
          parents: [genesisOf[type].hash],
        }),
        type,
      })),
    );

    it.each(changes)(
      'refuses $action on a $type conversation before checking the proof',
      ({ record: change }) => {
        expect(() => policy.expectationOf({ ...change })).toThrow(
          InvalidPublicMutationError,
        );
      },
    );

    it.each(changes)(
      'refuses to admit $action on a $type conversation',
      async ({ author, record: change }) => {
        await admit(oneToOne);

        await expect(
          policy.assertPermitted({ ...change }, author, false),
        ).rejects.toThrow(InvalidPublicMutationError);
      },
    );
  });

  describe('a group conversation replicated by an older node', () => {
    const legacy = legacyGroupGenesis({
      creatorIdentityId: creator.valueOf(),
      networkId: networkId.valueOf(),
      participantIds: [creator.valueOf(), alice.valueOf()],
    });

    it('refuses its genesis before checking the proof', () => {
      expect(() => policy.expectationOf({ ...legacy })).toThrow(
        InvalidPublicMutationError,
      );
    });

    it('refuses to admit its genesis', async () => {
      await expect(
        policy.assertPermitted({ ...legacy }, creator.valueOf(), false),
      ).rejects.toThrow(InvalidPublicMutationError);
    });
  });
});
