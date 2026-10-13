import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorization } from '../DeviceAuthorization';
import { DeviceAuthorizationTimeline } from '../DeviceAuthorizationTimeline';
import { DeviceAuthorizationTransition } from '../DeviceAuthorizationTransition';
import { DeviceCompromiseCaps } from '../DeviceCompromiseCaps';

export abstract class DeviceAuthorizationRepository {
  public abstract compareAndApply(
    transition: DeviceAuthorizationTransition,
  ): Promise<DeviceAuthorization>;

  public abstract find(
    identityId: IdentityId,
  ): Promise<DeviceAuthorization | undefined>;

  /** Every replayable authorization state of the identity, not only its head. */
  public abstract findTimeline(
    identityId: IdentityId,
  ): Promise<DeviceAuthorizationTimeline | undefined>;

  /** The caps in effect at the head. */
  public abstract findCompromisedSince(
    identityId: IdentityId,
  ): Promise<DeviceCompromiseCaps>;

  public abstract provision(
    authorization: DeviceAuthorization,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void>;

  public abstract withdrawProvision(
    identityId: IdentityId,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void>;
}
