import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';

import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';
import { DeviceCompromisedCredentialPrimitives } from './DeviceAuthorizationTransitionPrimitives';
import { DeviceCompromisedCredential } from './DeviceAuthorizationTransitionState';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

/**
 * The compromise caps in effect for one identity: each compromised credential
 * and the revision from which it is refused. A cap only tightens, so the
 * lowest revision a credential is ever capped at is the one that holds.
 */
export class DeviceCompromiseCaps {
  private constructor(
    private readonly caps: readonly DeviceCompromisedCredential[],
  ) {}

  private tighten(entry: DeviceCompromisedCredential): DeviceCompromiseCaps {
    const existing = this.caps.find((cap) =>
      cap.credential.isEqual(entry.credential),
    );

    if (existing === undefined) {
      return new DeviceCompromiseCaps([...this.caps, entry]);
    }

    if (!existing.compromisedSince.isGreaterThan(entry.compromisedSince)) {
      return this;
    }

    return new DeviceCompromiseCaps(
      this.caps.map((cap) => (cap === existing ? entry : cap)),
    );
  }

  public static none(): DeviceCompromiseCaps {
    return new DeviceCompromiseCaps([]);
  }

  /** The caps a recovery carries forward across its checkpoint. */
  public static carriedBy(
    recovery: DeviceAuthorizationTransition,
  ): DeviceCompromiseCaps {
    return new DeviceCompromiseCaps(recovery.getCompromisedCredentials());
  }

  /**
   * The caps after an accepted transition: the caps it carries and, for a
   * compromised revocation, the cap on its target.
   */
  public withCompromise(
    transition: DeviceAuthorizationTransition,
  ): DeviceCompromiseCaps {
    const carried = transition
      .getCompromisedCredentials()
      .reduce<DeviceCompromiseCaps>(
        (caps, entry) => caps.tighten(entry),
        this,
      );
    const compromisedSince = transition.getCompromisedSince();

    return compromisedSince !== undefined && transition.isRevocation()
      ? carried.tighten({
          compromisedSince,
          credential: transition.getTargetCredential(),
        })
      : carried;
  }

  /**
   * Whether the credential is refused at this revision: a cap refuses the
   * revision it names and every later one.
   */
  public isCompromisedAt(
    credential: DeviceCredential,
    revision: DeviceAuthorizationRevision,
  ): boolean {
    const cap = this.caps.find((entry) => entry.credential.isEqual(credential));

    return (
      cap !== undefined && revision.isGreaterOrEqualThan(cap.compromisedSince)
    );
  }

  /**
   * Whether `next` keeps every cap here at least as tight. A later checkpoint
   * may tighten a cap or add one, never drop or loosen one.
   */
  public isNotLoosenedBy(next: DeviceCompromiseCaps): boolean {
    return this.caps.every((cap) =>
      next.isCompromisedAt(cap.credential, cap.compromisedSince),
    );
  }

  /**
   * Whether a recovery carries exactly these caps: dropping or adding one is
   * refused.
   */
  public isCarriedBy(recovery: DeviceAuthorizationTransition): boolean {
    const carried = recovery.getCompromisedCredentials();

    return (
      carried.length === this.caps.length &&
      carried.every((entry) =>
        this.caps.some(
          (cap) =>
            cap.credential.isEqual(entry.credential) &&
            cap.compromisedSince.isEqual(entry.compromisedSince),
        ),
      )
    );
  }

  public toPrimitives(): DeviceCompromisedCredentialPrimitives[] {
    return this.caps.map((cap) => ({
      compromisedSince: cap.compromisedSince.valueOf(),
      credential: cap.credential.valueOf(),
    }));
  }
}
