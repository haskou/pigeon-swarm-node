import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeRegistrationModeChangerMessage {
  public readonly registrationMode: NodeRegistrationMode;
  public readonly authenticatedIdentityId: IdentityId;

  constructor(registrationMode: string, authenticatedIdentityId: string) {
    this.registrationMode =
      NodeRegistrationMode.fromPrimitives(registrationMode);
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
