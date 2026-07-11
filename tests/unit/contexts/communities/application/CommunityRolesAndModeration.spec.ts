import CommunityMemberRolesAssigner from '@app/contexts/communities/application/assign-member-roles/CommunityMemberRolesAssigner';
import { CommunityMemberRolesAssignMessage } from '@app/contexts/communities/application/assign-member-roles/messages/CommunityMemberRolesAssignMessage';
import CommunityMemberBanner from '@app/contexts/communities/application/ban-member/CommunityMemberBanner';
import CommunityMemberUnbanner from '@app/contexts/communities/application/ban-member/CommunityMemberUnbanner';
import { CommunityMemberBanMessage } from '@app/contexts/communities/application/ban-member/messages/CommunityMemberBanMessage';
import { CommunityMemberUnbanMessage } from '@app/contexts/communities/application/ban-member/messages/CommunityMemberUnbanMessage';
import CommunityRoleCreator from '@app/contexts/communities/application/create-role/CommunityRoleCreator';
import { CommunityRoleCreateMessage } from '@app/contexts/communities/application/create-role/messages/CommunityRoleCreateMessage';
import CommunityRoleDeleter from '@app/contexts/communities/application/delete-role/CommunityRoleDeleter';
import { CommunityRoleDeleteMessage } from '@app/contexts/communities/application/delete-role/messages/CommunityRoleDeleteMessage';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import CommunityRoleUpdater from '@app/contexts/communities/application/update-role/CommunityRoleUpdater';
import { CommunityRoleUpdateMessage } from '@app/contexts/communities/application/update-role/messages/CommunityRoleUpdateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRole } from '@app/contexts/communities/domain/entities/membership/CommunityRole';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

const COMMUNITY_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROLE_ID = '550e8400-e29b-41d4-a716-446655440001';
const ACTOR_ID =
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
const TARGET_ID =
  'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=';

describe('Community role and moderation use cases', () => {
  let community: MockProxy<Community>;
  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;

  beforeEach(() => {
    community = mock<Community>();
    communityFinder = mock<CommunityFinder>();
    communityRepository = mock<CommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    communityFinder.findById.mockResolvedValue(community);
    community.pullDomainEvents.mockReturnValue([]);
  });

  it('assigns member roles and records the moderation action', async () => {
    const message = new CommunityMemberRolesAssignMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      TARGET_ID,
      [ROLE_ID],
    );

    const result = await new CommunityMemberRolesAssigner(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).assign(message);

    expect(community.assignRoles).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.targetIdentityId,
      message.roleIds,
    );
    expect(communityRepository.save).toHaveBeenCalledWith(community);
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_ROLES_UPDATED,
      expect.any(CommunityModerationTarget),
      { roleIds: [ROLE_ID] },
    );
    expect(result).toBe(community);
  });

  it('bans a member and keeps the reason in the moderation log', async () => {
    const message = new CommunityMemberBanMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      TARGET_ID,
      'spam',
    );

    const result = await new CommunityMemberBanner(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).ban(message);

    expect(community.banMember).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.targetIdentityId,
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_BANNED,
      expect.any(CommunityModerationTarget),
      { reason: 'spam' },
    );
    expect(result).toBe(community);
  });

  it('unbans a member and records the moderation action', async () => {
    const message = new CommunityMemberUnbanMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      TARGET_ID,
    );

    const result = await new CommunityMemberUnbanner(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).unban(message);

    expect(community.unbanMember).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.targetIdentityId,
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_UNBANNED,
      expect.any(CommunityModerationTarget),
    );
    expect(result).toBe(community);
  });

  it('creates a role and records its assigned permissions', async () => {
    const message = new CommunityRoleCreateMessage(
      COMMUNITY_ID,
      ACTOR_ID,
      'Moderators',
      ['manage_members'],
    );
    const role = mock<CommunityRole>();
    community.addRole.mockReturnValue(role);

    const result = await new CommunityRoleCreator(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).create(message);

    expect(community.addRole).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.name,
      message.permissions,
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_CREATED,
      expect.any(CommunityModerationTarget),
      { name: 'Moderators', permissions: ['manage_members'] },
    );
    expect(result).toBe(role);
  });

  it('updates a role and records its new definition', async () => {
    const message = new CommunityRoleUpdateMessage(
      COMMUNITY_ID,
      ROLE_ID,
      ACTOR_ID,
      'Editors',
      ['manage_messages'],
    );

    const result = await new CommunityRoleUpdater(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).update(message);

    expect(community.updateRole).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.roleId,
      message.name,
      message.permissions,
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_UPDATED,
      expect.any(CommunityModerationTarget),
      { name: 'Editors', permissions: ['manage_messages'] },
    );
    expect(result).toBe(community);
  });

  it('deletes a role and records the moderation action', async () => {
    const message = new CommunityRoleDeleteMessage(
      COMMUNITY_ID,
      ROLE_ID,
      ACTOR_ID,
    );

    const result = await new CommunityRoleDeleter(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).delete(message);

    expect(community.deleteRole).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.roleId,
    );
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_DELETED,
      expect.any(CommunityModerationTarget),
    );
    expect(result).toBe(community);
  });
});
