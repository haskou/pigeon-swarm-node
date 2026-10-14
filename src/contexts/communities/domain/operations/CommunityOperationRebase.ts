import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../Community';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityOperationAction } from '../value-objects/CommunityOperationAction';
import { CommunityRoleId } from '../value-objects/CommunityRoleId';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationArgumentReader } from './CommunityOperationArgumentReader';
import { CommunityOperationArguments } from './CommunityOperationArguments';
import { CommunityOperationRebaseTarget } from './CommunityOperationRebaseTarget';
import { CommunityOperationSnapshot } from './CommunityOperationSnapshot';

/**
 * Some operations carry a whole value built on the state their author saw: a
 * profile, the roles of one member, the roles that see a channel, a role.
 * Applied as they are after a concurrent operation, they would silently undo
 * it. Such an operation is rebased instead: it changes only what its author
 * changed relative to the state of its parents (`base`), and keeps whatever
 * the state it applies to (`current`) changed meanwhile.
 *
 * - A single value is the intended one when the author changed it, otherwise
 *   the current one.
 * - A set keeps the current entries, minus the ones the author removed, plus
 *   the ones the author added.
 */
export class CommunityOperationRebase {
  private static readonly TARGETS: Record<
    string,
    (args: CommunityOperationArguments) => CommunityOperationRebaseTarget
  > = {
    [CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED.valueOf()]: (args) =>
      CommunityOperationRebase.channelPermissions(args),
    [CommunityOperationAction.COMMUNITY_UPDATED.valueOf()]: (args) =>
      CommunityOperationRebase.profile(args),
    [CommunityOperationAction.MEMBER_ROLES_UPDATED.valueOf()]: (args) =>
      CommunityOperationRebase.memberRoles(args),
    [CommunityOperationAction.ROLE_UPDATED.valueOf()]: (args) =>
      CommunityOperationRebase.role(args),
  };

  private static profile(
    args: CommunityOperationArguments,
  ): CommunityOperationRebaseTarget {
    const reader = new CommunityOperationArgumentReader(
      args,
      ['description', 'name'],
      ['autoJoinEnabled', 'avatar', 'banner', 'discoverable'],
    );
    const autoJoinEnabled = reader.optionalBoolean('autoJoinEnabled');
    const discoverable = reader.optionalBoolean('discoverable');

    return {
      intended: {
        autoJoinEnabled,
        avatar: reader.optionalString('avatar'),
        banner: reader.optionalString('banner'),
        description: reader.string('description'),
        discoverable,
        name: reader.string('name'),
      },
      of: (community) => {
        const primitives = community.toPrimitives();

        // An omitted setting stays as it is, so it never takes part.
        return {
          autoJoinEnabled:
            autoJoinEnabled === undefined
              ? undefined
              : primitives.autoJoinEnabled,
          avatar: primitives.avatar,
          banner: primitives.banner,
          description: primitives.description,
          discoverable:
            discoverable === undefined ? undefined : primitives.discoverable,
          name: primitives.name,
        };
      },
    };
  }

  private static memberRoles(
    args: CommunityOperationArguments,
  ): CommunityOperationRebaseTarget {
    const reader = new CommunityOperationArgumentReader(args, [
      'identityId',
      'roleIds',
    ]);
    const identityId = reader.string('identityId');
    const member = new IdentityId(identityId);

    return {
      intended: { identityId, roleIds: reader.stringArray('roleIds') },
      of: (community) =>
        community.isMember(member)
          ? {
              identityId,
              roleIds:
                community
                  .toPrimitives()
                  .memberRoles.find(
                    (assignment) => assignment.identityId === member.valueOf(),
                  )?.roleIds ?? [],
            }
          : undefined,
    };
  }

  private static channelPermissions(
    args: CommunityOperationArguments,
  ): CommunityOperationRebaseTarget {
    const reader = new CommunityOperationArgumentReader(args, [
      'channelId',
      'visibleRoleIds',
    ]);
    const channelId = reader.string('channelId');
    const id = new CommunityChannelId(channelId).valueOf();

    return {
      intended: {
        channelId,
        visibleRoleIds: reader.stringArray('visibleRoleIds'),
      },
      of: (community) => {
        const { textChannels, voiceChannels } = community.toPrimitives();
        const channel = [...textChannels, ...voiceChannels].find(
          (candidate) => candidate.id === id,
        );

        return channel
          ? { channelId, visibleRoleIds: channel.permissions.visibleRoleIds }
          : undefined;
      },
    };
  }

  private static role(
    args: CommunityOperationArguments,
  ): CommunityOperationRebaseTarget {
    const reader = new CommunityOperationArgumentReader(args, [
      'name',
      'permissions',
      'roleId',
    ]);
    const roleId = reader.string('roleId');
    const id = new CommunityRoleId(roleId).valueOf();

    return {
      intended: {
        name: reader.string('name'),
        permissions: reader.stringArray('permissions'),
        roleId,
      },
      of: (community) => {
        const role = community
          .toPrimitives()
          .roles.find((candidate) => candidate.id === id);

        return role
          ? { name: role.name, permissions: role.permissions, roleId }
          : undefined;
      },
    };
  }

  /** The intended entries first, in their order, then the kept current ones. */
  private static mergeSet(
    intended: string[],
    base: string[],
    current: string[],
  ): string[] {
    const removed = base.filter((entry) => !intended.includes(entry));
    const kept = current.filter((entry) => !removed.includes(entry));

    return [
      ...intended.filter(
        (entry) => !base.includes(entry) || kept.includes(entry),
      ),
      ...kept.filter((entry) => !intended.includes(entry)),
    ];
  }

  private static mergeValue(
    intended: CommunityOperationSnapshot[string],
    base: CommunityOperationSnapshot[string],
    current: CommunityOperationSnapshot[string],
  ): CommunityOperationSnapshot[string] {
    if (
      Array.isArray(intended) &&
      Array.isArray(base) &&
      Array.isArray(current)
    ) {
      return CommunityOperationRebase.mergeSet(intended, base, current);
    }

    return intended === base ? current : intended;
  }

  /** Whether the operation carries a whole value that has to be rebased. */
  public static rebases(operation: CommunityOperation): boolean {
    return Object.hasOwn(
      CommunityOperationRebase.TARGETS,
      operation.getAction().valueOf(),
    );
  }

  /**
   * The arguments `operation` means for `current`, given that its author
   * built it on `base`. Unchanged when the action carries no whole value or
   * either state lacks what it targets: the aggregate then decides on the
   * arguments as they were signed.
   */
  public static argumentsOf(
    operation: CommunityOperation,
    base: Community,
    current: Community,
  ): CommunityOperationArguments {
    if (!CommunityOperationRebase.rebases(operation))
      return operation.getArguments();

    const target = CommunityOperationRebase.TARGETS[
      operation.getAction().valueOf()
    ](operation.getArguments());
    const before = target.of(base);
    const now = target.of(current);

    if (!before || !now) return operation.getArguments();

    return Object.fromEntries(
      Object.entries(target.intended)
        .map(([key, value]): [string, CommunityOperationSnapshot[string]] => [
          key,
          CommunityOperationRebase.mergeValue(value, before[key], now[key]),
        ])
        .filter(([, value]) => value !== undefined),
    );
  }
}
