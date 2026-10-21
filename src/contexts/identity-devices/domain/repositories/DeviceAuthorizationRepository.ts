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

  /**
   * Stores the genesis authorization of a published identity version. An
   * identity whose genesis this node already holds (stored, verified or
   * provisioned) keeps it: a different genesis, even a second validly signed
   * version 1, rejects with DeviceAuthorizationGenesisConflictError before
   * anything is remembered or written, so its enrolled and revoked devices are
   * never reset. The check never waits on the network.
   */
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
