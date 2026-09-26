import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PrivateGenesisProjectionAuthorizer } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisProjectionAuthorizer';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export default class PrivateCommunityGenesisAuthorizer extends PrivateGenesisProjectionAuthorizer {
  private validProjection(
    community: Community,
    scopeId: string,
    ownerIdentityId: string,
  ): boolean {
    const owner = new IdentityId(ownerIdentityId);
    const value = community.toPrimitives();

    return (
      community.isIdentifiedBy(new CommunityId(scopeId)) &&
      community.isOwner(owner) &&
      value.memberIds.length === 1 &&
      value.memberIds[0] === ownerIdentityId &&
      value.bannedMemberIds.length === 0 &&
      value.visibility === 'private' &&
      !value.discoverable &&
      !value.autoJoinEnabled
    );
  }

  public authorize(
    scopeId: string,
    ownerIdentityId: string,
    projection: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      const community = Community.fromPrimitives(
        projection as ReturnType<Community['toPrimitives']>,
      );

      if (!this.validProjection(community, scopeId, ownerIdentityId)) {
        throw new InvalidPrivateAuthorizationError();
      }

      return community.toPrimitives();
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
