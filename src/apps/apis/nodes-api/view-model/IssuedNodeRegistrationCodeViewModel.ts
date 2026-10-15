import { IssuedNodeRegistrationCode } from '@app/contexts/nodes/application/issue-registration-code/IssuedNodeRegistrationCode';

import { IssuedNodeRegistrationCodeResource } from '../resources/IssuedNodeRegistrationCodeResource';

export class IssuedNodeRegistrationCodeViewModel {
  constructor(private readonly issued: IssuedNodeRegistrationCode) {}

  public toResource(): IssuedNodeRegistrationCodeResource {
    const primitives = this.issued.code.toPrimitives();

    return {
      code: this.issued.secret.valueOf(),
      expiresAt: primitives.expiresAt,
      id: primitives.id,
      maxUses: primitives.maxUses,
    };
  }
}
