import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { Community } from '../Community';
import { CommunityChannelPermissions } from '../entities/channels/CommunityChannelPermissions';
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
 * - member_joined: identityId, method, reference? (omitted only for `added`)
 */
export class CommunityOperationApplier {
  private static readonly HANDLERS: Record<
    string,
    (community: Community, operation: CommunityOperation) => void
  > = {
    [CommunityOperationAction.CHANNEL_CREATED.valueOf()]: (community, op) =>
      CommunityOperationApplier.createChannel(community, op),
    [CommunityOperationAction.CHANNEL_DELETED.valueOf()]: (community, op) =>
      CommunityOperationApplier.deleteChannel(community, op),
    [CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED.valueOf()]: (
      community,
      op,
    ) => CommunityOperationApplier.updateChannelPermissions(community, op),
    [CommunityOperationAction.CHANNEL_RENAMED.valueOf()]: (community, op) =>
      CommunityOperationApplier.renameChannel(community, op),
    [CommunityOperationAction.COMMUNITY_UPDATED.valueOf()]: (community, op) =>
      CommunityOperationApplier.updateProfile(community, op),
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
    ) => CommunityOperationApplier.assignRoles(community, op),
    [CommunityOperationAction.MEMBER_UNBANNED.valueOf()]: (community, op) =>
      community.unbanMember(
        op.getAuthorIdentityId(),
        CommunityOperationApplier.member(op),
      ),
    [CommunityOperationAction.ROLE_CREATED.valueOf()]: (community, op) =>
      CommunityOperationApplier.createRole(community, op),
    [CommunityOperationAction.ROLE_DELETED.valueOf()]: (community, op) =>
      CommunityOperationApplier.deleteRole(community, op),
    [CommunityOperationAction.ROLE_UPDATED.valueOf()]: (community, op) =>
      CommunityOperationApplier.updateRole(community, op),
  };

  private static member(operation: CommunityOperation): IdentityId {
    return new IdentityId(
      new CommunityOperationArgumentReader(operation.getArguments(), [
        'identityId',
      ]).string('identityId'),
    );
  }

  private static updateProfile(
    community: Community,
    operation: CommunityOperation,
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
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
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['channelId', 'visibleRoleIds'],
    );

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
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['name', 'permissions', 'roleId'],
    );

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
  ): void {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['identityId', 'roleIds'],
    );

    community.assignRoles(
      operation.getAuthorIdentityId(),
      new IdentityId(reader.string('identityId')),
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
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['identityId', 'method'],
      ['reference'],
    );
    const method = new CommunityJoinMethod(reader.string('method'));

    assert(
      (reader.optionalString('reference') === undefined) ===
        method.isEqual(CommunityJoinMethod.ADDED),
      new InvalidCommunityOperationError(),
    );

    community.joinAs(
      operation.getAuthorIdentityId(),
      new IdentityId(reader.string('identityId')),
      method,
    );
  }

  /** Builds the community a genesis operation creates. */
  public static create(operation: CommunityOperation): Community {
    assert(operation.isGenesis(), new InvalidCommunityOperationError());

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

  /** Applies a non genesis operation; throws when it is not permitted. */
  public static apply(
    community: Community,
    operation: CommunityOperation,
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
        operation.getCommunityId().isEqual(community.getId()) &&
        operation.getNetworkId().isEqual(community.getNetworkId()),
      new InvalidCommunityOperationError(),
    );

    handler(community, operation);
  }
}
