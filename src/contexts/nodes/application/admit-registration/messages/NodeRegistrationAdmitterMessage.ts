import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';

export class NodeRegistrationAdmitterMessage {
  public readonly code?: NodeRegistrationCodeSecret;

  /**
   * @param isCreation whether the request creates an identity this node does
   * not hold yet; nothing else is gated.
   * @param code the registration code the client presented, if any.
   */
  constructor(
    public readonly isCreation: boolean,
    code?: string,
  ) {
    this.code = code ? new NodeRegistrationCodeSecret(code) : undefined;
  }
}
