import { CommunityInvitationUnusableError } from '@app/contexts/communities/domain/errors/CommunityInvitationUnusableError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import CommunityOperationMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityOperationMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationPendingError } from '@app/contexts/public-mutations/domain/errors/PublicMutationPendingError';

import {
  admission,
  alice,
  ban,
  communityId,
  genesis,
  identitySignatureOf,
  invitation,
  invitationFieldsOf,
  join,
  mallory,
  operation,
  owner,
} from '../../../domain/operations/CommunityOperationFixtures';

describe('CommunityOperationMutationPolicy', () => {
  let policy: CommunityOperationMutationPolicy;

  beforeEach(() => {
    policy = new CommunityOperationMutationPolicy();
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

    it('rejects an operation without the author identity signature', () => {
      const unsigned: Record<string, unknown> = { ...record(genesis()) };

      delete unsigned.identitySignature;

      expect(() => policy.expectationOf(unsigned)).toThrow(
        InvalidPublicMutationError,
      );
    });

    it.each([
      ['a malformed signature', () => 'not-a-signature'],
      [
        'a signature by another identity',
        () => identitySignatureOf(mallory, genesis().getId()),
      ],
      [
        'a signature over another operation id',
        () => identitySignatureOf(owner, join([genesis()], alice).getId()),
      ],
    ])('rejects an operation with %s', (_name, signatureOf) => {
      const forged = {
        ...record(genesis()),
        identitySignature: signatureOf(),
      };

      expect(() => policy.expectationOf(forged)).toThrow(
        InvalidPublicMutationError,
      );
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

    it('holds an operation whose parent has not been admitted, then admits it once the parent arrives', async () => {
      const created = genesis();
      const joined = join([created], alice);

      await expect(admit(joined)).rejects.toBeInstanceOf(PublicMutationPendingError);

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

      await expect(admit(forgedRole)).rejects.not.toBeInstanceOf(PublicMutationPendingError);
    });

    it('refuses a ban of the owner signed by a plain member', async () => {
      const created = genesis();
      const joined = join([created], alice);
      const forgedBan = ban([joined], owner, alice);

      await admit(created);
      await admit(joined);

      await expect(admit(forgedBan)).rejects.not.toBeInstanceOf(PublicMutationPendingError);
    });

    it('refuses a membership that the author cannot grant', async () => {
      const created = genesis();
      const forgedJoin = join([created], mallory, mallory);

      await admit(created);

      await expect(admit(forgedJoin)).rejects.not.toBeInstanceOf(PublicMutationPendingError);
    });

    describe('joins', () => {
      function approvedJoin(
        method: string,
        reference?: string,
      ): [CommunityOperation, CommunityOperation] {
        const created = genesis();

        return [
          created,
          operation(
            CommunityOperationAction.MEMBER_JOINED,
            owner,
            {
              identityId: alice.valueOf(),
              method,
              ...(reference === undefined ? {} : { reference }),
            },
            [created],
          ),
        ];
      }

      it('admits an approval from the operations alone, without reading any request', async () => {
        const [created, approval] = approvedJoin('approval', 'request-1');

        await admit(created);

        await expect(admit(approval)).resolves.toBeUndefined();
      });

      it('admits an admission under an invitation of its causal past', async () => {
        const created = genesis();
        const invited = invitation([created]);

        await admit(created);
        await admit(invited.operation);

        await expect(
          admit(admission([invited.operation], invited, alice)),
        ).resolves.toBeUndefined();
      });

      it('refuses an admission whose possession proof is not by the invitation key', async () => {
        const created = genesis();
        const invited = invitation([created]);
        const other = invitation([created], owner, {}, 1, 'other');

        await admit(created);
        await admit(invited.operation);

        await expect(
          admit(
            admission([invited.operation], invited, alice, owner, 2, {
              possession: other.key.signPossession(
                invitationFieldsOf(invited.operation, alice),
              ),
            }),
          ),
        ).rejects.toBeInstanceOf(CommunityInvitationUnusableError);
      });

      it('refuses a join by the removed invite_link method', async () => {
        const [created, removed] = approvedJoin('invite_link', 'request-1');

        await admit(created);

        await expect(admit(removed)).rejects.not.toBeInstanceOf(PublicMutationPendingError);
      });

      it('refuses a join that skips the reference its method requires', async () => {
        const [created, approval] = approvedJoin('approval');

        await admit(created);

        await expect(admit(approval)).rejects.not.toBeInstanceOf(PublicMutationPendingError);
      });

      it('refuses a reference on a method that must not carry one', async () => {
        const [created, added] = approvedJoin('added', 'request-1');

        await admit(created);

        await expect(admit(added)).rejects.not.toBeInstanceOf(PublicMutationPendingError);
      });
    });
  });
});
