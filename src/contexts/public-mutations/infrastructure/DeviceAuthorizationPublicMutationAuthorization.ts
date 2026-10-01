import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PublicMutationAuthorPrimitives } from '../domain/PublicMutationProofPrimitives';
import { PublicMutationAuthorAuthorization } from '../domain/services/PublicMutationAuthorAuthorization';
import { ShortLivedLookup } from './ShortLivedLookup';

/** Authorizes an author when its device is in the identity's current head. */
export default class DeviceAuthorizationPublicMutationAuthorization extends PublicMutationAuthorAuthorization {
  private readonly lookups = new ShortLivedLookup<
    DeviceAuthorization | undefined
  >();

  constructor(private readonly repository: DeviceAuthorizationRepository) {
    super();
  }

  public async isAuthorized(
    author: PublicMutationAuthorPrimitives,
  ): Promise<boolean> {
    const authorization = await this.lookups.get(author.identityId, () =>
      this.repository.find(new IdentityId(author.identityId)),
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
