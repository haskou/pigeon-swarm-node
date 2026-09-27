import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PrivateGenesisProjectionAuthorizer } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisProjectionAuthorizer';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationScopeId } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationScopeId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

export default class PrivateCommunityGenesisAuthorizer extends PrivateGenesisProjectionAuthorizer {
  public authorize(
    scopeId: PrivateAuthorizationScopeId,
    ownerIdentityId: IdentityId,
    projection: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      const community = Community.fromPrimitives(
        projection as ReturnType<Community['toPrimitives']>,
      );

      assert(
        community.isPrivateGenesisFor(
          new CommunityId(scopeId.valueOf()),
          ownerIdentityId,
        ),
        new InvalidPrivateAuthorizationError(),
      );

      return community.toPrimitives();
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
