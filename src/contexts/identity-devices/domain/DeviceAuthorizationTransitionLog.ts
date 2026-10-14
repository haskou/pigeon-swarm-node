import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { assert } from '@haskou/value-objects';

import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionDisclosure } from './DeviceAuthorizationTransitionDisclosure';
import { DeviceAuthorizationTransitionReader } from './DeviceAuthorizationTransitionReader';
import { InvalidDeviceAuthorizationTransitionError } from './errors/InvalidDeviceAuthorizationTransitionError';

/**
 * The signed device-authorization transitions this node replays for one
 * identity: the recovery lineage behind the replay base, the recoveries that
 * lost its checkpoints, and the accepted history in replay order, with every
 * replayed state from the base to the head. A client verifies these itself
 * with the shared replay rules, so the node adds no trust of its own; it only
 * decides how much of the log each reader may read.
 */
export class DeviceAuthorizationTransitionLog {
  private readonly recoveries: DeviceAuthorizationTransition[];
  private readonly concurrentRecoveries: DeviceAuthorizationTransition[];
  private readonly transitions: DeviceAuthorizationTransition[];
  private readonly states: DeviceAuthorization[];

  public constructor(
    recoveries: DeviceAuthorizationTransition[],
    concurrentRecoveries: DeviceAuthorizationTransition[],
    transitions: DeviceAuthorizationTransition[],
    states: DeviceAuthorization[],
  ) {
    assert(states.length > 0, new InvalidDeviceAuthorizationTransitionError());
    this.recoveries = [...recoveries];
    this.concurrentRecoveries = [...concurrentRecoveries];
    this.transitions = [...transitions];
    this.states = [...states];
  }

  /**
   * A device reads the history up to and including the revision group that
   * removed it, never anything signed after it left; a device in no replayed
   * state reads none of the history.
   */
  private transitionsDisclosedTo(
    credential: DeviceCredential,
  ): DeviceAuthorizationTransition[] {
    const lastAuthorizedRevision = this.states
      .findLast((state) => state.isAuthorized(credential))
      ?.getRevision();

    if (lastAuthorizedRevision === undefined) {
      return [];
    }

    return this.transitions.filter(
      (transition) =>
        !transition.getPreviousRevision().isGreaterThan(lastAuthorizedRevision),
    );
  }

  /**
   * The recovery authority of the identity reads everything and any other
   * authority nothing. Every device reads the recovery lineage, so one whose
   * states a recovery discarded still finds the recovery that ended its epoch.
   */
  public disclosedTo(
    reader: DeviceAuthorizationTransitionReader,
  ): DeviceAuthorizationTransitionDisclosure {
    const [base] = this.states;
    const isRecoveryAuthority = reader instanceof RecoveryAuthority;

    if (isRecoveryAuthority && !reader.isEqual(base.getRecoveryAuthority())) {
      return new DeviceAuthorizationTransitionDisclosure(
        base.getIdentityId(),
        [],
        [],
        [],
      );
    }

    return new DeviceAuthorizationTransitionDisclosure(
      base.getIdentityId(),
      this.recoveries,
      this.concurrentRecoveries,
      isRecoveryAuthority
        ? this.transitions
        : this.transitionsDisclosedTo(reader),
    );
  }
}
