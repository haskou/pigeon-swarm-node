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
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

const COMMUNITY_ID = '550e8400-e29b-41d4-a716-446655440000';
const INVITE_TOKEN = 'invite-token';
const ACTOR_ID =
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
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

  it('accepts and consumes an invite before persisting the community', async () => {
    const message = new CommunityInviteAcceptMessage(INVITE_TOKEN, ACTOR_ID);
    const invite = mock<CommunityInvite>();
    const acceptedInvite = mock<CommunityInvite>();
    invite.getCommunityId.mockReturnValue(new CommunityId(COMMUNITY_ID));
    inviteRepository.findByToken.mockResolvedValue(invite);
    inviteRepository.consume.mockResolvedValue(acceptedInvite);

    const result = await new CommunityInviteAccepter(
      communityFinder,
      communityRepository,
      inviteRepository,
      eventPublisher,
    ).accept(message);

    expect(community.requestMembership).toHaveBeenCalledWith(
      message.actorIdentityId,
    );
    expect(inviteRepository.consume).toHaveBeenCalledWith(invite);
    expect(community.acceptInvite).toHaveBeenCalledWith(
      message.actorIdentityId,
      acceptedInvite,
    );
    expect(communityRepository.save).toHaveBeenCalledWith(community);
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
    expect(result).toBe(community);
  });

  it('rejects an unknown invite token without mutating a community', async () => {
    inviteRepository.findByToken.mockResolvedValue(undefined);

    await expect(
      new CommunityInviteAccepter(
        communityFinder,
        communityRepository,
        inviteRepository,
        eventPublisher,
      ).accept(new CommunityInviteAcceptMessage(INVITE_TOKEN, ACTOR_ID)),
    ).rejects.toBeInstanceOf(CommunityInviteNotFoundError);

    expect(communityFinder.findById).not.toHaveBeenCalled();
    expect(communityRepository.save).not.toHaveBeenCalled();
  });

  it('creates and persists an invite with its moderation audit details', async () => {
    const expiresAt = Date.now() + 60_000;
    const message = new CommunityInviteCreateMessage(
      COMMUNITY_ID,
      ACTOR_ID,
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
      message.expiresAt,
      message.maxUses,
      undefined,
    );
    expect(inviteRepository.save).toHaveBeenCalledWith(invite);
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITE_LINK_CREATED,
      expect.any(CommunityModerationTarget),
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
    );
    expect(requestRepository.save).toHaveBeenCalledWith(membershipRequest);
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.INVITATION_CREATED,
      expect.any(CommunityModerationTarget),
      { identityId: INVITED_ID },
    );
    expect(result).toBe(membershipRequest);
  });
});
