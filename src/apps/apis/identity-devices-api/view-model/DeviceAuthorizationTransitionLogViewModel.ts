import { DeviceAuthorizationTransitionDisclosure } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionDisclosure';

import { DeviceAuthorizationTransitionLogResource } from '../resources/DeviceAuthorizationTransitionLogResource';

export class DeviceAuthorizationTransitionLogViewModel {
  public constructor(
    private readonly disclosure: DeviceAuthorizationTransitionDisclosure,
  ) {}

  public toResource(): DeviceAuthorizationTransitionLogResource {
    return {
      concurrentRecoveries: this.disclosure
        .getConcurrentRecoveries()
        .map((transition) => transition.toPrimitives()),
      identityId: this.disclosure.getIdentityId().valueOf(),
      recoveries: this.disclosure
        .getRecoveries()
        .map((transition) => transition.toPrimitives()),
      transitions: this.disclosure
        .getTransitions()
        .map((transition) => transition.toPrimitives()),
    };
  }
}
