import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class NodeRegistrationModeWasChanged extends DomainEvent {
  public static EVENT_NAME = 'nodes.v1.node.registration_mode.was_changed';

  public constructor(
    aggregateId: string,
    public readonly attributes: {
      registrationMode: string;
    },
  ) {
    super(aggregateId);
  }

  public eventName(): string {
    return NodeRegistrationModeWasChanged.EVENT_NAME;
  }
}
