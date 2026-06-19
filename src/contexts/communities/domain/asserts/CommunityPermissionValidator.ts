import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { CommunityChannelPermissions } from '../entities/channels/CommunityChannelPermissions';
import { CommunityMembership } from '../entities/membership/CommunityMembership';
import { CommunityPermissionDeniedError } from '../errors/CommunityPermissionDeniedError';
import { CommunityPermission } from '../value-objects/CommunityPermission';
import { CommunityOwnerValidator } from './CommunityOwnerValidator';

export class CommunityPermissionValidator {
  public static assertCanAccessChannel(
    ownerIdentityId: IdentityId,
    membership: CommunityMembership,
    identityId: IdentityId,
    permissions: CommunityChannelPermissions,
  ): void {
    assert(
      CommunityPermissionValidator.canAccessChannel(
        ownerIdentityId,
        membership,
        identityId,
        permissions,
      ),
      new CommunityPermissionDeniedError(
        CommunityPermission.VIEW_CHANNELS.valueOf(),
      ),
    );
  }

  public static assertHasPermission(
    ownerIdentityId: IdentityId,
    membership: CommunityMembership,
    identityId: IdentityId,
    permission: CommunityPermission,
  ): void {
    assert(
      CommunityPermissionValidator.hasPermission(
        ownerIdentityId,
        membership,
        identityId,
        permission,
      ),
      new CommunityPermissionDeniedError(permission.valueOf()),
    );
  }

  public static canAccessChannel(
    ownerIdentityId: IdentityId,
    membership: CommunityMembership,
    identityId: IdentityId,
    permissions: CommunityChannelPermissions,
  ): boolean {
    return (
      CommunityOwnerValidator.isOwner(ownerIdentityId, identityId) ||
      membership.memberHasAnyRole(identityId, permissions.getVisibleRoleIds())
    );
  }

  public static hasPermission(
    ownerIdentityId: IdentityId,
    membership: CommunityMembership,
    identityId: IdentityId,
    permission: CommunityPermission,
  ): boolean {
    return (
      CommunityOwnerValidator.isOwner(ownerIdentityId, identityId) ||
      (membership.isMember(identityId) &&
        membership.memberHasPermission(identityId, permission))
    );
  }
}
