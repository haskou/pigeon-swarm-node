import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorization } from '../DeviceAuthorization';
import { DeviceAuthorizationTimeline } from '../DeviceAuthorizationTimeline';
import { DeviceAuthorizationTransition } from '../DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionLog } from '../DeviceAuthorizationTransitionLog';
import { DeviceCompromiseCaps } from '../DeviceCompromiseCaps';

export abstract class DeviceAuthorizationRepository {
  public abstract compareAndApply(
    transition: DeviceAuthorizationTransition,
  ): Promise<DeviceAuthorization>;

  public abstract has(identityId: IdentityId): Promise<boolean>;

  /** Rejects with DeviceAuthorizationNotFoundError when none is provisioned. */
  public abstract require(identityId: IdentityId): Promise<DeviceAuthorization>;

  /**
   * Every replayable authorization state of the identity, not only its head.
   * Rejects with DeviceAuthorizationNotFoundError when none is provisioned.
   */
  public abstract requireTimeline(
    identityId: IdentityId,
  ): Promise<DeviceAuthorizationTimeline>;

  /**
   * Every signed transition the identity's authorization replays, exactly as
   * recorded. Rejects with DeviceAuthorizationNotFoundError when none is
   * provisioned.
   */
  public abstract requireTransitionLog(
    identityId: IdentityId,
  ): Promise<DeviceAuthorizationTransitionLog>;

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
