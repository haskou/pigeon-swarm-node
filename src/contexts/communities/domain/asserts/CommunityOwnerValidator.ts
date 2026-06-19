import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { CommunityOwnerMismatchError } from '../errors/CommunityOwnerMismatchError';

export class CommunityOwnerValidator {
  public static assertIsOwner(
    ownerIdentityId: IdentityId,
    identityId: IdentityId,
  ): void {
    assert(
      CommunityOwnerValidator.isOwner(ownerIdentityId, identityId),
      new CommunityOwnerMismatchError(),
    );
  }

  public static isOwner(
    ownerIdentityId: IdentityId,
    identityId: IdentityId,
  ): boolean {
    return ownerIdentityId.isEqual(identityId);
  }
}
