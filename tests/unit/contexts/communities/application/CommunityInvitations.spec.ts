import CommunityInviteAccepter from '@app/contexts/communities/application/accept-invite/CommunityInviteAccepter';
import { CommunityInviteAcceptMessage } from '@app/contexts/communities/application/accept-invite/messages/CommunityInviteAcceptMessage';
import CommunityInviteCreator from '@app/contexts/communities/application/create-invite/CommunityInviteCreator';
import { CommunityInviteCreateMessage } from '@app/contexts/communities/application/create-invite/messages/CommunityInviteCreateMessage';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityMemberInviter from '@app/contexts/communities/application/invite-member/CommunityMemberInviter';
import { CommunityMemberInviteMessage } from '@app/contexts/communities/application/invite-member/messages/CommunityMemberInviteMessage';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityInviteNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInviteNotFoundError';
import { CommunityOperationApplier } from '@app/contexts/communities/domain/operations/CommunityOperationApplier';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { CommunityInviteUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteUses';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../public-mutations/support/signedMutation';
import { genesis } from '../domain/operations/CommunityOperationFixtures';

const COMMUNITY_ID = '550e8400-e29b-41d4-a716-446655440000';
const INVITE_TOKEN = 'invite-token';
const ACTOR_ID = 'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
const INVITED_ID =
  'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=';

describe('Community invitation use cases', () => {
  let community: MockProxy<Community>;
  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let inviteRepository: MockProxy<CommunityInviteRepository>;
  let requestRepository: MockProxy<CommunityMembershipRequestRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;
  let proof: Record<string, unknown>;
  let operation: {
    createdAt: number;
    mutation: unknown;
    parents: string[];
  };
  const at = 1780000000000;
  const moderationLog = () => ({ createdAt: at, mutation: proof });

  beforeAll(async () => {
    proof = (
      await signedMutation({
        identityId: ACTOR_ID,
        kind: 'put',
        recordId: INVITE_TOKEN,
        sequence: 1,
        store: 'requests',
      })
    ).toPrimitives() as unknown as Record<string, unknown>;
    operation = {
      createdAt: at,
      mutation: (
        await signedMutation({
          identityId: ACTOR_ID,
          kind: 'put',
          recordId: 'operation-1',
          sequence: 0,
          store: 'communityOperations',
        })
      ).toPrimitives(),
      parents: [genesis().getHash()],
    };
  });

  beforeEach(() => {
    community = mock<Community>();
    communityFinder = mock<CommunityFinder>();
    communityRepository = mock<CommunityRepository>();
    inviteRepository = mock<CommunityInviteRepository>();
    requestRepository = mock<CommunityMembershipRequestRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    communityFinder.findById.mockResolvedValue(community);
    community.getId.mockReturnValue(new CommunityId(COMMUNITY_ID));
    community.pullDomainEvents.mockReturnValue([]);
  });

  it('records the invite use before persisting the signed join', async () => {
    const created = CommunityOperationApplier.create(genesis());
    const message = new CommunityInviteAcceptMessage(
      INVITE_TOKEN,
      ACTOR_ID,
      at,
      proof,
      operation,
    );
    const invite = mock<CommunityInvite>();
    invite.getCommunityId.mockReturnValue(created.getId());
    invite.getToken.mockReturnValue(new CommunityInviteToken(INVITE_TOKEN));
    inviteRepository.findByToken.mockResolvedValue(invite);
    inviteRepository.countUses.mockResolvedValue(new CommunityInviteUses(0));
    communityFinder.findById.mockResolvedValue(created);

    const result = await new CommunityInviteAccepter(
      communityFinder,
      communityRepository,
      inviteRepository,
      eventPublisher,
    ).accept(message);

    expect(invite.checkAcceptanceAvailability).toHaveBeenCalledWith(
      new CommunityInviteUses(0),
      message.usedAt,
    );
    expect(inviteRepository.recordUse).toHaveBeenCalledWith(
      invite,
      message.actorIdentityId,
      message.usedAt,
      message.proof,
    );
    const [saved, savedProof] = communityRepository.save.mock.calls[0];

    expect(saved.getAction()).toEqual(CommunityOperationAction.MEMBER_JOINED);
    expect(saved.getAuthorIdentityId()).toEqual(message.actorIdentityId);
    expect(saved.getArguments()).toEqual({
      identityId: ACTOR_ID,
      method: 'invite_link',
      reference: INVITE_TOKEN,
    });
    expect(savedProof).toBe(message.operation.proof);
    expect(inviteRepository.recordUse.mock.invocationCallOrder[0]).toBeLessThan(
      communityRepository.save.mock.invocationCallOrder[0],
    );
    expect(result).toBe(created);
    expect(result.isMember(message.actorIdentityId)).toBe(true);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown invite token without mutating a community', async () => {
    inviteRepository.findByToken.mockResolvedValue(undefined);

    await expect(
      new CommunityInviteAccepter(
        communityFinder,
        communityRepository,
        inviteRepository,
        eventPublisher,
      ).accept(
        new CommunityInviteAcceptMessage(
          INVITE_TOKEN,
          ACTOR_ID,
          at,
          proof,
          operation,
        ),
      ),
    ).rejects.toBeInstanceOf(CommunityInviteNotFoundError);

    expect(communityFinder.findById).not.toHaveBeenCalled();
    expect(communityRepository.save).not.toHaveBeenCalled();
  });

  it('creates and persists an invite with its moderation audit details', async () => {
    const expiresAt = Date.now() + 60_000;
    const message = new CommunityInviteCreateMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      'nonce-0123456789abcdef',
      at,
      proof,
      moderationLog(),
      expiresAt,
      5,
    );
    const invite = mock<CommunityInvite>();
    invite.getToken.mockReturnValue(new CommunityInviteToken(INVITE_TOKEN));
    invite.hasEncryptedCommunityKey.mockReturnValue(false);
    community.createInvite.mockReturnValue(invite);

    const result = await new CommunityInviteCreator(
      communityFinder,
      inviteRepository,
      eventPublisher,
      moderationLogRecorder,
    ).create(message);

    expect(community.createInvite).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.nonce,
      message.createdAt,
      message.expiresAt,
      message.maxUses,
      undefined,
    );
    expect(inviteRepository.save).toHaveBeenCalledWith(invite, message.proof);
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITE_LINK_CREATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      {
        encryptedCommunityKeyStored: false,
        expiresAt,
        maxUses: 5,
      },
    );
    expect(result).toBe(invite);
  });

  it('returns an existing pending member invitation idempotently', async () => {
    const message = new CommunityMemberInviteMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      INVITED_ID,
      at,
      proof,
      moderationLog(),
    );
    const pendingRequest = mock<CommunityMembershipRequest>();
    pendingRequest.isPending.mockReturnValue(true);
    requestRepository.findByCommunityAndIdentity.mockResolvedValue([
      pendingRequest,
    ]);

    const result = await new CommunityMemberInviter(
      communityFinder,
      requestRepository,
      eventPublisher,
      moderationLogRecorder,
    ).invite(message);

    expect(community.inviteMember).not.toHaveBeenCalled();
    expect(requestRepository.save).not.toHaveBeenCalled();
    expect(result).toBe(pendingRequest);
  });

  it('creates a new member invitation and records its moderation action', async () => {
    const message = new CommunityMemberInviteMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      INVITED_ID,
      at,
      proof,
      moderationLog(),
    );
    const membershipRequest = mock<CommunityMembershipRequest>();
    membershipRequest.getId.mockReturnValue(
      new CommunityRequestId('123456789012345678901234'),
    );
    membershipRequest.pullDomainEvents.mockReturnValue([]);
    requestRepository.findByCommunityAndIdentity.mockResolvedValue([]);
    community.inviteMember.mockReturnValue(membershipRequest);

    const result = await new CommunityMemberInviter(
      communityFinder,
      requestRepository,
      eventPublisher,
      moderationLogRecorder,
    ).invite(message);

    expect(community.inviteMember).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.invitedIdentityId,
      message.createdAt,
    );
    expect(requestRepository.save).toHaveBeenCalledWith(
      membershipRequest,
      message.proof,
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITATION_CREATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      { identityId: INVITED_ID },
    );
    expect(result).toBe(membershipRequest);
  });
});
