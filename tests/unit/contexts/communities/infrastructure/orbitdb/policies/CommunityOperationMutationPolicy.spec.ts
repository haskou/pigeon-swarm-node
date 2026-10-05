import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import CommunityOperationMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityOperationMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock } from 'jest-mock-extended';

import {
  alice,
  ban,
  communityId,
  genesis,
  join,
  mallory,
  networkId,
  operation,
  owner,
} from '../../../domain/operations/CommunityOperationFixtures';

describe('CommunityOperationMutationPolicy', () => {
  let registry: ReturnType<typeof mock<OrbitDBReplicatedStateRegistry>>;
  let policy: CommunityOperationMutationPolicy;

  beforeEach(() => {
    registry = mock<OrbitDBReplicatedStateRegistry>();
    registry.queryDocuments.mockResolvedValue([]);
    policy = new CommunityOperationMutationPolicy(registry);
  });

  function record(op: CommunityOperation): Record<string, unknown> {
    return { ...op.toPrimitives() };
  }

  function admit(op: CommunityOperation): Promise<void> {
    return policy.assertPermitted(
      record(op),
      op.getAuthorIdentityId().valueOf(),
      false,
    );
  }

  function request(
    overrides: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      communityId: communityId.valueOf(),
      id: 'request-1',
      identityId: alice.valueOf(),
      scopeType: 'community_membership_request',
      status: 'accepted',
      type: 'request',
      ...overrides,
    };
  }

  describe('expectationOf', () => {
    it('binds the proof to the operation id, its author and the operations store', () => {
      const created = genesis();

      expect(policy.expectationOf(record(created))).toEqual({
        authorIdentityId: owner.valueOf(),
        recordId: created.getId(),
        store: 'communityOperations',
      });
    });

    it.each([
      ['a removed marker', { removed: true }],
      ['a future-dated deletion time', { deletedAt: 4102444800000 }],
      ['an updatedAt clock', { updatedAt: 4102444800000 }],
      ['a deleted flag', { deleted: true }],
      ['an unknown field', { roles: ['owner'] }],
      ['another scope type', { scopeType: 'community_channel' }],
    ])('rejects a record with %s', (_name, overrides) => {
      expect(() =>
        policy.expectationOf({ ...record(genesis()), ...overrides }),
      ).toThrow(InvalidPublicMutationError);
    });

    it.each([
      ['an id that is not the digest of the content', { name: 'forged' }],
      ['a non-integer creation time', { createdAt: 1.5 }],
      ['no parents for a regular action', { action: 'member_banned' }],
    ])('rejects an operation with %s', (_name, overrides) => {
      const forged = { ...record(genesis()), ...overrides };

      expect(() => policy.expectationOf(forged)).toThrow();
    });

    it('rejects a genesis that claims a community id its author did not derive', () => {
      const forged = {
        ...record(genesis()),
        authorIdentityId: mallory.valueOf(),
      };

      expect(() => policy.expectationOf(forged)).toThrow();
    });
  });

  describe('assertPermitted', () => {
    it('admits a genesis followed by the operations built on it', async () => {
      const created = genesis();
      const joined = join([created], alice);

      await expect(admit(created)).resolves.toBeUndefined();
      await expect(admit(joined)).resolves.toBeUndefined();
    });

    it('rejects a deletion of an operation', async () => {
      const created = genesis();

      await expect(
        policy.assertPermitted(record(created), owner.valueOf(), true),
      ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    });

    it('is idempotent for a replayed operation', async () => {
      const created = genesis();

      await admit(created);

      await expect(admit(created)).resolves.toBeUndefined();
    });

    it('refuses an operation whose parent has not been admitted, then admits it once the parent arrives', async () => {
      const created = genesis();
      const joined = join([created], alice);

      await expect(admit(joined)).rejects.toThrow();

      await admit(created);

      await expect(admit(joined)).resolves.toBeUndefined();
    });

    it('refuses a role grant signed by somebody outside the community', async () => {
      const created = genesis();
      const roleId = CommunityRoleId.derive(
        communityId.valueOf(),
        mallory.valueOf(),
        9,
      ).valueOf();
      const forgedRole = operation(
        CommunityOperationAction.ROLE_CREATED,
        mallory,
        { name: 'admin', permissions: ['manage_roles'], roleId },
        [created],
        9,
      );

      await admit(created);

      await expect(admit(forgedRole)).rejects.toThrow();
    });

    it('refuses a ban of the owner signed by a plain member', async () => {
      const created = genesis();
      const joined = join([created], alice);
      const forgedBan = ban([joined], owner, alice);

      await admit(created);
      await admit(joined);

      await expect(admit(forgedBan)).rejects.toThrow();
    });

    it('refuses a membership that the author cannot grant', async () => {
      const created = genesis();
      const forgedJoin = join([created], mallory, mallory);

      await admit(created);

      await expect(admit(forgedJoin)).rejects.toThrow();
    });

    describe('join references', () => {
      const SELF_JOIN_METHODS = ['invitation', 'invite_link'];

      function approvedJoin(
        method: string,
        reference?: string,
      ): [CommunityOperation, CommunityOperation] {
        const created = genesis();

        return [
          created,
          operation(
            CommunityOperationAction.MEMBER_JOINED,
            SELF_JOIN_METHODS.includes(method) ? alice : owner,
            {
              identityId: alice.valueOf(),
              method,
              ...(reference === undefined ? {} : { reference }),
            },
            [created],
          ),
        ];
      }

      it('admits an approval that points at an accepted request', async () => {
        const [created, approval] = approvedJoin('approval', 'request-1');

        registry.queryDocuments.mockResolvedValue([request({})]);
        await admit(created);

        await expect(admit(approval)).resolves.toBeUndefined();
        expect(registry.queryDocuments).toHaveBeenCalledWith(
          'requests',
          expect.any(Function),
          [networkId.valueOf()],
        );
      });

      it.each([
        ['no record at all', []],
        ['a pending request', [request({ status: 'pending' })]],
        [
          'a request of somebody else',
          [request({ identityId: mallory.valueOf() })],
        ],
        ['a request of another community', [request({ communityId: 'other' })]],
        [
          'an invitation instead of a request',
          [request({ type: 'invitation' })],
        ],
        [
          'a record of another kind',
          [request({ scopeType: 'community_invite' })],
        ],
      ])('refuses an approval referencing %s', async (_name, records) => {
        const [created, approval] = approvedJoin('approval', 'request-1');

        registry.queryDocuments.mockResolvedValue(records);
        await admit(created);

        await expect(admit(approval)).rejects.toThrow();
      });

      it('admits an invitation that points at an accepted invitation', async () => {
        const [created, invitation] = approvedJoin('invitation', 'request-1');

        registry.queryDocuments.mockResolvedValue([
          request({ type: 'invitation' }),
        ]);
        await admit(created);

        await expect(admit(invitation)).resolves.toBeUndefined();
      });

      it('admits an invite link only when the invite and its use are both signed', async () => {
        const [created, viaLink] = approvedJoin('invite_link', 'token-1');
        const invite = {
          communityId: communityId.valueOf(),
          id: 'token-1',
          scopeType: 'community_invite',
        };
        const use = {
          communityId: communityId.valueOf(),
          id: `invite-use:token-1:${alice.valueOf()}`,
          identityId: alice.valueOf(),
          scopeType: 'community_invite_use',
          token: 'token-1',
        };

        await admit(created);
        registry.queryDocuments.mockResolvedValue([invite]);

        await expect(admit(viaLink)).rejects.toThrow();

        registry.queryDocuments.mockResolvedValue([invite, use]);

        await expect(admit(viaLink)).resolves.toBeUndefined();
      });

      it('refuses a join that skips the reference its method requires', async () => {
        const [created, approval] = approvedJoin('approval');

        await admit(created);

        await expect(admit(approval)).rejects.toThrow();
      });

      it('refuses a reference on a method that must not carry one', async () => {
        const [created, added] = approvedJoin('added', 'request-1');

        await admit(created);

        await expect(admit(added)).rejects.toThrow();
      });
    });
  });
});
