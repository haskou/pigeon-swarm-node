import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { Community } from '../Community';
import { CommunityChannelPermissions } from '../entities/channels/CommunityChannelPermissions';
import { CommunityInvitation } from '../entities/invitations/CommunityInvitation';
import { CommunityProfile } from '../entities/profile/CommunityProfile';
import { CommunitySettings } from '../entities/profile/CommunitySettings';
import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityAvatar } from '../value-objects/CommunityAvatar';
import { CommunityBanner } from '../value-objects/CommunityBanner';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityChannelName } from '../value-objects/CommunityChannelName';
import { CommunityDescription } from '../value-objects/CommunityDescription';
import { CommunityJoinMethod } from '../value-objects/CommunityJoinMethod';
import { CommunityName } from '../value-objects/CommunityName';
import { CommunityOperationAction } from '../value-objects/CommunityOperationAction';
import { CommunityPermission } from '../value-objects/CommunityPermission';
import { CommunityRoleId } from '../value-objects/CommunityRoleId';
import { CommunityRoleName } from '../value-objects/CommunityRoleName';
import { CommunityVisibility } from '../value-objects/CommunityVisibility';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationArgumentReader } from './CommunityOperationArgumentReader';
import { CommunityOperationArguments } from './CommunityOperationArguments';
import { CommunityOperationRebase } from './CommunityOperationRebase';

/**
 * Turns one operation into a state change of the community aggregate. The
 * aggregate decides whether the author is allowed to perform it, so a signed
 * operation never carries authority on its own: it only wins when the
 * community state it applies to grants the permission.
 *
 * Arguments per action (every key is required unless marked optional):
 * - community_created: nonce, name, description, visibility, discoverable,
 *   autoJoinEnabled, avatar?, banner?
 * - community_updated: name, description, avatar?, banner?, discoverable?,
 *   autoJoinEnabled?
 * - channel_created: channelId, name, type ('text' | 'voice'); channelId is
 *   derived from the community, the author and the operation createdAt
 * - channel_renamed: channelId, name
 * - channel_deleted: channelId
 * - channel_permissions_updated: channelId, visibleRoleIds
 * - role_created: roleId, name, permissions; roleId is derived like channelId
 * - role_updated: roleId, name, permissions
 * - role_deleted: roleId
 * - member_roles_updated: identityId, roleIds
 * - member_banned, member_unbanned, member_kicked, member_left: identityId
 * - member_joined: identityId, method, and per method: reference (only for
 *   `approval`: the id of the accepted membership request); invitationId,
 *   possession, consent (only for `invitation`: see `CommunityInvitation`)
 * - invitation_created: invitationKey, maxUses, expiresAt, invitee?
 * - invitation_revoked: invitationId
 *
 * Every identity id, the author's included, must be canonical
 * (`IdentityId.isCanonicalKey`), so equal ids always mean equal keys.
 *
 * The rules of an invitation that are facts of the causal past (liveness,
 * proofs, window, uses) are not checked here but by `CommunityStateFold`
 * against the state of that past, so they never depend on the linear state.
 */
export class CommunityOperationApplier {
  private static readonly HANDLERS: Record<
    string,
    (
      community: Community,
      operation: CommunityOperation,
      args: CommunityOperationArguments,
    ) => void
  > = {
    [CommunityOperationAction.CHANNEL_CREATED.valueOf()]: (community, op) =>
      CommunityOperationApplier.createChannel(community, op),
    [CommunityOperationAction.CHANNEL_DELETED.valueOf()]: (community, op) =>
      CommunityOperationApplier.deleteChannel(community, op),
    [CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED.valueOf()]: (
      community,
      op,
      args,
    ) =>
      CommunityOperationApplier.updateChannelPermissions(community, op, args),
    [CommunityOperationAction.CHANNEL_RENAMED.valueOf()]: (community, op) =>
      CommunityOperationApplier.renameChannel(community, op),
    [CommunityOperationAction.COMMUNITY_UPDATED.valueOf()]: (
      community,
      op,
      args,
    ) => CommunityOperationApplier.updateProfile(community, op, args),
    [CommunityOperationAction.INVITATION_CREATED.valueOf()]: (
      community,
      op,
    ) => {
      CommunityInvitation.fromOperation(op);
      community.assertCanCreateInvite(op.getAuthorIdentityId());
    },
    // A revoker needs its authority at the revocation's parents only.
    [CommunityOperationAction.INVITATION_REVOKED.valueOf()]: (_, op) =>
      CommunityOperationApplier.invitationIdOf(op, ['invitationId']),
    [CommunityOperationAction.MEMBER_BANNED.valueOf()]: (community, op) =>
      community.banMember(
        op.getAuthorIdentityId(),
        CommunityOperationApplier.member(op),
      ),
    [CommunityOperationAction.MEMBER_JOINED.valueOf()]: (community, op) =>
      CommunityOperationApplier.join(community, op),
    [CommunityOperationAction.MEMBER_KICKED.valueOf()]: (community, op) =>
      community.kickMember(
        op.getAuthorIdentityId(),
        CommunityOperationApplier.member(op),
      ),
    [CommunityOperationAction.MEMBER_LEFT.valueOf()]: (community, op) =>
      CommunityOperationApplier.leave(community, op),
    [CommunityOperationAction.MEMBER_ROLES_UPDATED.valueOf()]: (
      community,
      op,
      args,
    ) => CommunityOperationApplier.assignRoles(community, op, args),
    [CommunityOperationAction.MEMBER_UNBANNED.valueOf()]: (community, op) =>
      community.unbanMember(
        op.getAuthorIdentityId(),
        CommunityOperationApplier.member(op),
      ),
    [CommunityOperationAction.ROLE_CREATED.valueOf()]: (community, op) =>
      CommunityOperationApplier.createRole(community, op),
    [CommunityOperationAction.ROLE_DELETED.valueOf()]: (community, op) =>
      CommunityOperationApplier.deleteRole(community, op),
    [CommunityOperationAction.ROLE_UPDATED.valueOf()]: (community, op, args) =>
      CommunityOperationApplier.updateRole(community, op, args),
  };

  private static readonly JOIN_ARGUMENTS: Record<string, string[]> = {
    [CommunityJoinMethod.ADDED.valueOf()]: ['identityId', 'method'],
    [CommunityJoinMethod.APPROVAL.valueOf()]: [
      'identityId',
      'method',
      'reference',
    ],
    [CommunityJoinMethod.AUTOMATIC.valueOf()]: ['identityId', 'method'],
    [CommunityJoinMethod.INVITATION.valueOf()]: [
      'consent',
      'identityId',
      'invitationId',
      'method',
      'possession',
    ],
  };

  /** An identity argument; refused unless canonical. */
  private static identity(value: string): IdentityId {
    const identityId = new IdentityId(value);

    assert(identityId.isCanonicalKey(), new InvalidCommunityOperationError());

    return identityId;
  }

  private static member(operation: CommunityOperation): IdentityId {
    return CommunityOperationApplier.identity(
      new CommunityOperationArgumentReader(operation.getArguments(), [
        'identityId',
      ]).string('identityId'),
    );
  }

  /**
   * The `invitationId` of an operation whose arguments are exactly `keys`:
   * the digest of an `invitation_created`.
   */
  private static invitationIdOf(
    operation: CommunityOperation,
    keys: string[],
  ): string {
    const invitationId = new CommunityOperationArgumentReader(
      operation.getArguments(),
      keys,
    ).string('invitationId');

    assert(
      CommunityOperation.DIGEST.test(invitationId),
      new InvalidCommunityOperationError(),
    );

    return invitationId;
  }

  private static updateProfile(
    community: Community,
    operation: CommunityOperation,
    args: CommunityOperationArguments,
  ): void {
    const reader = new CommunityOperationArgumentReader(
      args,
      ['description', 'name'],
      ['autoJoinEnabled', 'avatar', 'banner', 'discoverable'],
    );
    const avatar = reader.optionalString('avatar');
    const banner = reader.optionalString('banner');

    community.updateProfile(
      operation.getAuthorIdentityId(),
      new CommunityName(reader.string('name')),
      new CommunityDescription(reader.string('description')),
      avatar === undefined ? undefined : new CommunityAvatar(avatar),
      banner === undefined ? undefined : new CommunityBanner(banner),
      reader.optionalBoolean('discoverable'),
      reader.optionalBoolean('autoJoinEnabled'),
    );
  }

  private static createChannel(
    community: Community,
    operation: CommunityOperation,
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['channelId', 'name', 'type'],
    );
    const author = operation.getAuthorIdentityId();
    const channelId = new CommunityChannelId(reader.string('channelId'));
    const name = new CommunityChannelName(reader.string('name'));
    const createdAt = new Timestamp(operation.getCreatedAt());

    assert(
      channelId.isEqual(
        CommunityChannelId.derive(
          community.getId().valueOf(),
          author.valueOf(),
          operation.getCreatedAt(),
        ),
      ),
      new InvalidCommunityOperationError(),
    );

    if (reader.string('type') === 'text') {
      community.addTextChannel(author, name, channelId, createdAt);
    } else if (reader.string('type') === 'voice') {
      community.addVoiceChannel(author, name, channelId, createdAt);
    } else {
      throw new InvalidCommunityOperationError();
    }
  }

  private static renameChannel(
    community: Community,
    operation: CommunityOperation,
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['channelId', 'name'],
    );

    community.renameChannel(
      operation.getAuthorIdentityId(),
      new CommunityChannelId(reader.string('channelId')),
      new CommunityChannelName(reader.string('name')),
    );
  }

  private static deleteChannel(
    community: Community,
    operation: CommunityOperation,
  ): void {
    community.deleteChannel(
      operation.getAuthorIdentityId(),
      new CommunityChannelId(
        new CommunityOperationArgumentReader(operation.getArguments(), [
          'channelId',
        ]).string('channelId'),
      ),
    );
  }

  private static updateChannelPermissions(
    community: Community,
    operation: CommunityOperation,
    args: CommunityOperationArguments,
  ): void {
    const reader = new CommunityOperationArgumentReader(args, [
      'channelId',
      'visibleRoleIds',
    ]);

    community.updateChannelPermissions(
      operation.getAuthorIdentityId(),
      new CommunityChannelId(reader.string('channelId')),
      new CommunityChannelPermissions(
        reader
          .stringArray('visibleRoleIds')
          .map((roleId) => new CommunityRoleId(roleId)),
      ),
    );
  }

  private static createRole(
    community: Community,
    operation: CommunityOperation,
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['name', 'permissions', 'roleId'],
    );
    const author = operation.getAuthorIdentityId();
    const roleId = new CommunityRoleId(reader.string('roleId'));

    assert(
      roleId.isEqual(
        CommunityRoleId.derive(
          community.getId().valueOf(),
          author.valueOf(),
          operation.getCreatedAt(),
        ),
      ),
      new InvalidCommunityOperationError(),
    );

    community.addRole(
      author,
      new CommunityRoleName(reader.string('name')),
      reader
        .stringArray('permissions')
        .map((permission) => new CommunityPermission(permission)),
      roleId,
    );
  }

  private static updateRole(
    community: Community,
    operation: CommunityOperation,
    args: CommunityOperationArguments,
  ): void {
    const reader = new CommunityOperationArgumentReader(args, [
      'name',
      'permissions',
      'roleId',
    ]);

    community.updateRole(
      operation.getAuthorIdentityId(),
      new CommunityRoleId(reader.string('roleId')),
      new CommunityRoleName(reader.string('name')),
      reader
        .stringArray('permissions')
        .map((permission) => new CommunityPermission(permission)),
    );
  }

  private static deleteRole(
    community: Community,
    operation: CommunityOperation,
  ): void {
    community.deleteRole(
      operation.getAuthorIdentityId(),
      new CommunityRoleId(
        new CommunityOperationArgumentReader(operation.getArguments(), [
          'roleId',
        ]).string('roleId'),
      ),
    );
  }

  private static assignRoles(
    community: Community,
    operation: CommunityOperation,
    args: CommunityOperationArguments,
  ): void {
    const reader = new CommunityOperationArgumentReader(args, [
      'identityId',
      'roleIds',
    ]);

    community.assignRoles(
      operation.getAuthorIdentityId(),
      CommunityOperationApplier.identity(reader.string('identityId')),
      reader
        .stringArray('roleIds')
        .map((roleId) => new CommunityRoleId(roleId)),
    );
  }

  private static leave(
    community: Community,
    operation: CommunityOperation,
  ): void {
    const author = operation.getAuthorIdentityId();

    assert(
      author.isEqual(CommunityOperationApplier.member(operation)),
      new InvalidCommunityOperationError(),
    );
    community.leave(author);
  }

  private static join(
    community: Community,
    operation: CommunityOperation,
  ): void {
    const args = operation.getArguments();
    const method =
      typeof args.method === 'string' &&
      Object.hasOwn(CommunityOperationApplier.JOIN_ARGUMENTS, args.method)
        ? new CommunityJoinMethod(args.method)
        : undefined;

    assert(method, new InvalidCommunityOperationError());

    const keys = CommunityOperationApplier.JOIN_ARGUMENTS[method.valueOf()];
    const reader = new CommunityOperationArgumentReader(args, keys);

    if (method.isEqual(CommunityJoinMethod.INVITATION)) {
      CommunityOperationApplier.invitationIdOf(operation, keys);
      reader.string('possession');
      reader.string('consent');
    } else if (method.requiresReference()) {
      reader.string('reference');
    }

    community.joinAs(
      operation.getAuthorIdentityId(),
      CommunityOperationApplier.identity(reader.string('identityId')),
      method,
    );
  }

  /** Builds the community a genesis operation creates. */
  public static create(operation: CommunityOperation): Community {
    assert(
      operation.isGenesis() && operation.getAuthorIdentityId().isCanonicalKey(),
      new InvalidCommunityOperationError(),
    );

    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      [
        'autoJoinEnabled',
        'description',
        'discoverable',
        'name',
        'nonce',
        'visibility',
      ],
      ['avatar', 'banner'],
    );
    const avatar = reader.optionalString('avatar');
    const banner = reader.optionalString('banner');

    return Community.create(
      operation.getAuthorIdentityId(),
      operation.getNetworkId(),
      new CommunityProfile(
        new CommunityName(reader.string('name')),
        new CommunityDescription(reader.string('description')),
        avatar === undefined ? undefined : new CommunityAvatar(avatar),
        banner === undefined ? undefined : new CommunityBanner(banner),
      ),
      CommunitySettings.create(
        reader.boolean('discoverable'),
        new CommunityVisibility(reader.string('visibility')),
        reader.boolean('autoJoinEnabled'),
        new Timestamp(operation.getCreatedAt()),
      ),
      operation.getCommunityId(),
    );
  }

  /**
   * Applies a non genesis operation; throws when it is not permitted. With
   * `base`, the state of its parents, the operation is rebased on `community`
   * (see `CommunityOperationRebase`) so it keeps concurrent changes.
   */
  public static apply(
    community: Community,
    operation: CommunityOperation,
    base?: Community,
  ): void {
    const handler = Object.hasOwn(
      CommunityOperationApplier.HANDLERS,
      operation.getAction().valueOf(),
    )
      ? CommunityOperationApplier.HANDLERS[operation.getAction().valueOf()]
      : undefined;

    assert(
      handler &&
        !operation.isGenesis() &&
        operation.getAuthorIdentityId().isCanonicalKey() &&
        operation.getCommunityId().isEqual(community.getId()) &&
        operation.getNetworkId().isEqual(community.getNetworkId()),
      new InvalidCommunityOperationError(),
    );

    handler(
      community,
      operation,
      base
        ? CommunityOperationRebase.argumentsOf(operation, base, community)
        : operation.getArguments(),
    );
  }
}
