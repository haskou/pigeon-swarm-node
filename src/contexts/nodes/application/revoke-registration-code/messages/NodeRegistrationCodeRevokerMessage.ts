import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';

export class NodeRegistrationCodeRevokerMessage {
  public readonly id: NodeRegistrationCodeId;

  constructor(id: string) {
    this.id = new NodeRegistrationCodeId(id);
  }
}
