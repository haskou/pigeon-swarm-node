import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PublicMutationAuthorPrimitives } from '../domain/PublicMutationProofPrimitives';
import { PublicMutationAuthorAuthorization } from '../domain/services/PublicMutationAuthorAuthorization';

/** Authorizes an author when its device is in the identity's current head. */
export default class DeviceAuthorizationPublicMutationAuthorization extends PublicMutationAuthorAuthorization {
  constructor(private readonly repository: DeviceAuthorizationRepository) {
    super();
  }

  public async isAuthorized(
    author: PublicMutationAuthorPrimitives,
  ): Promise<boolean> {
    const authorization = await this.repository.find(
      new IdentityId(author.identityId),
    );

    return (
      authorization?.isAuthorized(
        DeviceCredential.fromIdentityId(
          new IdentityId(author.deviceCredential),
        ),
      ) ?? false
    );
  }
}
