import CommunityInvitationAdmitter from '@app/contexts/communities/application/admit-invitation/CommunityInvitationAdmitter';
import { CommunityInvitationAdmitMessage } from '@app/contexts/communities/application/admit-invitation/messages/CommunityInvitationAdmitMessage';
import CommunityInvitationClaimer from '@app/contexts/communities/application/claim-invitation/CommunityInvitationClaimer';
import { CommunityInvitationClaimMessage } from '@app/contexts/communities/application/claim-invitation/messages/CommunityInvitationClaimMessage';
import CommunityInvitationCreator from '@app/contexts/communities/application/create-invitation/CommunityInvitationCreator';
import { CommunityInvitationCreateMessage } from '@app/contexts/communities/application/create-invitation/messages/CommunityInvitationCreateMessage';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityInvitationClaimsFinder from '@app/contexts/communities/application/find-invitation-claims/CommunityInvitationClaimsFinder';
import { CommunityInvitationClaimsFindMessage } from '@app/contexts/communities/application/find-invitation-claims/messages/CommunityInvitationClaimsFindMessage';
import CommunityInvitationsFinder from '@app/contexts/communities/application/find-invitations/CommunityInvitationsFinder';
import { CommunityInvitationsFindMessage } from '@app/contexts/communities/application/find-invitations/messages/CommunityInvitationsFindMessage';
import CommunityInvitationPreviewer from '@app/contexts/communities/application/preview-invitation/CommunityInvitationPreviewer';
import { CommunityInvitationPreviewMessage } from '@app/contexts/communities/application/preview-invitation/messages/CommunityInvitationPreviewMessage';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import CommunityInvitationRevoker from '@app/contexts/communities/application/revoke-invitation/CommunityInvitationRevoker';
import { CommunityInvitationRevokeMessage } from '@app/contexts/communities/application/revoke-invitation/messages/CommunityInvitationRevokeMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';
import { CommunityInvitations } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitations';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityInvitationNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInvitationNotFoundError';
import { CommunityInvitationUnusableError } from '@app/contexts/communities/domain/errors/CommunityInvitationUnusableError';
import { CommunityMemberNotFoundError } from '@app/contexts/communities/domain/errors/CommunityMemberNotFoundError';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityPermissionDeniedError } from '@app/contexts/communities/domain/errors/CommunityPermissionDeniedError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import CommunityInvitationClaimRepository from '@app/contexts/communities/domain/repositories/CommunityInvitationClaimRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import {
  CommunityInvitationConsent,
  CommunityInvitationKey,
} from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../public-mutations/support/signedMutation';
import {
  admission,
  alice,
  ban,
  bob,
  communityId,
  DAY,
  genesis,
  Invitation,
  invitation,
  invitationFieldsOf,
  join,
  mallory,
  owner,
  privateKeyOf,
  revoke,
  unverifiedIdentitySignature,
} from '../domain/operations/CommunityOperationFixtures';

const COMMUNITY_ID = communityId.valueOf();
const OPERATION_CREATED_AT = 1780000000001;

type Operations = {
  created: CommunityOperation;
  invited: Invitation;
  joined: CommunityOperation;
};

describe('Community invitation use cases', () => {
  let moderationLog: { createdAt: number; mutation: unknown };
  let signedOperation: {
    createdAt: number;
    identitySignature: string;
    mutation: unknown;
    parents: string[];
  };
  let claimMutation: unknown;
  let operations: Operations;
  let community: Community;
  let invitations: CommunityInvitations;
  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let claimRepository: MockProxy<CommunityInvitationClaimRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;

  const foldOf = (...extra: CommunityOperation[]): void => {
    const state = CommunityStateFold.fold([
      operations.created,
      operations.joined,
      operations.invited.operation,
      ...extra,
    ]);

    community = state.community as Community;
    community.pullDomainEvents();
    invitations = state.invitations;
    communityFinder.findById.mockResolvedValue(community);
    communityRepository.findInvitations.mockResolvedValue(invitations);
  };

  const proofsOf = (
    joiner: IdentityId,
    invited = operations.invited,
  ): { consent: string; possession: string } => {
    const fields = invitationFieldsOf(invited.operation, joiner);

    return {
      consent: CommunityInvitationConsent.sign(fields, privateKeyOf(joiner)),
      possession: invited.key.signPossession(fields),
    };
  };

  const claimOf = (joiner: IdentityId): CommunityInvitationClaim => {
    const proofs = proofsOf(joiner);

    return CommunityInvitationClaim.create(
      communityId,
      operations.invited.operation.getHash(),
      joiner,
      proofs.possession,
      proofs.consent,
    );
  };

  const expectSaved = (
    message: { operation: { proof: unknown } },
    action: CommunityOperationAction,
    args: Record<string, unknown>,
  ): void => {
    expect(communityRepository.save).toHaveBeenCalledTimes(1);

    const [saved, proof] = communityRepository.save.mock.calls[0];

    expect(saved.getAction().valueOf()).toBe(action.valueOf());
    expect(saved.getArguments()).toEqual(args);
    expect(proof).toBe(message.operation.proof);
  };

  beforeAll(async () => {
    moderationLog = {
      createdAt: OPERATION_CREATED_AT - 1,
      mutation: (
        await signedMutation({
          identityId: owner.valueOf(),
          kind: 'put',
          recordId: 'log-1',
          sequence: 1,
          store: 'moderationLogs',
        })
      ).toPrimitives(),
    };
    signedOperation = {
      createdAt: OPERATION_CREATED_AT,
      identitySignature: unverifiedIdentitySignature,
      mutation: (
        await signedMutation({
          identityId: owner.valueOf(),
          kind: 'put',
          recordId: 'operation-1',
          sequence: 0,
          store: 'communityOperations',
        })
      ).toPrimitives(),
      parents: [genesis().getHash()],
    };
    claimMutation = (
      await signedMutation({
        identityId: bob.valueOf(),
        kind: 'put',
        recordId: 'claim-1',
        sequence: 0,
        store: 'requests',
      })
    ).toPrimitives();
  });

  beforeEach(() => {
    const created = genesis();
    const joined = join([created], alice);

    operations = {
      created,
      invited: invitation([joined], owner, {}, DAY),
      joined,
    };
    communityFinder = mock<CommunityFinder>();
    communityRepository = mock<CommunityRepository>();
    claimRepository = mock<CommunityInvitationClaimRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    jest.spyOn(Date, 'now').mockReturnValue(2 * DAY);
    foldOf();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe(CommunityInvitationCreator.name, () => {
    const creatorOf = (): CommunityInvitationCreator =>
      new CommunityInvitationCreator(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      );
    const invitationKey = CommunityInvitationKey.generate().key.publicKey();
    const fields = {
      expiresAt: OPERATION_CREATED_AT + 7 * DAY,
      invitationKey,
      maxUses: 3,
    };

    it('stores a signed invitation and logs it under its id', async () => {
      const message = new CommunityInvitationCreateMessage(
        COMMUNITY_ID,
        owner.valueOf(),
        fields,
        moderationLog,
        signedOperation,
      );

      const result = await creatorOf().create(message);

      expectSaved(message, CommunityOperationAction.INVITATION_CREATED, fields);

      const [saved] = communityRepository.save.mock.calls[0];

      expect(result.invitation.toPrimitives(result.community)).toEqual(
        expect.objectContaining({
          id: saved.getHash(),
          invitationKey,
          live: true,
          maxUses: 3,
          uses: 0,
        }),
      );
      expect(moderationLogRecorder.record).toHaveBeenCalledWith(
        community,
        message.actorIdentityId,
        CommunityModerationAction.INVITATION_CREATED,
        expect.any(CommunityModerationTarget),
        message.moderationLog,
        { expiresAt: fields.expiresAt, maxUses: 3 },
      );
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('binds a single-use invitation to an invitee', async () => {
      const bound = { ...fields, invitee: bob.valueOf(), maxUses: 1 };
      const message = new CommunityInvitationCreateMessage(
        COMMUNITY_ID,
        owner.valueOf(),
        bound,
        moderationLog,
        signedOperation,
      );

      await creatorOf().create(message);

      expectSaved(message, CommunityOperationAction.INVITATION_CREATED, bound);
    });

    it('refuses an issuer without create_invites', async () => {
      await expect(
        creatorOf().create(
          new CommunityInvitationCreateMessage(
            COMMUNITY_ID,
            alice.valueOf(),
            fields,
            moderationLog,
            signedOperation,
          ),
        ),
      ).rejects.toThrow(CommunityPermissionDeniedError);
      expect(communityRepository.save).not.toHaveBeenCalled();
      expect(moderationLogRecorder.record).not.toHaveBeenCalled();
    });
  });

  describe(CommunityInvitationsFinder.name, () => {
    const finderOf = (): CommunityInvitationsFinder =>
      new CommunityInvitationsFinder(communityFinder, communityRepository);

    it('lists the invitations to a member', async () => {
      const result = await finderOf().find(
        new CommunityInvitationsFindMessage(COMMUNITY_ID, alice.valueOf()),
      );

      expect(result.community).toBe(community);
      expect(result.invitations.map((found) => found.getId())).toEqual([
        operations.invited.operation.getHash(),
      ]);
    });

    it('denies a non-member before reading any invitation', async () => {
      await expect(
        finderOf().find(
          new CommunityInvitationsFindMessage(COMMUNITY_ID, mallory.valueOf()),
        ),
      ).rejects.toThrow(CommunityMemberNotFoundError);
      expect(communityRepository.findInvitations).not.toHaveBeenCalled();
    });
  });

  describe(CommunityInvitationPreviewer.name, () => {
    const previewOf = (invitationKey: string) =>
      new CommunityInvitationPreviewer(
        communityFinder,
        communityRepository,
      ).preview(
        new CommunityInvitationPreviewMessage(COMMUNITY_ID, invitationKey),
      );

    it('previews a live, open invitation by its key', async () => {
      const result = await previewOf(operations.invited.key.publicKey());

      expect(result.community).toBe(community);
      expect(result.invitation.getId()).toBe(
        operations.invited.operation.getHash(),
      );
    });

    it('refuses an unknown key like an unknown community', async () => {
      await expect(
        previewOf(CommunityInvitationKey.generate().key.publicKey()),
      ).rejects.toThrow(CommunityNotFoundError);
    });

    it('refuses a revoked invitation like an unknown community', async () => {
      foldOf(revoke([operations.invited.operation], operations.invited));

      await expect(
        previewOf(operations.invited.key.publicKey()),
      ).rejects.toThrow(CommunityNotFoundError);
    });

    it('refuses an expired invitation like an unknown community', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(9 * DAY);

      await expect(
        previewOf(operations.invited.key.publicKey()),
      ).rejects.toThrow(CommunityNotFoundError);
    });
  });

  describe(CommunityInvitationClaimer.name, () => {
    const claimOfMessage = (
      joiner: IdentityId,
      proofs = proofsOf(joiner),
      invitationId = operations.invited.operation.getHash(),
    ) =>
      new CommunityInvitationClaimer(
        communityFinder,
        communityRepository,
        claimRepository,
      ).claim(
        new CommunityInvitationClaimMessage(
          COMMUNITY_ID,
          invitationId,
          joiner.valueOf(),
          proofs,
          claimMutation,
        ),
      );

    it('stores the claim of a link holder', async () => {
      const claim = await claimOfMessage(bob);

      expect(claim.toPrimitives()).toEqual(claimOf(bob).toPrimitives());
      expect(claimRepository.save).toHaveBeenCalledWith(
        claim,
        expect.anything(),
      );
    });

    it('refuses a claim under an unknown invitation', async () => {
      await expect(
        claimOfMessage(bob, proofsOf(bob), 'unknown'),
      ).rejects.toThrow(CommunityInvitationNotFoundError);
      expect(claimRepository.save).not.toHaveBeenCalled();
    });

    it('refuses proofs signed for another joiner', async () => {
      await expect(claimOfMessage(bob, proofsOf(mallory))).rejects.toThrow(
        CommunityInvitationUnusableError,
      );
      expect(claimRepository.save).not.toHaveBeenCalled();
    });

    it('refuses a member and a banned identity', async () => {
      await expect(claimOfMessage(alice)).rejects.toThrow(
        CommunityInvitationUnusableError,
      );

      foldOf(ban([operations.invited.operation], bob));

      await expect(claimOfMessage(bob)).rejects.toThrow(
        CommunityInvitationUnusableError,
      );
      expect(claimRepository.save).not.toHaveBeenCalled();
    });
  });

  describe(CommunityInvitationClaimsFinder.name, () => {
    const claimsOf = (identityId: IdentityId) =>
      new CommunityInvitationClaimsFinder(
        communityFinder,
        communityRepository,
        claimRepository,
      ).find(
        new CommunityInvitationClaimsFindMessage(
          COMMUNITY_ID,
          identityId.valueOf(),
        ),
      );

    it('lists only the claims a manager may still admit', async () => {
      foldOf(
        admission([operations.invited.operation], operations.invited, mallory),
      );
      claimRepository.findByCommunity.mockResolvedValue([
        claimOf(bob),
        claimOf(mallory),
        claimOf(alice),
      ]);

      const claims = await claimsOf(owner);

      expect(claims.map((claim) => claim.getIdentityId().valueOf())).toEqual([
        bob.valueOf(),
      ]);
    });

    it('lists nothing once the invitation expired', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(9 * DAY);
      claimRepository.findByCommunity.mockResolvedValue([claimOf(bob)]);

      await expect(claimsOf(owner)).resolves.toEqual([]);
    });

    it('denies a member without manage_members', async () => {
      await expect(claimsOf(alice)).rejects.toThrow(
        CommunityPermissionDeniedError,
      );
      expect(claimRepository.findByCommunity).not.toHaveBeenCalled();
    });
  });

  describe(CommunityInvitationAdmitter.name, () => {
    const admitterOf = (): CommunityInvitationAdmitter =>
      new CommunityInvitationAdmitter(
        communityFinder,
        communityRepository,
        eventPublisher,
      );
    const messageOf = (
      actor: IdentityId,
      invitationId = operations.invited.operation.getHash(),
    ): CommunityInvitationAdmitMessage =>
      new CommunityInvitationAdmitMessage(
        COMMUNITY_ID,
        invitationId,
        actor.valueOf(),
        { ...proofsOf(bob), identityId: bob.valueOf() },
        signedOperation,
      );

    it('stores the admission of a claim', async () => {
      const message = messageOf(owner);

      const result = await admitterOf().admit(message);

      expect(result.isMember(bob)).toBe(true);
      expectSaved(message, CommunityOperationAction.MEMBER_JOINED, {
        ...proofsOf(bob),
        identityId: bob.valueOf(),
        invitationId: operations.invited.operation.getHash(),
        method: 'invitation',
      });
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('refuses an admission under an unknown invitation', async () => {
      await expect(
        admitterOf().admit(messageOf(owner, 'unknown')),
      ).rejects.toThrow(CommunityInvitationNotFoundError);
      expect(communityRepository.save).not.toHaveBeenCalled();
    });

    it('refuses an admitter without manage_members', async () => {
      await expect(admitterOf().admit(messageOf(alice))).rejects.toThrow(
        CommunityPermissionDeniedError,
      );
      expect(communityRepository.save).not.toHaveBeenCalled();
    });
  });

  describe(CommunityInvitationRevoker.name, () => {
    const revokerOf = (): CommunityInvitationRevoker =>
      new CommunityInvitationRevoker(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      );

    it('stores the revocation and logs it under the invitation id', async () => {
      const invitationId = operations.invited.operation.getHash();
      const message = new CommunityInvitationRevokeMessage(
        COMMUNITY_ID,
        invitationId,
        owner.valueOf(),
        moderationLog,
        signedOperation,
      );

      const result = await revokerOf().revoke(message);

      expect(result.invitation.isRevoked()).toBe(true);
      expectSaved(message, CommunityOperationAction.INVITATION_REVOKED, {
        invitationId,
      });
      expect(moderationLogRecorder.record).toHaveBeenCalledWith(
        community,
        message.actorIdentityId,
        CommunityModerationAction.INVITATION_REVOKED,
        expect.any(CommunityModerationTarget),
        message.moderationLog,
      );
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('refuses to revoke an unknown invitation', async () => {
      await expect(
        revokerOf().revoke(
          new CommunityInvitationRevokeMessage(
            COMMUNITY_ID,
            'unknown',
            owner.valueOf(),
            moderationLog,
            signedOperation,
          ),
        ),
      ).rejects.toThrow(CommunityInvitationNotFoundError);
      expect(communityRepository.save).not.toHaveBeenCalled();
    });
  });
});
