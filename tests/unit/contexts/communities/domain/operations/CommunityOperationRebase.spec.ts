import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import {
  alice,
  communityId,
  genesis,
  join,
  mallory,
  operation,
  owner,
} from './CommunityOperationFixtures';

const helper = CommunityRoleId.derive(
  communityId.valueOf(),
  owner.valueOf(),
  3,
).valueOf();
const reviewer = CommunityRoleId.derive(
  communityId.valueOf(),
  owner.valueOf(),
  4,
).valueOf();
const channelId = CommunityChannelId.derive(
  communityId.valueOf(),
  owner.valueOf(),
  5,
).valueOf();

/** Genesis, alice and mallory joined, then the helper and reviewer roles. */
function rolesHistory(): CommunityOperation[] {
  const created = genesis();
  const joinedAlice = join([created], alice);
  const joinedMallory = join([joinedAlice], mallory);
  const helperRole = operation(
    CommunityOperationAction.ROLE_CREATED,
    owner,
    { name: 'helper', permissions: ['send_messages'], roleId: helper },
    [joinedMallory],
    3,
  );
  const reviewerRole = operation(
    CommunityOperationAction.ROLE_CREATED,
    owner,
    { name: 'reviewer', permissions: ['embed_links'], roleId: reviewer },
    [helperRole],
    4,
  );

  return [created, joinedAlice, joinedMallory, helperRole, reviewerRole];
}

function assignment(
  author: IdentityId,
  member: IdentityId,
  roleIds: string[],
  parents: CommunityOperation[],
  createdAt = 10,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_ROLES_UPDATED,
    author,
    { identityId: member.valueOf(), roleIds },
    parents,
    createdAt,
  );
}

/**
 * Signs `build` again until its digest sorts after `other` (`last`) or
 * before it, so both concurrent operations get applied last once.
 */
function sortedAgainst(
  build: (createdAt: number) => CommunityOperation,
  other: CommunityOperation,
  last: boolean,
): CommunityOperation {
  for (let createdAt = 11; ; createdAt++) {
    const candidate = build(createdAt);

    if (candidate.getHash() > other.getHash() === last) return candidate;
  }
}

function rolesOf(operations: CommunityOperation[], member: IdentityId) {
  return (
    CommunityStateFold.fold(operations)
      .community?.toPrimitives()
      .memberRoles.find(
        (candidate) => candidate.identityId === member.valueOf(),
      )
      ?.roleIds.sort() ?? []
  );
}

describe('CommunityOperationRebase', () => {
  const orders = [
    ['the second applied last', true],
    ['the second applied first', false],
  ] as const;

  it.each(orders)('keeps both concurrent profile fields with %s', (_, last) => {
    const created = genesis();
    const renamed = operation(
      CommunityOperationAction.COMMUNITY_UPDATED,
      owner,
      { description: 'A community', name: 'Renamed' },
      [created],
      10,
    );
    const described = sortedAgainst(
      (createdAt) =>
        operation(
          CommunityOperationAction.COMMUNITY_UPDATED,
          owner,
          { description: 'Described', name: 'Community' },
          [created],
          createdAt,
        ),
      renamed,
      last,
    );

    const community = CommunityStateFold.fold([
      described,
      renamed,
      created,
    ]).community?.toPrimitives();

    expect(community?.name).toBe('Renamed');
    expect(community?.description).toBe('Described');
  });

  it.each(orders)(
    'keeps both concurrent role grants to one member with %s',
    (_, last) => {
      const history = rolesHistory();
      const tip = history.at(-1) as CommunityOperation;
      const grantHelper = assignment(owner, alice, [helper], [tip]);
      const grantReviewer = sortedAgainst(
        (createdAt) => assignment(owner, alice, [reviewer], [tip], createdAt),
        grantHelper,
        last,
      );

      expect(rolesOf([...history, grantHelper, grantReviewer], alice)).toEqual(
        [helper, reviewer].sort(),
      );
    },
  );

  it.each(orders)(
    'keeps a revocation and a concurrent grant of another role with %s',
    (_, last) => {
      const history = rolesHistory();
      const tip = history.at(-1) as CommunityOperation;
      const granted = assignment(owner, alice, [helper], [tip]);
      const revoked = assignment(owner, alice, [], [granted]);
      const extended = sortedAgainst(
        (createdAt) =>
          assignment(owner, alice, [helper, reviewer], [granted], createdAt),
        revoked,
        last,
      );

      expect(rolesOf([...history, granted, revoked, extended], alice)).toEqual([
        reviewer,
      ]);
    },
  );

  it.each(orders)(
    'keeps both roles concurrently allowed to see one channel with %s',
    (_, last) => {
      const history = rolesHistory();
      const channel = operation(
        CommunityOperationAction.CHANNEL_CREATED,
        owner,
        { channelId, name: 'general', type: 'text' },
        [history.at(-1) as CommunityOperation],
        5,
      );
      const visibility = (roleId: string, createdAt: number) =>
        operation(
          CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED,
          owner,
          { channelId, visibleRoleIds: [roleId] },
          [channel],
          createdAt,
        );
      const helpers = visibility(helper, 10);
      const reviewers = sortedAgainst(
        (createdAt) => visibility(reviewer, createdAt),
        helpers,
        last,
      );

      const textChannel = CommunityStateFold.fold([
        ...history,
        channel,
        helpers,
        reviewers,
      ]).community?.toPrimitives().textChannels[0];

      expect(textChannel?.permissions.visibleRoleIds.sort()).toEqual(
        [helper, reviewer].sort(),
      );
    },
  );

  it.each(orders)(
    'never opens a channel to everyone when two concurrent restrictions empty it with %s',
    (_, last) => {
      const history = rolesHistory();
      const channel = operation(
        CommunityOperationAction.CHANNEL_CREATED,
        owner,
        { channelId, name: 'general', type: 'text' },
        [history.at(-1) as CommunityOperation],
        5,
      );
      const visibility = (
        visibleRoleIds: string[],
        parents: CommunityOperation[],
        createdAt: number,
      ) =>
        operation(
          CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED,
          owner,
          { channelId, visibleRoleIds },
          parents,
          createdAt,
        );
      const both = visibility([helper, reviewer], [channel], 6);
      const helpersOnly = visibility([helper], [both], 10);
      const reviewersOnly = sortedAgainst(
        (createdAt) => visibility([reviewer], [both], createdAt),
        helpersOnly,
        last,
      );

      const textChannel = CommunityStateFold.fold([
        ...history,
        channel,
        both,
        helpersOnly,
        reviewersOnly,
      ]).community?.toPrimitives().textChannels[0];

      expect(textChannel?.permissions.visibleRoleIds).toEqual(
        last ? [reviewer] : [helper],
      );
    },
  );

  it.each(orders)(
    'keeps a role rename and a concurrent permission change with %s',
    (_, last) => {
      const history = rolesHistory();
      const tip = history.at(-1) as CommunityOperation;
      const renamed = operation(
        CommunityOperationAction.ROLE_UPDATED,
        owner,
        { name: 'guide', permissions: ['send_messages'], roleId: helper },
        [tip],
        10,
      );
      const widened = sortedAgainst(
        (createdAt) =>
          operation(
            CommunityOperationAction.ROLE_UPDATED,
            owner,
            {
              name: 'helper',
              permissions: ['send_messages', 'attach_files'],
              roleId: helper,
            },
            [tip],
            createdAt,
          ),
        renamed,
        last,
      );

      const role = CommunityStateFold.fold([...history, renamed, widened])
        .community?.toPrimitives()
        .roles.find((candidate) => candidate.id === helper);

      expect(role?.name).toBe('guide');
      expect(role?.permissions.sort()).toEqual(
        ['attach_files', 'send_messages'].sort(),
      );
    },
  );

  it('still authorizes a rebased operation against the state it applies to', () => {
    const created = genesis();
    const joinedAlice = join([created], alice);
    const joinedMallory = join([joinedAlice], mallory);
    const admin = CommunityRoleId.derive(
      communityId.valueOf(),
      owner.valueOf(),
      3,
    ).valueOf();
    const adminRole = operation(
      CommunityOperationAction.ROLE_CREATED,
      owner,
      { name: 'admin', permissions: ['manage_roles'], roleId: admin },
      [joinedMallory],
      3,
    );
    const promoted = assignment(owner, alice, [admin], [adminRole]);
    const demoted = assignment(owner, alice, [], [promoted]);
    const aliceGrants = sortedAgainst(
      (createdAt) => assignment(alice, mallory, [admin], [promoted], createdAt),
      demoted,
      true,
    );
    const operations = [
      created,
      joinedAlice,
      joinedMallory,
      adminRole,
      promoted,
      demoted,
      aliceGrants,
    ];

    expect(CommunityStateFold.fold(operations).skipped).toEqual([
      aliceGrants.getHash(),
    ]);
    expect(rolesOf(operations, mallory)).toEqual([]);
  });

  it('applies a whole value built on the state it applies to as signed', () => {
    const history = rolesHistory();
    const tip = history.at(-1) as CommunityOperation;
    const granted = assignment(owner, alice, [helper, reviewer], [tip]);
    const narrowed = assignment(owner, alice, [reviewer], [granted]);

    expect(rolesOf([...history, granted, narrowed], alice)).toEqual([reviewer]);
  });
});
