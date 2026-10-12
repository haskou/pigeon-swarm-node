import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityPrimitivesShape } from '@app/contexts/communities/domain/CommunityPrimitivesShape';
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
    if (!CommunityPrimitivesShape.isCommunityPrimitives(projection)) {
      throw new InvalidPrivateAuthorizationError();
    }

    try {
      const community = Community.fromPrimitives(projection);

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
