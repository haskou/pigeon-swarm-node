import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorizationTimeline } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTimeline';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PublicMutationPendingError } from '../domain/errors/PublicMutationPendingError';
import { PublicMutationAuthorPrimitives } from '../domain/PublicMutationAuthorPrimitives';
import { PublicMutationAuthorAuthorization } from '../domain/services/PublicMutationAuthorAuthorization';
import { ShortLivedLookup } from './ShortLivedLookup';

/**
 * Authorizes an author when its device belonged to the identity's replayed
 * authorization state at the revision the proof signed, so a later revocation
 * never reaches back before its own revision. A revision the local chain has
 * not reached yet, or an identity whose chain has not arrived, is held: it
 * rejects with `PublicMutationPendingError` and is never trusted.
 */
export default class DeviceAuthorizationPublicMutationAuthorization extends PublicMutationAuthorAuthorization {
  private readonly lookups =
    new ShortLivedLookup<DeviceAuthorizationTimeline>();

  constructor(private readonly repository: DeviceAuthorizationRepository) {
    super();
  }

  public async isAuthorized(
    author: PublicMutationAuthorPrimitives,
  ): Promise<boolean> {
    const identityId = new IdentityId(author.identityId);
    const revision = new DeviceAuthorizationRevision(
      author.authorizationRevision,
    );
    const timeline = await this.lookups.get(author.identityId, async () =>
      (await this.repository.has(identityId))
        ? this.repository.requireTimeline(identityId)
        : new DeviceAuthorizationTimeline([]),
    );

    if (!timeline.hasReached(revision)) {
      throw new PublicMutationPendingError();
    }

    return timeline.isAuthorizedAt(
      DeviceCredential.fromWire(author.deviceCredential),
      revision,
    );
  }
}
