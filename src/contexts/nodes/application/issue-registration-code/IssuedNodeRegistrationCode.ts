import { NodeRegistrationCode } from '../../domain/NodeRegistrationCode';
import { NodeRegistrationCodeSecret } from '../../domain/value-objects/NodeRegistrationCodeSecret';

/** A freshly issued code together with its secret, which is never stored. */
export class IssuedNodeRegistrationCode {
  constructor(
    public readonly code: NodeRegistrationCode,
    public readonly secret: NodeRegistrationCodeSecret,
  ) {}
}
