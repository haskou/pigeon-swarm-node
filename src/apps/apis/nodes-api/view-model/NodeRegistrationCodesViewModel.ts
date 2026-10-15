import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';

import { NodeRegistrationCodesResource } from '../resources/NodeRegistrationCodesResource';

export class NodeRegistrationCodesViewModel {
  constructor(private readonly codes: NodeRegistrationCode[]) {}

  public toResource(): NodeRegistrationCodesResource {
    return {
      codes: this.codes.map((code) => {
        const primitives = code.toPrimitives();

        return {
          expiresAt: primitives.expiresAt,
          id: primitives.id,
          maxUses: primitives.maxUses,
          usesLeft: primitives.usesLeft,
        };
      }),
    };
  }
}
