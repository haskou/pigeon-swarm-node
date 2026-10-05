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
import CommunityMemberKicker from '@app/contexts/communities/application/kick-member/CommunityMemberKicker';
import { CommunityMemberKickMessage } from '@app/contexts/communities/application/kick-member/messages/CommunityMemberKickMessage';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import CommunityRoleUpdater from '@app/contexts/communities/application/update-role/CommunityRoleUpdater';
import { CommunityRoleUpdateMessage } from '@app/contexts/communities/application/update-role/messages/CommunityRoleUpdateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityPermissionDeniedError } from '@app/contexts/communities/domain/errors/CommunityPermissionDeniedError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationApplier } from '@app/contexts/communities/domain/operations/CommunityOperationApplier';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../public-mutations/support/signedMutation';
import {
  alice,
  ban,
  communityId,
  genesis,
  join,
  mallory,
  operation,
  owner,
} from '../domain/operations/CommunityOperationFixtures';

const OPERATION_CREATED_AT = 1780000000001;
const MODERATION_LOG_CREATED_AT = 1780000000000;
const COMMUNITY_ID = communityId.valueOf();
const OWNER_ID = owner.valueOf();
const ALICE_ID = alice.valueOf();
const MALLORY_ID = mallory.valueOf();

describe('Community role and moderation use cases', () => {
  let moderationLog: { createdAt: number; mutation: unknown };
  let signedOperation: {
    createdAt: number;
    mutation: unknown;
    parents: string[];
  };
  let community: Community;
  let communityFinder: MockProxy<CommunityFinder>;
  let communityRepository: MockProxy<CommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;

  const expectSaved = (
    message: { operation: { proof: unknown } },
    action: CommunityOperationAction,
    args: Record<string, unknown>,
  ): void => {
    expect(communityRepository.save).toHaveBeenCalledTimes(1);

    const [saved, proof] = communityRepository.save.mock.calls[0];

    expect(saved).toBeInstanceOf(CommunityOperation);
    expect(saved.getAction().valueOf()).toBe(action.valueOf());
    expect(saved.getArguments()).toEqual(args);
    expect(proof).toBe(message.operation.proof);
  };

  const expectRejected = (): void => {
    expect(communityRepository.save).not.toHaveBeenCalled();
    expect(moderationLogRecorder.record).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  };

  beforeAll(async () => {
    moderationLog = {
      createdAt: MODERATION_LOG_CREATED_AT,
      mutation: (
        await signedMutation({
          identityId: OWNER_ID,
          kind: 'put',
          recordId: 'log-1',
          sequence: 1,
          store: 'moderationLogs',
        })
      ).toPrimitives(),
    };
    signedOperation = {
      createdAt: OPERATION_CREATED_AT,
      mutation: (
        await signedMutation({
          identityId: OWNER_ID,
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
    const created = genesis();

    community = CommunityOperationApplier.create(created);
    CommunityOperationApplier.apply(community, join([created], alice));
    CommunityOperationApplier.apply(community, join([created], mallory));
    community.pullDomainEvents();
    communityFinder = mock<CommunityFinder>();
    communityRepository = mock<CommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    communityFinder.findById.mockResolvedValue(community);
  });

  const addRole = (createdAt: number): CommunityRoleId => {
    const roleId = CommunityRoleId.derive(COMMUNITY_ID, OWNER_ID, createdAt);

    CommunityOperationApplier.apply(
      community,
      operation(
        CommunityOperationAction.ROLE_CREATED,
        owner,
        {
          name: 'Moderators',
          permissions: ['ban_members'],
          roleId: roleId.valueOf(),
        },
        [genesis()],
        createdAt,
      ),
    );
    community.pullDomainEvents();

    return roleId;
  };

  it('creates a role from the signed operation and records the moderation action', async () => {
    const message = new CommunityRoleCreateMessage(
      COMMUNITY_ID,
      OWNER_ID,
      'Moderators',
      ['ban_members'],
      moderationLog,
      signedOperation,
    );
    const roleId = CommunityRoleId.derive(
      COMMUNITY_ID,
      OWNER_ID,
      OPERATION_CREATED_AT,
    );

    const role = await new CommunityRoleCreator(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).create(message);

    expect(role.toPrimitives()).toMatchObject({
      id: roleId.valueOf(),
      name: 'Moderators',
      permissions: ['ban_members'],
    });
    expectSaved(message, CommunityOperationAction.ROLE_CREATED, {
      name: 'Moderators',
      permissions: ['ban_members'],
      roleId: roleId.valueOf(),
    });
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_CREATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      { name: 'Moderators', permissions: ['ban_members'] },
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects role creation by a member without permission', async () => {
    const message = new CommunityRoleCreateMessage(
      COMMUNITY_ID,
      MALLORY_ID,
      'Moderators',
      ['ban_members'],
      moderationLog,
      signedOperation,
    );

    await expect(
      new CommunityRoleCreator(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).create(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });

  it('updates a role from the signed operation and records the moderation action', async () => {
    const roleId = addRole(5);
    const message = new CommunityRoleUpdateMessage(
      COMMUNITY_ID,
      roleId.valueOf(),
      OWNER_ID,
      'Admins',
      ['ban_members', 'manage_roles'],
      moderationLog,
      signedOperation,
    );

    const result = await new CommunityRoleUpdater(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).update(message);

    expect(result).toBe(community);
    expect(community.getRole(roleId).toPrimitives()).toMatchObject({
      name: 'Admins',
      permissions: ['ban_members', 'manage_roles'],
    });
    expectSaved(message, CommunityOperationAction.ROLE_UPDATED, {
      name: 'Admins',
      permissions: ['ban_members', 'manage_roles'],
      roleId: roleId.valueOf(),
    });
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_UPDATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      { name: 'Admins', permissions: ['ban_members', 'manage_roles'] },
    );
  });

  it('rejects a role update by a member without permission', async () => {
    const roleId = addRole(5);
    const message = new CommunityRoleUpdateMessage(
      COMMUNITY_ID,
      roleId.valueOf(),
      MALLORY_ID,
      'Admins',
      ['manage_roles'],
      moderationLog,
      signedOperation,
    );

    await expect(
      new CommunityRoleUpdater(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).update(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });

  it('deletes a role from the signed operation and records the moderation action', async () => {
    const roleId = addRole(5);
    const message = new CommunityRoleDeleteMessage(
      COMMUNITY_ID,
      roleId.valueOf(),
      OWNER_ID,
      moderationLog,
      signedOperation,
    );

    const result = await new CommunityRoleDeleter(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).delete(message);

    expect(result).toBe(community);
    expect(() => community.getRole(roleId)).toThrow();
    expectSaved(message, CommunityOperationAction.ROLE_DELETED, {
      roleId: roleId.valueOf(),
    });
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.ROLE_DELETED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
    );
  });

  it('rejects a role deletion by a member without permission', async () => {
    const roleId = addRole(5);
    const message = new CommunityRoleDeleteMessage(
      COMMUNITY_ID,
      roleId.valueOf(),
      MALLORY_ID,
      moderationLog,
      signedOperation,
    );

    await expect(
      new CommunityRoleDeleter(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).delete(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });

  it('assigns member roles from the signed operation and records the moderation action', async () => {
    const roleId = addRole(5);
    const message = new CommunityMemberRolesAssignMessage(
      COMMUNITY_ID,
      OWNER_ID,
      ALICE_ID,
      [roleId.valueOf()],
      moderationLog,
      signedOperation,
    );

    const result = await new CommunityMemberRolesAssigner(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).assign(message);

    expect(result).toBe(community);
    expectSaved(message, CommunityOperationAction.MEMBER_ROLES_UPDATED, {
      identityId: ALICE_ID,
      roleIds: [roleId.valueOf()],
    });
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_ROLES_UPDATED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      { roleIds: [roleId.valueOf()] },
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects role assignment by a member without permission', async () => {
    const roleId = addRole(5);
    const message = new CommunityMemberRolesAssignMessage(
      COMMUNITY_ID,
      MALLORY_ID,
      ALICE_ID,
      [roleId.valueOf()],
      moderationLog,
      signedOperation,
    );

    await expect(
      new CommunityMemberRolesAssigner(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).assign(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });

  it('bans a member and keeps the reason in the moderation log', async () => {
    const message = new CommunityMemberBanMessage(
      COMMUNITY_ID,
      OWNER_ID,
      ALICE_ID,
      moderationLog,
      signedOperation,
      'spam',
    );

    const result = await new CommunityMemberBanner(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).ban(message);

    expect(result).toBe(community);
    expect(community.isMember(alice)).toBe(false);
    expectSaved(message, CommunityOperationAction.MEMBER_BANNED, {
      identityId: ALICE_ID,
    });
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_BANNED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
      { reason: 'spam' },
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects a ban by a member without permission', async () => {
    const message = new CommunityMemberBanMessage(
      COMMUNITY_ID,
      MALLORY_ID,
      ALICE_ID,
      moderationLog,
      signedOperation,
    );

    await expect(
      new CommunityMemberBanner(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).ban(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });

  it('unbans a member and records the moderation action', async () => {
    CommunityOperationApplier.apply(community, ban([genesis()], alice));
    community.pullDomainEvents();

    const message = new CommunityMemberUnbanMessage(
      COMMUNITY_ID,
      OWNER_ID,
      ALICE_ID,
      moderationLog,
      signedOperation,
    );

    const result = await new CommunityMemberUnbanner(
      communityFinder,
      communityRepository,
      eventPublisher,
      moderationLogRecorder,
    ).unban(message);

    expect(result).toBe(community);
    expectSaved(message, CommunityOperationAction.MEMBER_UNBANNED, {
      identityId: ALICE_ID,
    });
    expect(moderationLogRecorder.record).toHaveBeenCalledWith(
      community,
      message.actorIdentityId,
      CommunityModerationAction.MEMBER_UNBANNED,
      expect.any(CommunityModerationTarget),
      message.moderationLog,
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects an unban by a member without permission', async () => {
    CommunityOperationApplier.apply(community, ban([genesis()], alice));

    const message = new CommunityMemberUnbanMessage(
      COMMUNITY_ID,
      MALLORY_ID,
      ALICE_ID,
      moderationLog,
      signedOperation,
    );

    await expect(
      new CommunityMemberUnbanner(
        communityFinder,
        communityRepository,
        eventPublisher,
        moderationLogRecorder,
      ).unban(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });

  it('kicks a member from the signed operation', async () => {
    const message = new CommunityMemberKickMessage(
      COMMUNITY_ID,
      OWNER_ID,
      ALICE_ID,
      signedOperation,
    );

    const result = await new CommunityMemberKicker(
      communityFinder,
      communityRepository,
      eventPublisher,
    ).kick(message);

    expect(result).toBe(community);
    expect(community.isMember(alice)).toBe(false);
    expectSaved(message, CommunityOperationAction.MEMBER_KICKED, {
      identityId: ALICE_ID,
    });
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects a kick by a member without permission', async () => {
    const message = new CommunityMemberKickMessage(
      COMMUNITY_ID,
      MALLORY_ID,
      ALICE_ID,
      signedOperation,
    );

    await expect(
      new CommunityMemberKicker(
        communityFinder,
        communityRepository,
        eventPublisher,
      ).kick(message),
    ).rejects.toThrow(CommunityPermissionDeniedError);
    expectRejected();
  });
});
