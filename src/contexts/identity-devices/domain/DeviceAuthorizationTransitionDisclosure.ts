import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';

/**
 * The part of a device-authorization transition log one reader may verify,
 * every entry exactly as its author signed it.
 */
export class DeviceAuthorizationTransitionDisclosure {
  private readonly recoveries: DeviceAuthorizationTransition[];
  private readonly concurrentRecoveries: DeviceAuthorizationTransition[];
  private readonly transitions: DeviceAuthorizationTransition[];

  public constructor(
    private readonly identityId: IdentityId,
    recoveries: DeviceAuthorizationTransition[],
    concurrentRecoveries: DeviceAuthorizationTransition[],
    transitions: DeviceAuthorizationTransition[],
  ) {
    this.recoveries = [...recoveries];
    this.concurrentRecoveries = [...concurrentRecoveries];
    this.transitions = [...transitions];
  }

  /** Only the entries that land above a revision the reader already verified. */
  public after(
    revision: DeviceAuthorizationRevision,
  ): DeviceAuthorizationTransitionDisclosure {
    const landsAfter = (transition: DeviceAuthorizationTransition): boolean =>
      transition.getRevision().isGreaterThan(revision);

    return new DeviceAuthorizationTransitionDisclosure(
      this.identityId,
      this.recoveries.filter(landsAfter),
      this.concurrentRecoveries.filter(landsAfter),
      this.transitions.filter(landsAfter),
    );
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getRecoveries(): DeviceAuthorizationTransition[] {
    return [...this.recoveries];
  }

  public getConcurrentRecoveries(): DeviceAuthorizationTransition[] {
    return [...this.concurrentRecoveries];
  }

  public getTransitions(): DeviceAuthorizationTransition[] {
    return [...this.transitions];
  }
}
