import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { assert } from '@haskou/value-objects';

import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceAuthorizationTransition } from './DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionDisclosure } from './DeviceAuthorizationTransitionDisclosure';
import { InvalidDeviceAuthorizationTransitionError } from './errors/InvalidDeviceAuthorizationTransitionError';

/**
 * The signed device-authorization transitions this node replays for one
 * identity: the recovery lineage behind the replay base, the recoveries that
 * lost its checkpoints, and the accepted history in replay order, with every
 * replayed state from the base to the head. A client verifies these itself
 * with the shared replay rules, so the node adds no trust of its own.
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

  /** The recovery authority of the identity; a recovery keeps it. */
  public getRecoveryAuthority(): RecoveryAuthority {
    return this.states[0].getRecoveryAuthority();
  }

  /**
   * The whole signed log. Every entry is public: each carries its author's
   * signature and a client replays it with the shared rules, so the node adds
   * no trust of its own. The history is disclosed to any served caller by
   * design: a first-contact sender replays it to verify a sealing view.
   */
  public disclose(): DeviceAuthorizationTransitionDisclosure {
    return new DeviceAuthorizationTransitionDisclosure(
      this.states[0].getIdentityId(),
      this.recoveries,
      this.concurrentRecoveries,
      this.transitions,
    );
  }
}
