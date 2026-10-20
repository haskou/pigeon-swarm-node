import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import CommunityInvitationClaimMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInvitationClaimMutationPolicy';
import { PublicMutationPendingError } from '@app/contexts/public-mutations/domain/errors/PublicMutationPendingError';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import {
  CommunityInvitationConsent,
  CommunityInvitationKey,
} from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../../../public-mutations/support/signedMutation';
import {
  alice,
  ban,
  bob,
  communityId,
  genesis,
  Invitation,
  invitation,
  invitationFieldsOf,
  join,
  mallory,
  owner,
  privateKeyOf,
  revoke,
} from '../../../domain/operations/CommunityOperationFixtures';

describe('CommunityInvitationClaimMutationPolicy', () => {
  let authorization: MockProxy<PublicMutationAuthorAuthorization>;
  let communityRepository: MockProxy<OrbitDBCommunityRepository>;
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let verifier: PublicMutationVerifier;
  let policy: CommunityInvitationClaimMutationPolicy;
  const created = genesis();
  const invited = invitation([created]);

  function claimOf(
    joiner: IdentityId,
    under: Invitation = invited,
    key: CommunityInvitationKey = under.key,
  ): Record<string, unknown> {
    const fields = invitationFieldsOf(under.operation, joiner);

    return {
      communityId: communityId.valueOf(),
      consent: CommunityInvitationConsent.sign(fields, privateKeyOf(joiner)),
      id: CommunityInvitationClaim.idOf(under.operation.getHash(), joiner),
      identityId: joiner.valueOf(),
      invitationId: under.operation.getHash(),
      possession: key.signPossession(fields),
      scopeType: 'community_invitation_claim',
    };
  }

  async function signed(
    record: Record<string, unknown>,
    sequence = 0,
    author = record.identityId as string,
  ): Promise<Record<string, unknown>> {
    return PublicMutationRecord.withProof(
      record,
      await signedMutation({
        frontier: ['A'.repeat(43)],
        identityId: author,
        kind: 'put',
        payload: record,
        recordId: record.id as string,
        sequence,
        store: 'requests',
      }),
    );
  }

  function withOperations(operations: CommunityOperation[]): void {
    const { community, invitations } = CommunityStateFold.fold(operations);

    communityRepository.requireStateAtFrontier.mockResolvedValue({
      community: community!,
      invitations,
    });
  }

  function permit(
    record: Record<string, unknown>,
    author = record.identityId as string,
    isDeletion = false,
  ): Promise<void> {
    return policy.assertPermitted(record, author, isDeletion, ['frontier']);
  }

  beforeEach(() => {
    communityRepository = mock<OrbitDBCommunityRepository>();
    registry = mock<OrbitDBReplicatedStateRegistry>();
    registry.queryUnadmittedDocuments.mockResolvedValue([]);
    authorization = mock<PublicMutationAuthorAuthorization>();
    authorization.isAuthorized.mockResolvedValue(true);
    verifier = new PublicMutationVerifier(authorization);
    policy = new CommunityInvitationClaimMutationPolicy(
      communityRepository,
      registry,
      verifier,
    );
    withOperations([created, invited.operation]);
  });

  describe('expectationOf', () => {
    it('binds the proof to the claim id, its joiner and the requests store', () => {
      const claim = claimOf(alice);

      expect(policy.expectationOf(claim)).toEqual({
        authorIdentityId: alice.valueOf(),
        recordId: claim.id,
        store: 'requests',
      });
    });

    it.each([
      ['a removed marker', { removed: true }],
      ['an unknown field', { status: 'pending' }],
      ['another scope type', { scopeType: 'community_membership_request' }],
      [
        'an id of another invitation',
        { id: `invitation-claim:other:${alice.valueOf()}` },
      ],
      [
        'an id of another identity',
        { id: `invitation-claim:x:${bob.valueOf()}` },
      ],
      ['a non-canonical identity', { identityId: 'not-a-key' }],
    ])('rejects a claim with %s', (_name, overrides) => {
      expect(() =>
        policy.expectationOf({ ...claimOf(alice), ...overrides }),
      ).toThrow(InvalidPublicMutationError);
    });
  });

  describe('assertPermitted', () => {
    it('admits a claim under a live invitation with valid proofs', async () => {
      await expect(permit(claimOf(alice))).resolves.toBeUndefined();
      expect(communityRepository.requireStateAtFrontier).toHaveBeenCalledWith(
        communityId,
        ['frontier'],
      );
    });

    it('rejects a claim authored by another identity', async () => {
      await expect(permit(claimOf(alice), mallory.valueOf())).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('rejects a deletion', async () => {
      await expect(
        permit(claimOf(alice), alice.valueOf(), true),
      ).rejects.toThrow(InvalidPublicMutationError);
    });

    it('rejects a claim under an invitation unknown at the frontier', async () => {
      withOperations([created]);

      await expect(permit(claimOf(alice))).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('holds a claim for a community not replicated yet', async () => {
      communityRepository.requireStateAtFrontier.mockRejectedValue(
        new CommunityNotFoundError(),
      );

      await expect(permit(claimOf(alice))).rejects.toThrow(
        PublicMutationPendingError,
      );
    });

    it('rejects a claim whose possession another key signed', async () => {
      const forged = claimOf(
        alice,
        invited,
        CommunityInvitationKey.fromSecret('A'.repeat(43)),
      );

      await expect(permit(forged)).rejects.toThrow(InvalidPublicMutationError);
    });

    it('rejects a claim whose consent another identity signed', async () => {
      const forged = { ...claimOf(alice), consent: claimOf(bob).consent };

      await expect(permit(forged)).rejects.toThrow(InvalidPublicMutationError);
    });

    it('rejects a claim under a revoked invitation', async () => {
      withOperations([
        created,
        invited.operation,
        revoke([invited.operation], invited),
      ]);

      await expect(permit(claimOf(alice))).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('rejects a claim by a member', async () => {
      withOperations([created, invited.operation, join([created], alice)]);

      await expect(permit(claimOf(alice))).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('rejects a claim by a banned identity', async () => {
      withOperations([created, invited.operation, ban([created], alice)]);

      await expect(permit(claimOf(alice))).rejects.toThrow(
        InvalidPublicMutationError,
      );
    });

    it('rejects a claim by an identity other than the invitee', async () => {
      const personal = invitation([created], owner, {
        invitee: bob.valueOf(),
        maxUses: 1,
      });
      withOperations([created, personal.operation]);

      await expect(permit(claimOf(alice, personal))).rejects.toThrow(
        InvalidPublicMutationError,
      );
      await expect(permit(claimOf(bob, personal))).resolves.toBeUndefined();
    });
  });

  describe('through the public mutation gate', () => {
    let gate: PublicMutationGate;

    function holding(...documents: Record<string, unknown>[]): void {
      registry.queryUnadmittedDocuments.mockResolvedValue(documents);
    }

    function accepts(record: Record<string, unknown>): Promise<boolean> {
      return gate.accepts('requests', record);
    }

    beforeEach(() => {
      gate = new PublicMutationGate(verifier, [policy]);
    });

    it('admits a genuine first claim on a node that holds it and judges it again', async () => {
      const stored = await signed(claimOf(alice));
      holding(stored);

      await expect(accepts(stored)).resolves.toBe(true);
      expect(
        registry.queryUnadmittedDocuments.mock.calls[0][1]({
          id: stored.id,
          scopeType: 'community_invitation_claim',
        }),
      ).toBe(true);
    });

    it('admits the same claim signed again, which changes nothing', async () => {
      holding(await signed(claimOf(alice)));

      await expect(accepts(await signed(claimOf(alice), 1))).resolves.toBe(
        true,
      );
    });

    it('refuses a later claim that differs from a genuine stored claim', async () => {
      const later = await signed(
        { ...claimOf(alice), communityId: CommunityId.generate().valueOf() },
        1,
      );

      await expect(accepts(later)).resolves.toBe(true);

      holding(await signed(claimOf(alice)));

      await expect(accepts(later)).resolves.toBe(false);
    });

    it('ignores a stored claim under the same id that its joiner did not sign', async () => {
      const planted = await signed(
        { ...claimOf(alice), consent: claimOf(bob).consent },
        0,
        mallory.valueOf(),
      );
      holding(planted, PublicMutationRecord.payloadOf(planted));

      await expect(accepts(await signed(claimOf(alice)))).resolves.toBe(true);
    });
  });
});
