import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';

export class NodeRegistrationModeChangerMessage {
  public readonly registrationMode: NodeRegistrationMode;

  constructor(registrationMode: string) {
    this.registrationMode =
      NodeRegistrationMode.fromPrimitives(registrationMode);
  }
}
